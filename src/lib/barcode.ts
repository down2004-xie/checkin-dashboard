/* Code 128 条形码编码器 —— 纯算法，不 import React，可单测。
 *
 * 为什么自己实现而不用库：Code 128 的模式表是公开标准（ISO/IEC 15417），
 * 107 个符号字符（值 0–106）每个对应一段固定宽度的 1/0 位串。把表写死、
 * 按公式算校验和即可，不引入依赖，也便于在简历里讲清楚原理。
 *
 * 实现两个字符集：
 * - Code Set B：可编码 ASCII 32–126（空格、数字、大小写字母、常见符号），默认用它。
 * - Code Set C：每个符号装**两位数字**（值 00–99）。纯数字内容（快递单号、会员号）
 *   用它条码宽度几乎减半，扫码更容易。只在「整串都是数字」时启用，见 shouldUseCodeC。
 * 混合内容（如 ABC123456）中途切换字符集能再省一点，但规则复杂、收益小，没做。
 */

/**
 * 标准 Code 128 模式表（值 0–106）。
 * 每个是 11 模块宽的 "1"/"0" 字符串（'1' = bar，'0' = space），
 * 唯一例外是 106（STOP），为 13 模块 "1100011101011"。
 *
 * 这是公开标准表，顺序与值一一对应，不要凭手感改任何一位 ——
 * 错一位，扫出来的就是另一个字符。
 */
export const CODE128_PATTERNS: readonly string[] = [
  '11011001100', // 0
  '11001101100', // 1
  '11001100110', // 2
  '10010011000', // 3
  '10010001100', // 4
  '10001001100', // 5
  '10011001000', // 6
  '10011000100', // 7
  '10001100100', // 8
  '11001001000', // 9
  '11001000100', // 10
  '11000100100', // 11
  '10110011100', // 12
  '10011011100', // 13
  '10011001110', // 14
  '10111001100', // 15
  '10011101100', // 16
  '10011100110', // 17
  '11001110010', // 18
  '11001011100', // 19
  '11001001110', // 20
  '11011100100', // 21
  '11001110100', // 22
  '11101101110', // 23
  '11101001100', // 24
  '11100101100', // 25
  '11100100110', // 26
  '11101100100', // 27
  '11100110100', // 28
  '11100110010', // 29
  '11011011000', // 30
  '11011000110', // 31
  '11000110110', // 32
  '10100011000', // 33
  '10001011000', // 34
  '10001000110', // 35
  '10110001000', // 36
  '10001101000', // 37
  '10001100010', // 38
  '11010001000', // 39
  '11000101000', // 40
  '11000100010', // 41
  '10110111000', // 42
  '10110001110', // 43
  '10001101110', // 44
  '10111011000', // 45
  '10111000110', // 46
  '10001110110', // 47
  '11101110110', // 48
  '11010001110', // 49
  '11000101110', // 50
  '11011101000', // 51
  '11011100010', // 52
  '11011101110', // 53
  '11101011000', // 54
  '11101000110', // 55
  '11100010110', // 56
  '11101101000', // 57
  '11101100010', // 58
  '11100011010', // 59
  '11101111010', // 60
  '11001000010', // 61
  '11110001010', // 62
  '10100110000', // 63
  '10100001100', // 64
  '10010110000', // 65
  '10010000110', // 66
  '10000101100', // 67
  '10000100110', // 68
  '10110010000', // 69
  '10110000100', // 70
  '10011010000', // 71
  '10011000010', // 72
  '10000110100', // 73
  '10000110010', // 74
  '11000010010', // 75
  '11001010000', // 76
  '11110111010', // 77
  '11000010100', // 78
  '10001111010', // 79
  '10100111100', // 80
  '10010111100', // 81
  '10010011110', // 82
  '10111100100', // 83
  '10011110100', // 84
  '10011110010', // 85
  '11110100100', // 86
  '11110010100', // 87
  '11110010010', // 88
  '11011011110', // 89
  '11011110110', // 90
  '11110110110', // 91
  '10101111000', // 92
  '10100011110', // 93
  '10001011110', // 94
  '10111101000', // 95
  '10111100010', // 96
  '11110101000', // 97
  '11110100010', // 98
  '10111011110', // 99
  '10111101110', // 100
  '11101011110', // 101
  '11110101110', // 102
  '11010000100', // 103 START A
  '11010010000', // 104 START B
  '11010011100', // 105 START C
  '1100011101011', // 106 STOP（13 模块）
]

/** 起始符 START B 的值。 */
export const START_B = 104
/** 起始符 START C 的值。 */
export const START_C = 105
/** 在 Code Set C 里写这个值 = 「后面切换到 Code Set B」（CODE B 字符）。 */
export const CODE_B_IN_C = 100
/** 终止符 STOP 的值（比普通字符多 2 个模块）。 */
export const STOP = 106
/** 校验和取模的基数。 */
const MODULO = 103
/** Code B 中字符 ASCII 码到符号值的固定偏移（值 = ASCII - 32）。 */
const CODE_B_OFFSET = 32

/**
 * 内容长度上限（实际编码的字符数）。
 * 为什么是 80：Code B 每字符 11 模块、每模块画 3px，80 字符的画布约 2.8k 像素宽，
 * 已经远超一般扫码枪 / 手机摄像头一次能看清的宽度（实用的 Code 128 很少超过 40 字符）。
 * 不设上限时贴进 2000 字符，画布宽度超出浏览器 canvas 上限，canvas 不报错、只画成空白，
 * 下载也拿不到图 —— 用户只看到「没反应」。
 */
export const MAX_BARCODE_LENGTH = 80

export type CodeSet = 'B' | 'C'

export interface Code128Result {
  /** 逐模块的条空序列，true = bar（黑条），false = space（白空） */
  modules: boolean[]
  /** 实际被编码的文本（已剔除不支持的字符）；空结果时为空串 */
  text: string
  /** 计算出的校验和（0–102）；空结果时为 0 */
  checksum: number
  /** 起始字符集；空结果时为 'B' */
  codeSet: CodeSet
  /** 完整符号值序列（START + 数据 + 校验 + STOP），便于测试和调试；空结果时为空数组 */
  values: number[]
}

/**
 * 纯数字内容是否改用 Code Set C。比的是「数据符号个数」，谁少用谁：
 * - Code B：n 个数字 = n 个符号。
 * - Code C：偶数位 = n/2 个；奇数位 = (n-1)/2 对 + 1 个「切到 B」+ 1 个 B 字符。
 * 结果是：偶数位 ≥ 2 位、奇数位 ≥ 5 位时 C 更短；3 位时打平，留在 B（少一次切换更简单）。
 */
export function shouldUseCodeC(text: string): boolean {
  if (!/^\d+$/.test(text)) return false
  const n = text.length
  return n % 2 === 0 ? n >= 2 : n >= 5
}

/** Code C 数据值：两位一组（"12" → 12）；奇数位时最后一位切回 Code B 单独编 */
function codeCValues(digits: string): number[] {
  const values: number[] = []
  const pairEnd = digits.length - (digits.length % 2)
  for (let i = 0; i < pairEnd; i += 2) values.push(Number(digits.slice(i, i + 2)))
  if (pairEnd < digits.length) {
    values.push(CODE_B_IN_C, digits.charCodeAt(pairEnd) - CODE_B_OFFSET)
  }
  return values
}

/**
 * 把任意文本编码成 Code 128 模块序列（纯数字走 Code Set C，其余走 Code Set B）。
 *
 * 非法字符策略：**静默忽略** ASCII < 32 或 > 126 的字符（如换行、Tab、中文）。
 * 选择忽略而非抛错，是因为这个工具面向「粘贴一段文字/网址」，多行粘贴很常见，
 * 直接报错会让体验很硬。代价是调用方要知道「返回值里的 text 才是真正编码的内容」——
 * 若 text 比入参短，说明有字符被丢弃了。
 *
 * 空串、或全部字符都不支持时，返回 { modules: [], text: '', checksum: 0 }。
 */
export function encodeCode128(input: string): Code128Result {
  // 1. 过滤出可编码字符（ASCII 32–126），同时得到「真正被编码的文本」
  let text = ''
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    if (code >= 32 && code <= 126) text += input[i]
  }
  if (text.length === 0) {
    return { modules: [], text: '', checksum: 0, codeSet: 'B', values: [] }
  }

  // 2. 选字符集并算数据值。Code B：值 = ASCII - 32（0–95）；Code C：两位数字一组（00–99）
  const codeSet: CodeSet = shouldUseCodeC(text) ? 'C' : 'B'
  const start = codeSet === 'C' ? START_C : START_B
  const dataValues = codeSet === 'C'
    ? codeCValues(text)
    : Array.from(text, (ch) => ch.charCodeAt(0) - CODE_B_OFFSET)

  // 3. 校验和 = (起始值 + Σ i*value_i) % 103，i 从 1 开始。
  //    切换字符集的 CODE B（100）也是一个普通符号，照样参与加权
  let sum = start
  for (let i = 0; i < dataValues.length; i += 1) {
    sum += (i + 1) * dataValues[i]
  }
  const checksum = sum % MODULO

  // 4. 完整值序列：START + 数据 + 校验和 + STOP，逐段拼成位串
  const values = [start, ...dataValues, checksum, STOP]
  let bitString = ''
  for (const value of values) {
    bitString += CODE128_PATTERNS[value]
  }

  // 5. 位串转 boolean[]：'1' -> true（bar），'0' -> false（space）
  const modules: boolean[] = []
  for (let i = 0; i < bitString.length; i += 1) {
    modules.push(bitString[i] === '1')
  }

  return { modules, text, checksum, codeSet, values }
}

/**
 * 把 boolean[] 转回 "1010..." 字符串，便于调试和断言。
 * 和 encodeCode128 里「位串 -> boolean[]」互为逆运算。
 */
export function barcodeText(modules: boolean[]): string {
  let out = ''
  for (const module of modules) out += module ? '1' : '0'
  return out
}
