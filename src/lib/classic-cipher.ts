/* 古典密码 —— 凯撒密码 + 摩斯电码。纯函数，可单测。
 *
 * 两者都只是「换一种写法」，没有任何安全性：凯撒只有 25 种偏移，挨个试一遍就破了；
 * 摩斯是公开的对照表。放在编码转换工具里，就是为了好玩和教学。
 */

// ---------- 凯撒密码 ----------

/** 把任意整数偏移归一到 0..25。JS 的 % 对负数返回负数（-3 % 26 === -3），所以要再加一次 26 */
function normalizeShift(shift: number): number {
  const whole = Number.isFinite(shift) ? Math.trunc(shift) : 0
  return ((whole % 26) + 26) % 26
}

/**
 * 凯撒加密：A-Z、a-z 各自在本字母表内循环移位，大小写保持；其他字符（数字、中文、标点）原样不动。
 * 偏移可以是负数（等于反向移），也可以大于 26（按 26 取模）。小数会被截断成整数。
 */
export function caesarEncrypt(text: string, shift: number): string {
  const k = normalizeShift(shift)
  if (k === 0) return text
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) out += String.fromCharCode(((code - 65 + k) % 26) + 65)
    else if (code >= 97 && code <= 122) out += String.fromCharCode(((code - 97 + k) % 26) + 97)
    else out += char
  }
  return out
}

/** 凯撒解密 = 反向移位 */
export function caesarDecrypt(text: string, shift: number): string {
  return caesarEncrypt(text, -normalizeShift(shift))
}

// ---------- 摩斯电码 ----------

/** 国际摩斯电码（ITU-R M.1677-1）：字母、数字和常见标点。不含中文 —— 中文电报用的是四位数字的「中文电码」，是另一套体系 */
export const MORSE_TABLE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
  J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
}

const REVERSE_MORSE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MORSE_TABLE).map(([char, code]) => [code, char]),
)

export interface MorseResult {
  value: string
  /** 表里没有、被原样保留的字符（去重，按首次出现顺序）。非空时界面要提示用户 */
  unsupported: string[]
}

/**
 * 文字 → 摩斯电码。字母之间用一个空格、单词之间用 " / " 分隔（常见的书面写法）。
 * 摩斯不分大小写，小写先转大写。表里没有的字符（中文、emoji、#…）原样放进结果并记进 unsupported，
 * 而不是悄悄丢掉 —— 丢掉的话用户看不出原文少了一块。
 */
export function encodeMorse(text: string): MorseResult {
  const unsupported: string[] = []
  const words = text.trim().split(/\s+/).filter((word) => word !== '')
  const encoded = words.map((word) =>
    [...word].map((char) => {
      const code = MORSE_TABLE[char.toUpperCase()]
      if (code) return code
      if (!unsupported.includes(char)) unsupported.push(char)
      return char
    }).join(' '),
  )
  return { value: encoded.join(' / '), unsupported }
}

/**
 * 摩斯电码 → 文字（大写，摩斯本身不记录大小写）。
 * 单词分隔认 / 或 |；也认 · • 和 — – 这些长得像点划的符号（从网页复制来的常见情况）。
 * 认不出的码组原样保留并记进 unsupported。
 */
export function decodeMorse(input: string): MorseResult {
  const unsupported: string[] = []
  // 下划线不当划处理：有的写法用 _ 表示划，有的拿它当分隔符，猜错会解出错字；认不出的就原样报告
  const normalized = input.replace(/[·•∙]/g, '.').replace(/[—–−]/g, '-')
  const words = normalized.trim().split(/\s*[/|]\s*/).filter((word) => word.trim() !== '')
  const decoded = words.map((word) =>
    word.trim().split(/\s+/).map((code) => {
      const char = REVERSE_MORSE[code]
      if (char) return char
      if (!unsupported.includes(code)) unsupported.push(code)
      return code
    }).join(''),
  )
  return { value: decoded.join(' '), unsupported }
}
