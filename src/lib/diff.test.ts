import { describe, expect, it } from 'vitest'

import { MAX_LINES, diffSequences, diffText, refinePair, splitLines, type DiffResult, type Edit } from './diff'

const plain = { ignoreWhitespace: false, ignoreCase: false }

/** 用编辑脚本从 a 重建 b：脚本正确的话一定能还原 */
function apply(a: number[], b: number[], edits: Edit[]): { fromA: number[]; toB: number[] } {
  const fromA: number[] = []
  const toB: number[] = []
  let i = 0
  let j = 0
  for (const edit of edits) {
    if (edit.kind === 'equal') {
      for (let t = 0; t < edit.count; t += 1) { expect(a[i]).toBe(b[j]); fromA.push(a[i]); toB.push(b[j]); i += 1; j += 1 }
    } else if (edit.kind === 'delete') {
      for (let t = 0; t < edit.count; t += 1) { fromA.push(a[i]); i += 1 }
    } else {
      for (let t = 0; t < edit.count; t += 1) { toB.push(b[j]); j += 1 }
    }
  }
  return { fromA, toB }
}

/** O(N·M) 的教科书 LCS，只在测试里当「标准答案」 */
function lcsLength(a: number[], b: number[]): number {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1])
  }
  return table[a.length][b.length]
}

/** 固定种子伪随机（mulberry32），保证测试可复现 */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const kinds = (result: DiffResult) => result.rows.map((row) => row.kind[0]).join('')
const changedText = (segments: { text: string; changed: boolean }[]) => segments.filter((s) => s.changed).map((s) => s.text)

describe('diffSequences（Myers）', () => {
  it('随机序列：脚本能还原两边，且公共部分等于 LCS 长度（即最短编辑）', () => {
    const random = rng(42)
    for (let round = 0; round < 400; round += 1) {
      const gen = () => Array.from({ length: Math.floor(random() * 30) }, () => Math.floor(random() * 4))
      const a = gen()
      const b = gen()
      const edits = diffSequences(a, b)
      const { fromA, toB } = apply(a, b, edits)
      expect(fromA).toEqual(a)
      expect(toB).toEqual(b)
      const same = edits.filter((e) => e.kind === 'equal').reduce((sum, e) => sum + e.count, 0)
      expect(same, `a=${a} b=${b}`).toBe(lcsLength(a, b))
    }
  })

  it('相邻同类操作已合并', () => {
    expect(diffSequences([1, 2, 3], [4, 5, 6])).toEqual([{ kind: 'delete', count: 3 }, { kind: 'insert', count: 3 }])
    expect(diffSequences([], [])).toEqual([])
  })

  it('5000 行、大量重复行（空行、括号）且改动很多时也不卡死', () => {
    const random = rng(7)
    const gen = () => Array.from({ length: MAX_LINES }, () => Math.floor(random() * 20))
    const a = gen()
    const b = gen()
    const start = Date.now()
    const edits = diffSequences(a, b)
    const elapsed = Date.now() - start
    const { fromA, toB } = apply(a, b, edits)
    expect(fromA).toEqual(a)
    expect(toB).toEqual(b)
    expect(elapsed).toBeLessThan(3000)
  })

  it('5000 行全不同也能在合理时间内算完', () => {
    const a = Array.from({ length: MAX_LINES }, (_, i) => i)
    const b = Array.from({ length: MAX_LINES }, (_, i) => i + MAX_LINES)
    const start = Date.now()
    const edits = diffSequences(a, b)
    expect(edits).toEqual([{ kind: 'delete', count: MAX_LINES }, { kind: 'insert', count: MAX_LINES }])
    expect(Date.now() - start).toBeLessThan(3000)
  })
})

describe('splitLines', () => {
  it('空文本 0 行，末尾换行不多算一行，兼容 CRLF', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\r\nb')).toEqual(['a', 'b'])
    expect(splitLines('\n')).toEqual([''])
  })
})

describe('diffText', () => {
  it('完全相同', () => {
    const result = diffText('a\nb\nc', 'a\nb\nc', plain)
    expect(kinds(result)).toBe('eee')
    expect([result.added, result.removed]).toEqual([0, 0])
  })

  it('全不同：先列删除再列新增，行号各走各的', () => {
    const result = diffText('a\nb', 'x\ny\nz', plain)
    expect(kinds(result)).toBe('ddiii')
    expect([result.added, result.removed]).toEqual([3, 2])
    expect(result.rows.map((r) => [r.oldLine, r.newLine])).toEqual([[1, null], [2, null], [null, 1], [null, 2], [null, 3]])
  })

  it('中间插入', () => {
    const result = diffText('a\nb\nc', 'a\nb\nnew\nc', plain)
    expect(kinds(result)).toBe('eeie')
    expect(result.rows[2]).toMatchObject({ kind: 'insert', oldLine: null, newLine: 3 })
    expect(result.rows[3]).toMatchObject({ kind: 'equal', oldLine: 3, newLine: 4 })
    expect([result.added, result.removed]).toEqual([1, 0])
  })

  it('首尾删除', () => {
    const result = diffText('head\na\nb\ntail', 'a\nb', plain)
    expect(kinds(result)).toBe('deed')
    expect(result.rows[0].segments[0].text).toBe('head')
    expect(result.rows[3]).toMatchObject({ kind: 'delete', oldLine: 4 })
    expect([result.added, result.removed]).toEqual([0, 2])
  })

  it('空输入', () => {
    expect(diffText('', '', plain).rows).toEqual([])
    expect(kinds(diffText('', 'a\nb', plain))).toBe('ii')
    expect(kinds(diffText('a\nb', '', plain))).toBe('dd')
  })

  it('中文字级差分：只标出改动的字', () => {
    const result = diffText('今天天气很好', '今天天气不好', plain)
    expect(kinds(result)).toBe('di')
    expect(changedText(result.rows[0].segments)).toEqual(['很'])
    expect(changedText(result.rows[1].segments)).toEqual(['不'])
    // 段拼回去等于原行
    expect(result.rows[1].segments.map((s) => s.text).join('')).toBe('今天天气不好')
  })

  it('emoji 按字素整体比较，不会拆出半个', () => {
    const pair = refinePair('打卡👨‍👩‍👧完成', '打卡👍完成', plain)
    expect(pair && changedText(pair.old)).toEqual(['👨‍👩‍👧'])
    expect(pair && changedText(pair.new)).toEqual(['👍'])
  })

  it('两行几乎完全不同时不做字级差分，整行标出', () => {
    const result = diffText('abcdefgh', 'xyz12345', plain)
    expect(result.rows.every((row) => row.segments.length === 1 && !row.segments[0].changed)).toBe(true)
  })

  it('选项：忽略首尾空白', () => {
    expect(kinds(diffText('  a\nb  ', 'a\nb', plain))).toBe('ddii')
    const result = diffText('  a\nb  ', 'a\nb', { ignoreWhitespace: true, ignoreCase: false })
    expect(kinds(result)).toBe('ee')
    // equal 行显示新文本那一侧
    expect(result.rows[0].segments[0].text).toBe('a')
    // 行内差分时缩进不标红
    const pair = refinePair('    foo = 1', 'foo = 2', { ignoreWhitespace: true, ignoreCase: false })
    expect(pair && changedText(pair.old)).toEqual(['1'])
  })

  it('选项：忽略大小写', () => {
    expect(kinds(diffText('Hello\nWorld', 'hello\nWORLD', plain))).toBe('ddii')
    expect(kinds(diffText('Hello\nWorld', 'hello\nWORLD', { ignoreWhitespace: false, ignoreCase: true }))).toBe('ee')
    const pair = refinePair('Hello World', 'hello world!', { ignoreWhitespace: false, ignoreCase: true })
    expect(pair && changedText(pair.new)).toEqual(['!'])
  })

  it('超过 MAX_LINES 截断并标记', () => {
    const big = Array.from({ length: MAX_LINES + 10 }, (_, i) => `line ${i}`).join('\n')
    const result = diffText(big, 'x', plain)
    expect(result.truncated).toBe(true)
    expect(result.oldLines).toBe(MAX_LINES + 10)
    expect(result.removed).toBe(MAX_LINES)
  })
})
