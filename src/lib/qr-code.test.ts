import { describe, expect, it } from 'vitest'

import { EC_LEVELS, clampInt, contrastWarning, fitLongSide, parseHexColor, qrErrorMessage, safeLink } from './qr-code'

describe('safeLink：只有完整的 http(s) 网址才能做成链接', () => {
  it.each([
    ['https://example.com', 'https://example.com/', 'example.com'],
    ['http://example.com/a?b=1#c', 'http://example.com/a?b=1#c', 'example.com'],
    ['  HTTPS://Example.COM/path  ', 'https://example.com/path', 'example.com'],
    ['https://例子.测试/', 'https://xn--fsqu00a.xn--0zwm56d/', 'xn--fsqu00a.xn--0zwm56d'],
  ])('%s → 放行', (text, href, host) => {
    expect(safeLink(text)).toEqual({ href, host, hasCredentials: false })
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(document.cookie)',
    ' javascript://example.com/%0aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/Windows/win.ini',
    'vbscript:msgbox(1)',
    'weixin://dl/business',
    'ftp://example.com',
    '//example.com',
    'example.com',
    'www.example.com',
  ])('非 http(s)：%s → 拒绝', (text) => {
    expect(safeLink(text)).toBeNull()
  })

  it.each([
    '访问 https://example.com 领取',
    'https://example.com\nhttps://evil.com',
    'https://exa mple.com',
    'https://example.com/\u0000',
    'https://exa\tmple.com',
    'https://',
    'http://[::1',
  ])('不是单独一个合法网址：%j → 拒绝', (text) => {
    expect(safeLink(text)).toBeNull()
  })

  it('带「用户名@」的网址标出真实去向', () => {
    expect(safeLink('https://bank.com@evil.com/login')).toEqual({ href: 'https://bank.com@evil.com/login', host: 'evil.com', hasCredentials: true })
  })
})

describe('contrastWarning', () => {
  it('深色码浅色底不提示', () => {
    expect(contrastWarning('#000000', '#ffffff')).toBeNull()
    expect(contrastWarning('#1d4ed8', '#ffffff')).toBeNull()
  })

  it('对比度太低提示', () => {
    expect(contrastWarning('#ffb7d5', '#ffffff')).toMatch(/对比度只有 1\.\d:1/)
    expect(contrastWarning('#777777', '#888888')).toMatch(/对比度/)
  })

  it('反色码（前景比背景亮）单独提示', () => {
    expect(contrastWarning('#ffffff', '#000000')).toMatch(/反色/)
  })

  it('颜色解析不了时不提示（不误报）', () => {
    expect(contrastWarning('red', '#fff')).toBeNull()
  })
})

describe('parseHexColor', () => {
  it('认 #rgb 和 #rrggbb', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHexColor('#1A2b3C')).toEqual({ r: 26, g: 43, b: 60 })
    expect(parseHexColor('123456')).toBeNull()
  })
})

describe('qrErrorMessage', () => {
  it('容量超限转成可操作的提示', () => {
    expect(qrErrorMessage(new Error('The amount of data is too big to be stored in a QR Code'))).toMatch(/内容太长.*纠错级别/)
  })

  it('空输入', () => {
    expect(qrErrorMessage(new Error('No input text'))).toMatch(/请先输入/)
  })

  it('未知错误给兜底文案，不透出英文原文', () => {
    expect(qrErrorMessage('boom')).toBe('二维码生成失败，请检查内容后重试')
  })
})

describe('fitLongSide', () => {
  it('长边超限时等比缩小', () => {
    expect(fitLongSide(3000, 1500, 1500)).toEqual({ width: 1500, height: 750 })
    expect(fitLongSide(1000, 4000, 1500)).toEqual({ width: 375, height: 1500 })
  })

  it('不放大', () => {
    expect(fitLongSide(400, 300, 1500)).toEqual({ width: 400, height: 300 })
  })

  it('非法尺寸', () => {
    expect(fitLongSide(0, 100, 1500)).toEqual({ width: 0, height: 0 })
  })
})

describe('clampInt / EC_LEVELS', () => {
  it('收进范围并取整', () => {
    expect(clampInt(5000, 64, 2048, 256)).toBe(2048)
    expect(clampInt(10.6, 0, 20, 4)).toBe(11)
    expect(clampInt(Number.NaN, 0, 20, 4)).toBe(4)
  })

  it('四个纠错级别按 L M Q H 排列', () => {
    expect(EC_LEVELS.map((item) => item.level)).toEqual(['L', 'M', 'Q', 'H'])
  })
})
