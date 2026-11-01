import { describe, expect, it } from 'vitest'

import {
  CODE128_PATTERNS,
  CODE_B_IN_C,
  MAX_BARCODE_LENGTH,
  START_B,
  START_C,
  STOP,
  barcodeText,
  encodeCode128,
  shouldUseCodeC,
} from './barcode'

/** 拼接某个值序列对应的完整位串，测试里复用，避免手抄出错。 */
function patternOf(...values: number[]): string {
  return values.map((value) => CODE128_PATTERNS[value]).join('')
}

describe('CODE128_PATTERNS 模式表完整性', () => {
  it('共 107 个符号（0–106）', () => {
    expect(CODE128_PATTERNS).toHaveLength(107)
  })

  it('值 0–105 都是 11 模块，且以 bar 开头、以 space 结尾', () => {
    for (let value = 0; value <= 105; value += 1) {
      const pattern = CODE128_PATTERNS[value]
      expect(pattern).toHaveLength(11)
      expect(pattern[0]).toBe('1')
      expect(pattern[10]).toBe('0')
    }
  })

  it('STOP（106）是 13 模块且等于标准串', () => {
    expect(CODE128_PATTERNS[106]).toBe('1100011101011')
    expect(CODE128_PATTERNS[106]).toHaveLength(13)
  })

  it('START B（104）等于标准串', () => {
    expect(CODE128_PATTERNS[START_B]).toBe('11010010000')
  })
})

describe('encodeCode128 校验和', () => {
  it('单字符 A 的校验和 = 34', () => {
    // (104 + 1*33) % 103 = 137 % 103 = 34，其中 'A'=65 -> 65-32=33
    expect(encodeCode128('A').checksum).toBe(34)
  })

  it('CODE128 的校验和 = 26', () => {
    // 手算：(104 + 1*35 + 2*47 + 3*36 + 4*37 + 5*17 + 6*18 + 7*24) % 103 = 850 % 103 = 26
    expect(encodeCode128('CODE128').checksum).toBe(26)
  })

  it('单个空格（值 0）校验和 = 1', () => {
    // (104 + 1*0) % 103 = 104 % 103 = 1
    expect(encodeCode128(' ').checksum).toBe(1)
  })
})

describe('encodeCode128 模块序列', () => {
  it('单字符 A 的完整模块串正确', () => {
    const expected = patternOf(START_B, 33, 34, STOP)
    expect(barcodeText(encodeCode128('A').modules)).toBe(expected)
  })

  it('序列以 START B 开头、以 STOP 结尾', () => {
    const bits = barcodeText(encodeCode128('Hi').modules)
    expect(bits.startsWith(CODE128_PATTERNS[START_B])).toBe(true)
    expect(bits.endsWith(CODE128_PATTERNS[STOP])).toBe(true)
  })

  it('总模块数 = 11*(n+3) + 2（stop 多 2 个模块）', () => {
    // n 个数据字符 -> 值序列有 n+3 个（start + n data + checksum + stop）
    // 前 n+2 个各 11 模块，stop 13 模块：11*(n+2) + 13 = 11*(n+3) + 2
    for (const text of ['A', 'AB', 'CODE128', 'Hello, World!']) {
      expect(encodeCode128(text).modules).toHaveLength(11 * (text.length + 3) + 2)
    }
  })

  it('modules 全是 boolean（true=bar / false=space）', () => {
    const { modules } = encodeCode128('Test')
    expect(modules.every((module) => typeof module === 'boolean')).toBe(true)
    // 首模块必为 bar（所有 Code128 符号都以 bar 起始）
    expect(modules[0]).toBe(true)
  })
})

describe('barcodeText 往返', () => {
  it('boolean[] 与 "1010..." 字符串互相可逆', () => {
    const { modules } = encodeCode128('RoundTrip 123')
    const bits = barcodeText(modules)
    // 逐位比对：字符串转回 boolean[] 应完全一致
    const rebuilt = Array.from(bits, (ch) => ch === '1')
    expect(rebuilt).toEqual(modules)
    expect(bits).toMatch(/^[01]+$/)
  })
})

describe('encodeCode128 空串与非法字符', () => {
  it('空串返回空结果', () => {
    expect(encodeCode128('')).toEqual({ modules: [], text: '', checksum: 0, codeSet: 'B', values: [] })
  })

  it('全部非法字符（中文）返回空结果', () => {
    expect(encodeCode128('你好世界')).toEqual({ modules: [], text: '', checksum: 0, codeSet: 'B', values: [] })
  })

  it('非法字符被静默忽略，只编码合法部分', () => {
    // 换行(\n)、Tab(\t) 属于 ASCII < 32，被剔除；只剩 AB
    const result = encodeCode128('A\n\tB')
    expect(result.text).toBe('AB')
    expect(result.checksum).toBe(encodeCode128('AB').checksum)
    expect(barcodeText(result.modules)).toBe(barcodeText(encodeCode128('AB').modules))
  })
})

/**
 * 测试专用的最小解码器：把模块序列切回符号值，再按字符集还原文本，并重算校验和。
 * 和编码器走的是两条独立的路（编码器查「值 → 位串」，这里查「位串 → 值」），
 * 两边一致才能说明条码真的能被扫回原文。
 */
function decode(modules: boolean[]): { text: string; checksumOk: boolean } {
  const bits = barcodeText(modules)
  const symbols: number[] = []
  for (let i = 0; i + 11 <= bits.length - 13; i += 11) {
    const value = CODE128_PATTERNS.indexOf(bits.slice(i, i + 11))
    if (value < 0) throw new Error(`unknown pattern at module ${i}`)
    symbols.push(value)
  }
  if (bits.slice(-13) !== CODE128_PATTERNS[STOP]) throw new Error('missing STOP')
  const [start, ...rest] = symbols
  const data = rest.slice(0, -1)
  const check = rest[rest.length - 1]
  const sum = data.reduce((acc, value, index) => acc + (index + 1) * value, start)
  let set = start === START_C ? 'C' : 'B'
  let text = ''
  for (const value of data) {
    if (set === 'C' && value === CODE_B_IN_C) set = 'B'
    else if (set === 'C') text += String(value).padStart(2, '0')
    else text += String.fromCharCode(value + 32)
  }
  return { text, checksumOk: sum % 103 === check }
}

describe('Code Set C（纯数字压缩）', () => {
  it('START C 等于标准串', () => {
    expect(CODE128_PATTERNS[START_C]).toBe('11010011100')
  })

  it('何时用 C：偶数位 ≥ 2、奇数位 ≥ 5；3 位打平留在 B；含非数字不用', () => {
    expect(shouldUseCodeC('12')).toBe(true)
    expect(shouldUseCodeC('1')).toBe(false)
    expect(shouldUseCodeC('123')).toBe(false)
    expect(shouldUseCodeC('12345')).toBe(true)
    expect(shouldUseCodeC('12a4')).toBe(false)
    expect(shouldUseCodeC('12 34')).toBe(false)
  })

  it('1234 → START C, 12, 34，校验和 = 82', () => {
    // (105 + 1*12 + 2*34) % 103 = 185 % 103 = 82
    const result = encodeCode128('1234')
    expect(result.codeSet).toBe('C')
    expect(result.values).toEqual([START_C, 12, 34, 82, STOP])
    expect(barcodeText(result.modules)).toBe(patternOf(START_C, 12, 34, 82, STOP))
  })

  it('奇数位 12345 → 两对 + 切 B + 末位 5，校验和 = 54', () => {
    // 末位 '5' 是 ASCII 53，Code B 值 = 53 - 32 = 21（别把 ASCII 码当符号值）。
    // (105 + 1*12 + 2*34 + 3*100 + 4*21) % 103 = 569 % 103 = 54
    const result = encodeCode128('12345')
    expect(result.values).toEqual([START_C, 12, 34, 100, 21, 54, STOP])
    expect(result.checksum).toBe(54)
  })

  it('前导 0 不丢：0042 → 00, 42', () => {
    expect(encodeCode128('0042').values.slice(1, 3)).toEqual([0, 42])
  })

  it('纯数字用 C 后条码更窄', () => {
    const digits = '1234567890123456'
    const widthC = encodeCode128(digits).modules.length
    const widthB = 11 * (digits.length + 3) + 2
    expect(widthC).toBe(11 * (digits.length / 2 + 3) + 2)
    expect(widthC).toBeLessThan(widthB)
  })
})

describe('解码往返：编出来的条码能还原原文且校验和正确', () => {
  for (const text of ['A', 'CODE128', 'Hello, World!', '12', '123', '1234', '12345', '0042', '9780201379624', 'ABC-123']) {
    it(text, () => {
      const decoded = decode(encodeCode128(text).modules)
      expect(decoded.text).toBe(text)
      expect(decoded.checksumOk).toBe(true)
    })
  }
})

describe('MAX_BARCODE_LENGTH', () => {
  it('上限是 80 字符，最长内容的画布宽度远低于浏览器上限', () => {
    expect(MAX_BARCODE_LENGTH).toBe(80)
    // 80 字符走 Code B：(80+3)*11+2 模块 × 3px + 两侧各 10 模块静区
    const modules = encodeCode128('A'.repeat(MAX_BARCODE_LENGTH)).modules.length
    expect((modules + 20) * 3).toBeLessThan(4096)
  })
})
