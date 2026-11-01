/* PDF 文字项 → 段落 —— 纯函数，可单测。
 *
 * 为什么需要这一层：PDF 里没有「段落」「行」这种结构，只有「在坐标 (x, y) 画一串字」。
 * pdf.js 的 getTextContent() 给出的是一堆零散文字项，一行可能被拆成好几项，
 * 顺序也不保证是阅读顺序。要导出成 Word 段落，只能按坐标把它们重新拼起来。
 *
 * 输入是自己定义的简化结构（不依赖 pdf.js 的类型），组件负责从 pdf.js 的 TextItem 转过来。
 * 坐标是 PDF 用户空间：原点在左下角，y 向上（所以「下一行」的 y 更小）。
 *
 * 规则（都是启发式，参数取值见下面的常量注释）：
 * 1. 聚行：y 相差不超过字高一半的算同一行；行内按 x 从左到右排。
 * 2. 补空格：同一行相邻两项之间有明显间距时补一个空格，但两边都是中日韩字符时不补
 *    （中文排版里字间距是两端对齐撑出来的，不是空格）。
 * 3. 断段：行距明显大于本页常规行距，或者上一行明显没写到版心右边（段落最后一行），就断段。
 *    同一段的行与行之间按同样的中英文规则接上。
 *
 * 不处理（界面上写明）：多栏排版（同一高度的左右两栏会被拼成一行）、表格、竖排文字、
 * 页眉页脚识别。这些要做版面分析，超出「提取文字」的范围。
 *
 * 为什么不用 pdf.js 的 hasEOL：它是 pdf.js 按同样的坐标推出来的，而且常挂在空白文字项上
 * （空白项在这里会被丢掉）。坐标聚行已经覆盖它的信息，再混用一个来源只会多一种不一致。
 */

export interface TextRun {
  str: string
  /** 文字基线起点，PDF 用户空间 */
  x: number
  y: number
  /** 这一项的水平宽度 */
  width: number
  /** 字高（约等于字号）；0 或缺失时用本页字高中位数兜底 */
  height: number
}

export interface TextLine {
  text: string
  /** 行的基线 y（取这一行字号最大的项，即正文） */
  y: number
  /** 行内字高的中位数 */
  height: number
  left: number
  right: number
}

/** 聚行容差：y 差 ≤ 字高 × 0.5 算同一行。常规行距至少 1 倍字高，0.5 不会把上下两行并到一起，又能吸收上下标的小偏移 */
export const LINE_TOLERANCE = 0.5
/** 补空格阈值：间距 > 字高 × 0.15。英文空格宽约 0.25~0.33 字高，字间微调通常 < 0.1 */
export const SPACE_GAP_RATIO = 0.15
/** 断段阈值一：行距 > 本页常规行距（中位数）× 1.4。段间距通常是行距的 1.5 倍以上 */
export const PARAGRAPH_GAP_RATIO = 1.4
/** 断段阈值二：上一行右端离版心右边超过版心宽度的 20%。取 20% 而不是更小，是给不两端对齐的英文留余量（行尾差一个长单词） */
export const SHORT_LINE_RATIO = 0.2

/** 中日韩字符（含全角标点和全角字母）：两个这种字符之间不补空格 */
const WIDE_RE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3134f}]/u
/** 全角标点：任意一侧是它都不补空格（「中文，English」里逗号后不该有空格） */
const WIDE_PUNCT_RE = /[　-〿︰-﹏＀-／：-＠［-｀｛-･]/

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 按码点取首尾字符（Array.from 不会把生僻字的代理对拆成两半） */
function firstChar(text: string): string {
  return Array.from(text.trimStart())[0] ?? ''
}

function lastChar(text: string): string {
  const chars = Array.from(text.trimEnd())
  return chars[chars.length - 1] ?? ''
}

/** 两个相邻字符之间该不该有空格（只看字符种类，不看间距） */
export function spaceBetween(left: string, right: string): boolean {
  if (left === '' || right === '') return false
  if (WIDE_PUNCT_RE.test(left) || WIDE_PUNCT_RE.test(right)) return false
  return !(WIDE_RE.test(left) && WIDE_RE.test(right))
}

function append(text: string, next: string, wantSpace: boolean): string {
  if (text === '') return next
  // 已经有空白就不再补，避免「Hello  world」双空格
  if (!wantSpace || /\s$/.test(text) || /^\s/.test(next)) return text + next
  return `${text} ${next}`
}

const collapseSpaces = (text: string) => text.replace(/\s+/g, ' ').trim()

/** 把文字项聚成行，按从上到下排序 */
export function groupLines(runs: TextRun[]): TextLine[] {
  // 纯空白项丢掉：它们的作用（隔开单词）由坐标间距重新推出来
  const valid = runs.filter((run) => run.str.trim() !== '' && Number.isFinite(run.x) && Number.isFinite(run.y))
  if (valid.length === 0) return []
  const fallbackHeight = median(valid.map((run) => run.height).filter((h) => h > 0)) || 10
  const items = valid.map((run) => ({
    ...run,
    width: Math.max(0, run.width),
    height: run.height > 0 ? run.height : fallbackHeight,
  }))
  items.sort((a, b) => b.y - a.y || a.x - b.x)

  // 和「行锚点」（这一行第一个归入的项）比，而不是和上一项比：逐项比会一点点漂移，把斜着的几行串成一行。
  // 容差取两者中较大的字高：上标字小、又排在最上面，常常是锚点，按小字高算会把正文挤到下一行
  const groups: (typeof items)[] = []
  let anchorY = 0
  let anchorHeight = 0
  for (const item of items) {
    const current = groups[groups.length - 1]
    if (current && Math.abs(anchorY - item.y) <= LINE_TOLERANCE * Math.max(anchorHeight, item.height)) {
      current.push(item)
      anchorHeight = Math.max(anchorHeight, item.height)
    } else {
      groups.push([item])
      anchorY = item.y
      anchorHeight = item.height
    }
  }

  return groups.map((group) => {
    // 行的 y 取最大字号那一项（正文），上下标的偏移不该影响行距统计
    const lineY = group.reduce((tallest, item) => (item.height > tallest.height ? item : tallest)).y
    group.sort((a, b) => a.x - b.x)
    let text = ''
    let prevEnd = -Infinity
    let prevHeight = 0
    for (const item of group) {
      const gap = item.x - prevEnd
      const wantSpace = text !== ''
        && gap > SPACE_GAP_RATIO * Math.min(prevHeight, item.height)
        && spaceBetween(lastChar(text), firstChar(item.str))
      text = append(text, item.str, wantSpace)
      prevEnd = Math.max(prevEnd, item.x + item.width)
      prevHeight = item.height
    }
    return {
      text: collapseSpaces(text),
      y: lineY,
      height: median(group.map((item) => item.height)),
      left: group[0].x,
      right: Math.max(...group.map((item) => item.x + item.width)),
    }
  })
}

/** 同一段里上下两行怎么接：行尾是英文连字符就直接接上，否则按中英文规则决定要不要空格 */
export function joinLines(upper: string, lower: string): string {
  if (upper === '') return lower
  if (lower === '') return upper
  // 分不清是断词（infor-mation）还是复合词（well-known），保留连字符直接接：宁可多一个 -，不吞字符
  if (/[A-Za-z]-$/.test(upper)) return upper + lower
  return append(upper, lower, spaceBetween(lastChar(upper), firstChar(lower)))
}

/** 把已排好序的行拼成段落 */
export function linesToParagraphs(lines: TextLine[]): string[] {
  if (lines.length === 0) return []
  const gaps = lines.slice(1).map((line, index) => lines[index].y - line.y)
  const normalGap = median(gaps.filter((gap) => gap > 0))
  // 版心：所有行的最左到最右。表格行、长网址等超宽行会把它撑大，这是已知的误差来源
  const bodyLeft = Math.min(...lines.map((line) => line.left))
  const bodyRight = Math.max(...lines.map((line) => line.right))
  const bodyWidth = bodyRight - bodyLeft

  const paragraphs: string[] = []
  let current = lines[0].text
  for (let i = 1; i < lines.length; i++) {
    const gap = gaps[i - 1]
    const loose = normalGap > 0 && gap > PARAGRAPH_GAP_RATIO * normalGap
    const short = bodyWidth > 0 && lines[i - 1].right < bodyRight - SHORT_LINE_RATIO * bodyWidth
    if (loose || short) {
      paragraphs.push(current)
      current = lines[i].text
    } else {
      current = joinLines(current, lines[i].text)
    }
  }
  paragraphs.push(current)
  return paragraphs.filter((paragraph) => paragraph !== '')
}

/** 一页的文字项 → 段落 */
export function layoutParagraphs(runs: TextRun[]): string[] {
  return linesToParagraphs(groupLines(runs))
}

/** 字数：不含空白的码点数（中文习惯的「字数」，一个汉字算一个） */
export function countChars(paragraphs: string[]): number {
  return paragraphs.reduce((sum, paragraph) => sum + Array.from(paragraph.replace(/\s/g, '')).length, 0)
}

/** 导出 .txt：段落之间换行，页与页之间空一行；没有文字的页跳过 */
export function pagesToText(pages: string[][]): string {
  return pages.filter((page) => page.length > 0).map((page) => page.join('\n')).join('\n\n')
}
