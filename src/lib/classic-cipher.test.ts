import { describe, expect, it } from 'vitest'

import { MORSE_TABLE, caesarDecrypt, caesarEncrypt, decodeMorse, encodeMorse } from './classic-cipher'

describe('凯撒密码', () => {
  it('经典例子：偏移 3', () => {
    expect(caesarEncrypt('Hello, World!', 3)).toBe('Khoor, Zruog!')
    expect(caesarDecrypt('Khoor, Zruog!', 3)).toBe('Hello, World!')
  })

  it('字母表首尾循环，大小写保持', () => {
    expect(caesarEncrypt('xyzXYZ', 3)).toBe('abcABC')
  })

  it('非字母原样保留（数字、中文、emoji）', () => {
    expect(caesarEncrypt('签到 123 😀', 5)).toBe('签到 123 😀')
  })

  it('负偏移等于反向移', () => {
    expect(caesarEncrypt('abc', -1)).toBe('zab')
    expect(caesarEncrypt('abc', -1)).toBe(caesarEncrypt('abc', 25))
  })

  it('偏移大于 26 按 26 取模', () => {
    expect(caesarEncrypt('abc', 29)).toBe(caesarEncrypt('abc', 3))
    expect(caesarEncrypt('abc', 26)).toBe('abc')
    expect(caesarEncrypt('abc', -53)).toBe(caesarEncrypt('abc', -1))
  })

  it('任意偏移往返', () => {
    for (const shift of [-100, -27, -1, 0, 1, 13, 25, 26, 52, 1000]) {
      expect(caesarDecrypt(caesarEncrypt('The Quick Brown Fox', shift), shift)).toBe('The Quick Brown Fox')
    }
  })

  it('ROT13 两次还原', () => {
    expect(caesarEncrypt(caesarEncrypt('Why did the chicken', 13), 13)).toBe('Why did the chicken')
  })

  it('非数字偏移当 0 处理，小数截断', () => {
    expect(caesarEncrypt('abc', Number.NaN)).toBe('abc')
    expect(caesarEncrypt('abc', 1.9)).toBe('bcd')
  })
})

describe('摩斯电码', () => {
  it('SOS 和单词分隔', () => {
    expect(encodeMorse('SOS')).toEqual({ value: '... --- ...', unsupported: [] })
    expect(encodeMorse('hi you')).toEqual({ value: '.... .. / -.-- --- ..-', unsupported: [] })
  })

  it('数字和标点', () => {
    expect(encodeMorse('1?').value).toBe('.---- ..--..')
  })

  it('不支持的字符原样保留并报告（中文不支持）', () => {
    const result = encodeMorse('A你#你')
    expect(result.value).toBe('.- 你 # 你')
    expect(result.unsupported).toEqual(['你', '#'])
  })

  it('解码：大写输出，认 / 和 | 作单词分隔', () => {
    expect(decodeMorse('.... .. / -.-- --- ..-')).toEqual({ value: 'HI YOU', unsupported: [] })
    expect(decodeMorse('.... .. | -.-- --- ..-').value).toBe('HI YOU')
  })

  it('解码认网页里常见的 · 和 — 符号', () => {
    expect(decodeMorse('··· ——— ···').value).toBe('SOS')
  })

  it('认不出的码组原样保留并报告', () => {
    const result = decodeMorse('... ........ ...')
    expect(result.value).toBe('S........S')
    expect(result.unsupported).toEqual(['........'])
  })

  it('码表无重复码组（否则解码有歧义）', () => {
    const codes = Object.values(MORSE_TABLE)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('全表往返', () => {
    const all = Object.keys(MORSE_TABLE).join('')
    expect(decodeMorse(encodeMorse(all).value).value).toBe(all)
  })

  it('空输入', () => {
    expect(encodeMorse('   ')).toEqual({ value: '', unsupported: [] })
    expect(decodeMorse('')).toEqual({ value: '', unsupported: [] })
  })
})
