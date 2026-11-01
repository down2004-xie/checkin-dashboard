import { describe, expect, it } from 'vitest'

import {
  base64ToBytes,
  bytesToBase64,
  decodeBase64,
  decodeHex,
  decodeUrl,
  encodeBase64,
  encodeHex,
  encodeUrl,
  escapeUnicode,
  unescapeUnicode,
} from './encoding'

const BS = String.fromCharCode(92) // 反斜杠，避免在源码里写转义被编辑器/工具误改

describe('Base64', () => {
  it('RFC 4648 §10 测试向量', () => {
    const vectors: [string, string][] = [
      ['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy'],
    ]
    for (const [plain, encoded] of vectors) {
      expect(encodeBase64(plain)).toBe(encoded)
      expect(decodeBase64(encoded)).toEqual({ ok: true, value: plain })
    }
  })

  it('中文走 UTF-8 字节（btoa 直接处理中文会抛错）', () => {
    expect(encodeBase64('你好')).toBe('5L2g5aW9')
    expect(decodeBase64('5L2g5aW9')).toEqual({ ok: true, value: '你好' })
  })

  it('emoji（4 字节 UTF-8）往返', () => {
    const text = '签到 😀🎉 ok'
    expect(encodeBase64('😀')).toBe('8J+YgA==')
    expect(decodeBase64(encodeBase64(text))).toEqual({ ok: true, value: text })
  })

  it('空串编码为空串，空白输入解码为空串', () => {
    expect(encodeBase64('')).toBe('')
    expect(decodeBase64('   \n')).toEqual({ ok: true, value: '' })
  })

  it('URL 安全变体：-_ 替换 +/，省略 =', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf])
    expect(bytesToBase64(bytes)).toBe('+/+/')
    expect(bytesToBase64(bytes, { urlSafe: true })).toBe('-_-_')
    expect(encodeBase64('f', { urlSafe: true })).toBe('Zg')
  })

  it('标准与 URL 安全变体互通：谁编的都能解', () => {
    const text = '😀 ~~~ ??? >>> 中文'
    const standard = encodeBase64(text)
    const urlSafe = encodeBase64(text, { urlSafe: true })
    expect(standard).toMatch(/[+/=]/)
    expect(urlSafe).not.toMatch(/[+/=]/)
    expect(decodeBase64(standard)).toEqual({ ok: true, value: text })
    expect(decodeBase64(urlSafe)).toEqual({ ok: true, value: text })
  })

  it('容忍空白换行和缺失的 padding', () => {
    expect(decodeBase64('Zm9v\nYmE')).toEqual({ ok: true, value: 'fooba' })
    expect(decodeBase64('  Zg  ')).toEqual({ ok: true, value: 'f' })
  })

  it('非法 Base64 返回错误而不是抛异常', () => {
    expect(decodeBase64('Zm9v*').ok).toBe(false)
    expect(decodeBase64('Zm=9v').ok).toBe(false) // = 在中间
    expect(decodeBase64('Z').ok).toBe(false) // 长度除 4 余 1
    expect(decodeBase64('Zg===').ok).toBe(false) // 三个 =
    expect(decodeBase64('Zg=').ok).toBe(false) // = 个数和长度对不上
  })

  it('能解出字节但不是 UTF-8 文字时给出错误', () => {
    const result = decodeBase64(bytesToBase64(new Uint8Array([0xff, 0xfe, 0x00])))
    expect(result.ok).toBe(false)
  })

  it('任意字节往返（0..255 全覆盖，三种尾巴长度）', () => {
    for (const size of [255, 256, 257]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256)
      const decoded = base64ToBytes(bytesToBase64(bytes))
      expect(decoded.ok && [...decoded.bytes]).toEqual([...bytes])
      const decodedSafe = base64ToBytes(bytesToBase64(bytes, { urlSafe: true }))
      expect(decodedSafe.ok && [...decodedSafe.bytes]).toEqual([...bytes])
    }
  })
})

describe('URL 编码', () => {
  it('中文和保留字符', () => {
    expect(encodeUrl('a b&c=你')).toEqual({ ok: true, value: 'a%20b%26c%3D%E4%BD%A0' })
    expect(decodeUrl('a%20b%26c%3D%E4%BD%A0')).toEqual({ ok: true, value: 'a b&c=你' })
  })

  it('非法 % 序列返回错误', () => {
    expect(decodeUrl('%E4%BD').ok).toBe(false)
    expect(decodeUrl('100%').ok).toBe(false)
  })

  it('不成对的代理项编码失败但不抛', () => {
    expect(encodeUrl('😀'.slice(0, 1)).ok).toBe(false)
  })
})

describe('Unicode 转义', () => {
  it('默认只转非 ASCII', () => {
    expect(escapeUnicode('a你')).toBe(`a${BS}u4F60`)
  })

  it('escapeAscii 时全部转义', () => {
    expect(escapeUnicode('a', { escapeAscii: true })).toBe(`${BS}u0061`)
  })

  it('emoji 用代理对表示', () => {
    expect(escapeUnicode('😀')).toBe(`${BS}uD83D${BS}uDE00`)
  })

  it('解码：代理对与 \\u{...} 两种写法都认，大小写不敏感', () => {
    expect(unescapeUnicode(`${BS}uD83D${BS}ude00`)).toEqual({ ok: true, value: '😀' })
    expect(unescapeUnicode(`${BS}u{1F600}!`)).toEqual({ ok: true, value: '😀!' })
    expect(unescapeUnicode(`hi ${BS}u4f60${BS}u597D`)).toEqual({ ok: true, value: 'hi 你好' })
  })

  it('往返：中文 + emoji + ASCII', () => {
    const text = '打卡 ✅ 😀 done'
    expect(unescapeUnicode(escapeUnicode(text, { escapeAscii: true }))).toEqual({ ok: true, value: text })
  })

  it('非法转义和不成对代理项返回错误', () => {
    expect(unescapeUnicode(`${BS}u12`).ok).toBe(false)
    expect(unescapeUnicode(`${BS}uD83D`).ok).toBe(false)
    expect(unescapeUnicode(`${BS}u{110000}`).ok).toBe(false)
  })

  it('普通反斜杠不受影响', () => {
    expect(unescapeUnicode(`C:${BS}temp`)).toEqual({ ok: true, value: `C:${BS}temp` })
  })
})

describe('十六进制', () => {
  it('UTF-8 字节，空格分隔', () => {
    expect(encodeHex('你A')).toBe('e4 bd a0 41')
    expect(encodeHex('')).toBe('')
  })

  it('解码容忍大小写、0x 前缀和各种分隔符', () => {
    expect(decodeHex('E4BDA0')).toEqual({ ok: true, value: '你' })
    expect(decodeHex('0xe4, 0xbd, 0xa0')).toEqual({ ok: true, value: '你' })
    expect(decodeHex('e4:bd:a0')).toEqual({ ok: true, value: '你' })
  })

  it('奇数位或非法字符返回错误', () => {
    expect(decodeHex('e4b').ok).toBe(false)
    expect(decodeHex('zz').ok).toBe(false)
  })

  it('emoji 往返', () => {
    expect(decodeHex(encodeHex('😀'))).toEqual({ ok: true, value: '😀' })
  })
})
