import { describe, expect, it } from 'vitest'

import { MD5_T_TABLE, Md5, md5Hex } from './md5'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('MD5', () => {
  // RFC 1321 附录 A.5「MD5 test suite」全部 7 个向量（2026-11-01 对照 rfc-editor.org 原文抄录）
  const RFC_VECTORS: [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ]

  it.each(RFC_VECTORS)('RFC 1321 A.5：MD5("%s")', (input, expected) => {
    expect(md5Hex(bytes(input))).toBe(expected)
  })

  it('常量表和 RFC 公式 floor(2^32 × |sin(i+1)|) 逐项一致', () => {
    const computed = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)
    expect([...MD5_T_TABLE]).toEqual(computed)
  })

  // 以下期望值由 Node 内置 crypto.createHash('md5') 算出后写死（不在测试里 import node:crypto，
  // 免得 lib 测试依赖 @types/node）。样本数据按公式生成，换机器结果不变。
  it('中文按 UTF-8 字节算', () => {
    expect(md5Hex(bytes('你好'))).toBe('7eca689f0d3389d9dea66ae112e5cfd7')
  })

  it('补位边界：尾巴 ≥ 56 字节时要多补一整块', () => {
    const expected: Record<number, string> = {
      55: 'fe4c050c7a3d8b0c93d5baae6ca77fa1', 56: '6cf06c0659a33472a3005a497c53b3ab',
      57: '82881e76658f0cff3e26728ec7381bb1', 63: 'b45d7746939fd1f4ce3d417b18ed2635',
      64: 'a36738582497d785e6c27f09c9b8a15d', 65: 'ac810d9d23a3425a15adb534769f920b',
      119: '052904ad6cf3e237cba0b945f08c0a88', 120: 'cd8ff5e7fddeb2b0377b28ac1dab4f26',
      128: '710e8d86231ece9aaf37ba5d139d2939',
    }
    for (const [size, hex] of Object.entries(expected)) {
      const data = Uint8Array.from({ length: Number(size) }, (_, i) => (i * 31) & 0xff)
      expect(md5Hex(data), `${size} 字节`).toBe(hex)
    }
  })

  it('分块 update 与一次性结果相同（块边界不对齐 64）', () => {
    const data = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7 + 3) & 0xff)
    const hasher = new Md5()
    for (const cut of [[0, 1], [1, 63], [63, 200], [200, 264], [264, 1000]]) hasher.update(data.subarray(cut[0], cut[1]))
    expect(hasher.hex()).toBe(md5Hex(data))
  })

  it('较大数据（1 MB，多块）', () => {
    const data = Uint8Array.from({ length: 1 << 20 }, (_, i) => (i ^ (i >> 8)) & 0xff)
    expect(md5Hex(data)).toBe('a4dbd4f74bf1c52718a2851103a72784')
  })
})
