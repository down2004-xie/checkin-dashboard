/* 文本统计 —— 纯函数，可单测。
 *
 * 中文和英文的「字数」算法不同，这是最容易搞错的地方：
 * - 英文字数按「词」数（空格切分），不是字母数。
 * - 中文字数按「字」数（每个汉字算一个字），没有空格。
 * 所以统计时要分开数：汉字个数 + 英文单词个数 ≈ 中英混排的「字数」。
 * 标点、数字、空白另行归类。
 */

export interface TextStats {
  /** 总字符数（含所有可见字符，不含换行/空白） */
  chars: number
  /** 汉字个数（CJK 统一表意文字） */
  chinese: number
  /** 英文单词数（连续字母算一个词） */
  words: number
  /** 数字串个数（连续数字算一个） */
  numbers: number
  /** 段落数（按换行切分，忽略空行） */
  paragraphs: number
  /** 行数（非空行） */
  lines: number
  /** 预计阅读时长（分钟，向上取整，至少 1；空文本为 0） */
  readingMinutes: number
}

/**
 * 逐字符扫描分类，而不是一串正则替换。
 * 用正则把「汉字、单词、数字」一次性匹配出来更快，但混排边界
 * （比如「你好world」中英无缝相接）容易漏词，逐字符状态机更稳。
 */
export function analyzeText(text: string): TextStats {
  let chars = 0
  let chinese = 0
  let words = 0
  let numbers = 0
  let inWord = false
  let inNumber = false

  for (const ch of text) {
    // 换行和空白：不计入字符，但会打断「当前在单词/数字里」的状态
    if (/\s/.test(ch)) {
      inWord = false
      inNumber = false
      continue
    }
    chars += 1
    if (/\p{Script=Han}/u.test(ch)) {
      chinese += 1
      inWord = false
      inNumber = false
    } else if (/[A-Za-z]/.test(ch)) {
      // 进入新单词才 +1；单词内的后续字母不重复计
      if (!inWord) words += 1
      inWord = true
      inNumber = false
    } else if (/[0-9]/.test(ch)) {
      if (!inNumber) numbers += 1
      inNumber = true
      inWord = false
    } else {
      // 标点、符号：打断状态，但不额外计数
      inWord = false
      inNumber = false
    }
  }

  const nonEmptyLines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  // 段落按「空行」分隔：连续非空行算一段。用正则切分「一个或多个空行」。
  const paragraphs = text.split(/\n\s*\n/).filter((block) => block.trim().length > 0).length

  // 阅读时长：中文按 300 字/分钟、英文按 200 词/分钟估，混合时分别折算再相加
  const minutes = chinese / 300 + words / 200
  const readingMinutes = chars === 0 ? 0 : Math.max(1, Math.ceil(minutes))

  return {
    chars,
    chinese,
    words,
    numbers,
    paragraphs,
    lines: nonEmptyLines.length,
    readingMinutes,
  }
}
