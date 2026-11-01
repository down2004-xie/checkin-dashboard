/* 文本差分 —— 纯函数，可单测。
 *
 * 算法：Myers O(ND) 差分（E. W. Myers, "An O(ND) Difference Algorithm and Its Variations", 1986），
 * 用论文 4b 节的「中间蛇」线性空间版本：从两头同时找最短编辑路径，在中间相遇处切成两半递归。
 * 移植自 diff-match-patch 的 diff_bisect，改成在整数数组的下标区间上做，不切子串。
 *
 * 为什么不用 LCS 动态规划：LCS 要一张 N×M 的表，两边各 5000 行就是 2500 万格（Int32 约 100 MB），
 * 手机上直接爆内存。Myers 只要 O(N+M) 的内存，时间 O((N+M)·D)，D 是编辑距离 ——
 * 两段文字通常大部分相同，D 很小，几乎是线性的。最坏情况（两边完全不同）退化到 O(N·M) 时间，
 * 所以还是要给行数上限（MAX_LINES）。
 *
 * 分两层：先按行比（每行映射成整数 id，比较就是比整数），再把相邻的「删 + 增」行配对，
 * 按字素（Intl.Segmenter，emoji 和带声调的组合字不会被拆开）做第二次差分，标出行内改了哪几个字。
 */

export type EditKind = 'equal' | 'insert' | 'delete'

/** 一段连续的同类操作：equal 同时消耗两边各 count 项，delete 只消耗旧的，insert 只消耗新的 */
export interface Edit {
  kind: EditKind
  count: number
}

type Seq = ArrayLike<number>

function push(out: Edit[], kind: EditKind, count: number): void {
  if (count <= 0) return
  const last = out[out.length - 1]
  if (last && last.kind === kind) last.count += count
  else out.push({ kind, count })
}

/**
 * 找中间蛇的切分点（相对 a/b 的绝对下标）。返回 null 表示两段没有任何公共项，
 * 此时最优解就是「全删 + 全增」。
 * 前置条件：调用方已经裁掉公共前缀和后缀，且两段都非空。
 */
function middleSnake(a: Seq, aStart: number, aEnd: number, b: Seq, bStart: number, bEnd: number): [number, number] | null {
  const n = aEnd - aStart
  const m = bEnd - bStart
  const maxD = Math.ceil((n + m) / 2)
  const offset = maxD
  const size = 2 * maxD + 2
  // v1[k] = 正向在对角线 k 上走到的最远 x；v2 同理但从尾部倒着走。-1 表示还没走到
  const v1 = new Int32Array(size).fill(-1)
  const v2 = new Int32Array(size).fill(-1)
  v1[offset + 1] = 0
  v2[offset + 1] = 0
  const delta = n - m
  // 两边长度差为奇数时，正向先碰到反向走过的路；偶数时反向先碰到
  const front = delta % 2 !== 0
  // 走出网格的对角线不用再算，收窄 k 的范围
  let k1start = 0
  let k1end = 0
  let k2start = 0
  let k2end = 0
  for (let d = 0; d < maxD; d += 1) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1Off = offset + k1
      let x1 = k1 === -d || (k1 !== d && v1[k1Off - 1] < v1[k1Off + 1]) ? v1[k1Off + 1] : v1[k1Off - 1] + 1
      let y1 = x1 - k1
      while (x1 < n && y1 < m && a[aStart + x1] === b[bStart + y1]) { x1 += 1; y1 += 1 }
      v1[k1Off] = x1
      if (x1 > n) k1end += 2
      else if (y1 > m) k1start += 2
      else if (front) {
        const k2Off = offset + delta - k1
        if (k2Off >= 0 && k2Off < size && v2[k2Off] !== -1 && x1 >= n - v2[k2Off]) return [aStart + x1, bStart + y1]
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2Off = offset + k2
      let x2 = k2 === -d || (k2 !== d && v2[k2Off - 1] < v2[k2Off + 1]) ? v2[k2Off + 1] : v2[k2Off - 1] + 1
      let y2 = x2 - k2
      while (x2 < n && y2 < m && a[aEnd - 1 - x2] === b[bEnd - 1 - y2]) { x2 += 1; y2 += 1 }
      v2[k2Off] = x2
      if (x2 > n) k2end += 2
      else if (y2 > m) k2start += 2
      else if (!front) {
        const k1Off = offset + delta - k2
        if (k1Off >= 0 && k1Off < size && v1[k1Off] !== -1) {
          const x1 = v1[k1Off]
          const y1 = x1 - (k1Off - offset)
          if (x1 >= n - x2) return [aStart + x1, bStart + y1]
        }
      }
    }
  }
  return null
}

function diffRange(a: Seq, aStart: number, aEnd: number, b: Seq, bStart: number, bEnd: number, out: Edit[]): void {
  // 先裁公共前缀 / 后缀：真实文本的差异通常集中在中间一小段，这一步能把问题规模砍掉一大半
  let prefix = 0
  while (aStart + prefix < aEnd && bStart + prefix < bEnd && a[aStart + prefix] === b[bStart + prefix]) prefix += 1
  push(out, 'equal', prefix)
  const aFrom = aStart + prefix
  const bFrom = bStart + prefix
  let suffix = 0
  while (aEnd - suffix > aFrom && bEnd - suffix > bFrom && a[aEnd - 1 - suffix] === b[bEnd - 1 - suffix]) suffix += 1
  const aTo = aEnd - suffix
  const bTo = bEnd - suffix

  if (aFrom === aTo) push(out, 'insert', bTo - bFrom)
  else if (bFrom === bTo) push(out, 'delete', aTo - aFrom)
  else {
    const split = middleSnake(a, aFrom, aTo, b, bFrom, bTo)
    if (split) {
      diffRange(a, aFrom, split[0], b, bFrom, split[1], out)
      diffRange(a, split[0], aTo, b, split[1], bTo, out)
    } else {
      push(out, 'delete', aTo - aFrom)
      push(out, 'insert', bTo - bFrom)
    }
  }
  push(out, 'equal', suffix)
}

/** 两个整数序列的最短编辑脚本。相邻同类操作已合并 */
export function diffSequences(a: Seq, b: Seq): Edit[] {
  const out: Edit[] = []
  diffRange(a, 0, a.length, b, 0, b.length, out)
  return out
}
// ---------- 按行比较 + 行内字级差分 ----------

/** 每边最多比较多少行。超出部分截掉并提示：两边各 5000 行、完全不同的最坏情况约几千万次比较，再多主线程就卡了 */
export const MAX_LINES = 5000
/** 每边最多多少字（UTF-16 码元）。超过就不算：拆行、建索引都要整段过一遍，几十 MB 的粘贴会卡住页面 */
export const MAX_CHARS = 1_000_000
/** 一行超过这么长（UTF-16 码元）就不做行内差分，整行标出 */
const MAX_PAIR_UNITS = 2000
/** 一次对比里行内差分的总字数预算：很多长行都改了的时候，后面的行整行标出，保证不卡 */
const MAX_REFINE_UNITS = 200_000
/** 两行相同的字占比低于这个值，就当成「整行重写」：硬配对只会标出一堆碎片，反而看不清 */
const MIN_SIMILARITY = 0.3

export interface DiffOptions {
  /** 比较时忽略每行首尾的空白（缩进、行尾空格） */
  ignoreWhitespace: boolean
  /** 比较时忽略大小写 */
  ignoreCase: boolean
}

export interface Segment {
  text: string
  /** true = 这一段是行内真正改动的字 */
  changed: boolean
}

export interface DiffRow {
  kind: EditKind
  /** 旧文本里的行号（从 1 开始），insert 行为 null */
  oldLine: number | null
  /** 新文本里的行号，delete 行为 null */
  newLine: number | null
  /**
   * 行内容切段。没做行内差分时只有一段，changed 为 false（整行的颜色由 kind 决定）。
   * equal 行显示新文本那一侧（忽略大小写/空白时两边可能不完全一样）。
   */
  segments: Segment[]
}

export interface DiffResult {
  rows: DiffRow[]
  added: number
  removed: number
  /** 是否有一边超过 MAX_LINES 被截断 */
  truncated: boolean
  oldLines: number
  newLines: number
}

/** 拆行：兼容 \r\n；末尾的换行不算多出一个空行（和 git 一致），空文本是 0 行 */
export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r\n|\r|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

type Splitter = (text: string) => string[]

/** 优先按字素切（👨‍👩‍👧 算一个字），没有 Intl.Segmenter 的老环境退回按码点切（至少不会切开代理对） */
function graphemeSplitter(): Splitter {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return (text) => Array.from(segmenter.segment(text), (part) => part.segment)
  }
  return (text) => Array.from(text)
}

const normalize = (text: string, options: DiffOptions) => {
  const trimmed = options.ignoreWhitespace ? text.trim() : text
  return options.ignoreCase ? trimmed.toLowerCase() : trimmed
}

/** 把字符串数组映射成整数 id 数组：之后差分只比整数，长行也只比一次 */
function interner(): (key: string) => number {
  const ids = new Map<string, number>()
  return (key) => {
    let id = ids.get(key)
    if (id === undefined) { id = ids.size; ids.set(key, id) }
    return id
  }
}

function mergeSegments(parts: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const part of parts) {
    if (part.text === '') continue
    const last = out[out.length - 1]
    if (last && last.changed === part.changed) last.text += part.text
    else out.push({ ...part })
  }
  return out
}

/**
 * 对一对「删 + 增」行做字级差分，返回两边各自的切段。
 * 忽略首尾空白时，首尾空白不参与比较、也不标红绿（否则「开了选项还是标出一片缩进」）。
 * 返回 null 表示不值得细分（太长或太不像），由调用方整行标出。
 */
export function refinePair(oldText: string, newText: string, options: DiffOptions, split: Splitter = graphemeSplitter()): { old: Segment[]; new: Segment[]; units: number } | null {
  const edges = (text: string) => {
    if (!options.ignoreWhitespace) return { lead: '', core: text, trail: '' }
    const lead = /^\s*/.exec(text)?.[0] ?? ''
    const core = text.trim()
    return { lead, core, trail: text.slice(lead.length + core.length) }
  }
  const before = edges(oldText)
  const after = edges(newText)
  // 先按 UTF-16 长度挡掉超长行：切字素本身也要花时间，不能切完再判断
  if (before.core.length > MAX_PAIR_UNITS || after.core.length > MAX_PAIR_UNITS) return null
  const a = split(before.core)
  const b = split(after.core)
  const units = a.length + b.length

  const id = interner()
  const key = (unit: string) => id(options.ignoreCase ? unit.toLowerCase() : unit)
  const edits = diffSequences(a.map(key), b.map(key))
  const same = edits.reduce((sum, edit) => (edit.kind === 'equal' ? sum + edit.count : sum), 0)
  const longest = Math.max(a.length, b.length)
  if (longest > 0 && same / longest < MIN_SIMILARITY) return null

  const oldParts: Segment[] = [{ text: before.lead, changed: false }]
  const newParts: Segment[] = [{ text: after.lead, changed: false }]
  let i = 0
  let j = 0
  for (const edit of edits) {
    if (edit.kind === 'equal') {
      oldParts.push({ text: a.slice(i, i + edit.count).join(''), changed: false })
      newParts.push({ text: b.slice(j, j + edit.count).join(''), changed: false })
      i += edit.count
      j += edit.count
    } else if (edit.kind === 'delete') {
      oldParts.push({ text: a.slice(i, i + edit.count).join(''), changed: true })
      i += edit.count
    } else {
      newParts.push({ text: b.slice(j, j + edit.count).join(''), changed: true })
      j += edit.count
    }
  }
  oldParts.push({ text: before.trail, changed: false })
  newParts.push({ text: after.trail, changed: false })
  return { old: mergeSegments(oldParts), new: mergeSegments(newParts), units }
}

const whole = (text: string): Segment[] => [{ text, changed: false }]

/**
 * 按行对比两段文本，输出统一视图的行列表。
 * 一段连续的改动块里，先列出所有删除行、再列出所有新增行（和 git diff 的统一格式一致），
 * 删除行和新增行按顺序一一配对做行内差分，多出来的行整行标出。
 */
export function diffText(oldText: string, newText: string, options: DiffOptions): DiffResult {
  const allOld = splitLines(oldText)
  const allNew = splitLines(newText)
  const truncated = allOld.length > MAX_LINES || allNew.length > MAX_LINES
  const oldLines = allOld.slice(0, MAX_LINES)
  const newLines = allNew.slice(0, MAX_LINES)

  const id = interner()
  const edits = diffSequences(oldLines.map((line) => id(normalize(line, options))), newLines.map((line) => id(normalize(line, options))))

  const split = graphemeSplitter()
  const rows: DiffRow[] = []
  let budget = MAX_REFINE_UNITS
  let i = 0
  let j = 0
  let added = 0
  let removed = 0
  for (let e = 0; e < edits.length; e += 1) {
    const edit = edits[e]
    if (edit.kind === 'equal') {
      for (let t = 0; t < edit.count; t += 1) {
        rows.push({ kind: 'equal', oldLine: i + 1, newLine: j + 1, segments: whole(newLines[j]) })
        i += 1
        j += 1
      }
      continue
    }
    // 收集一整段连续的改动（delete 和 insert 可能交替出现），再统一配对
    let deleteCount = 0
    let insertCount = 0
    while (e < edits.length && edits[e].kind !== 'equal') {
      if (edits[e].kind === 'delete') deleteCount += edits[e].count
      else insertCount += edits[e].count
      e += 1
    }
    e -= 1
    const deletedRows: DiffRow[] = []
    const insertedRows: DiffRow[] = []
    for (let t = 0; t < deleteCount; t += 1) deletedRows.push({ kind: 'delete', oldLine: i + t + 1, newLine: null, segments: whole(oldLines[i + t]) })
    for (let t = 0; t < insertCount; t += 1) insertedRows.push({ kind: 'insert', oldLine: null, newLine: j + t + 1, segments: whole(newLines[j + t]) })
    const pairs = Math.min(deleteCount, insertCount)
    for (let t = 0; t < pairs && budget > 0; t += 1) {
      const refined = refinePair(oldLines[i + t], newLines[j + t], options, split)
      if (!refined) continue
      budget -= refined.units
      deletedRows[t].segments = refined.old
      insertedRows[t].segments = refined.new
    }
    rows.push(...deletedRows, ...insertedRows)
    removed += deleteCount
    added += insertCount
    i += deleteCount
    j += insertCount
  }
  return { rows, added, removed, truncated, oldLines: allOld.length, newLines: allNew.length }
}
