/* 文本统计 —— 纯函数，可单测。
 *
 * 中文和英文的「字数」算法不同，这是最容易搞错的地方：
 * - 英文字数按「词」数，不是字母数。
 * - 中文字数按「字」数（每个汉字算一个字），没有空格。
 * 所以分开数：汉字个数 + 英文单词数 + 数字串数 = 中英混排的「字数」（见 TextStats.total）。
 * 标点、符号、空白不算进「字数」，但标点算进「字符数」。
 */

export interface TextStats {
  /** 字符数：按用户看到的「一个字」数（字素簇），不含空白和换行。👨‍👩‍👧、🇨🇳、é 各算 1 个 */
  chars: number
  /** 汉字个数（Han 文字，含扩展区） */
  chinese: number
  /** 英文单词数：连续字母算一个词，don't、e-mail、café 各算 1 个 */
  words: number
  /** 数字串个数：连续数字算一个，3.14、1,000 也算 1 个 */
  numbers: number
  /** 字数 = 汉字 + 英文单词 + 数字串。不含标点、符号、emoji */
  total: number
  /** 段落数：非空行的行数（中文习惯一段一个换行，不靠空行分段） */
  paragraphs: number
  /** 行数：编辑器里看到的行数，空行也算；全空白文本为 0 */
  lines: number
  /** 预计阅读时长（分钟，向上取整，至少 1）；没有可读内容（空文本、只有标点）为 0 */
  readingMinutes: number
}

/**
 * 字素簇计数器。Intl.Segmenter 是浏览器自带的 Unicode 断字实现：
 * 「👨‍👩‍👧」是 5 个码点（3 个人 + 2 个零宽连接符），「🇨🇳」是 2 个区域指示符，
 * 「é」可能是 e + 组合重音两个码点 —— 按码点数都会多算，用户看到的都只是一个字。
 * 极老的浏览器没有 Segmenter（Firefox 125 之前），退回按码点数，差别只在 emoji 和组合字符上。
 */
function countGraphemes(text: string): number {
  if (typeof Intl.Segmenter !== 'function') {
    let count = 0
    for (const ch of text) if (!/\s/u.test(ch)) count += 1
    return count
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let count = 0
  for (const { segment } of segmenter.segment(text)) {
    if (!/^\s+$/u.test(segment)) count += 1
  }
  return count
}

/**
 * 能组成「英文单词」的字符：字母（含 é、ü 这类带重音的）和组合附加符号，
 * 但排除汉字、假名、谚文 —— 它们不靠空格分词，混进来「你好world」就成了一个词。
 */
function isWordLetter(ch: string): boolean {
  return /[\p{L}\p{M}]/u.test(ch) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)
}

const isDigit = (ch: string) => ch >= '0' && ch <= '9'

/** 夹在两个字母之间时不断词的连接符：英文撇号、弯撇号（don’t）、连字符（e-mail） */
const WORD_JOINERS = new Set(["'", '’', '-'])
/** 夹在两个数字之间时不断开的符号：小数点、千位分隔符（3.14、1,000） */
const NUMBER_JOINERS = new Set(['.', ','])

/**
 * 逐字符扫描分类，而不是一串正则替换。
 * 用正则把「汉字、单词、数字」一次性匹配出来更快，但混排边界
 * （比如「你好world」中英无缝相接）容易漏词，逐字符状态机更稳。
 *
 * 分词前先做 NFKC 归一：全角「ＡＢＣ１２３」在中文输入法下很常见，
 * 不归一就既不是字母也不是数字，整串被当成标点，单词数为 0。
 * 字符数用原文算（归一可能改变字符个数，用户关心的是自己看到的字）。
 */
export function analyzeText(text: string): TextStats {
  const chars = countGraphemes(text)
  const normalized = Array.from(text.normalize('NFKC'))

  let chinese = 0
  let words = 0
  let numbers = 0
  let inWord = false
  let inNumber = false

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (/\p{Script=Han}/u.test(ch)) {
      chinese += 1
      inWord = false
      inNumber = false
    } else if (isWordLetter(ch)) {
      // 进入新单词才 +1；单词内的后续字母不重复计
      if (!inWord) words += 1
      inWord = true
      inNumber = false
    } else if (isDigit(ch)) {
      if (!inNumber) numbers += 1
      inNumber = true
      inWord = false
    } else if (inWord && WORD_JOINERS.has(ch) && isWordLetter(normalized[i + 1] ?? '')) {
      // don't 的撇号、e-mail 的连字符：后面紧跟字母才算词内，保持 inWord 不变
    } else if (inNumber && NUMBER_JOINERS.has(ch) && isDigit(normalized[i + 1] ?? '')) {
      // 3.14 的小数点：后面紧跟数字才算数内
    } else {
      // 空白、标点、符号、emoji：打断状态，不计数
      inWord = false
      inNumber = false
    }
  }

  const rawLines = text.split(/\r\n|\r|\n/)
  const paragraphs = rawLines.filter((line) => line.trim().length > 0).length
  const lines = paragraphs === 0 ? 0 : rawLines.length

  // 阅读时长：中文（和数字）按 300 字/分钟、英文按 200 词/分钟估，分别折算再相加。
  // 判空用「有没有可读的字」而不是字符数：一屏标点不需要读 1 分钟
  const minutes = (chinese + numbers) / 300 + words / 200
  const readingMinutes = minutes === 0 ? 0 : Math.max(1, Math.ceil(minutes))

  return {
    chars,
    chinese,
    words,
    numbers,
    total: chinese + words + numbers,
    paragraphs,
    lines,
    readingMinutes,
  }
}
