import { describe, expect, it } from 'vitest'

import {
  CODE128_PATTERNS,
  START_B,
  STOP,
  barcodeText,
  encodeCode128,
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
    expect(encodeCode128('')).toEqual({ modules: [], text: '', checksum: 0 })
  })

  it('全部非法字符（中文）返回空结果', () => {
    expect(encodeCode128('你好世界')).toEqual({ modules: [], text: '', checksum: 0 })
  })

  it('非法字符被静默忽略，只编码合法部分', () => {
    // 换行(\n)、Tab(\t) 属于 ASCII < 32，被剔除；只剩 AB
    const result = encodeCode128('A\n\tB')
    expect(result.text).toBe('AB')
    expect(result.checksum).toBe(encodeCode128('AB').checksum)
    expect(barcodeText(result.modules)).toBe(barcodeText(encodeCode128('AB').modules))
  })
})
