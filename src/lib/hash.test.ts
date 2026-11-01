import { describe, expect, it } from 'vitest'

import {
  MAX_HASH_FILE_BYTES,
  digestAll,
  digestHex,
  fileTooLargeMessage,
  matchExpected,
  normalizeHash,
  type HashResults,
} from './hash'

const bytes = (text: string) => new TextEncoder().encode(text)

// NIST FIPS 180 示例（"abc" 的单块消息），来自 NIST CSRC「Examples with Intermediate Values」
const ABC: HashResults = {
  MD5: '900150983cd24fb0d6963f7d28e17f72',
  'SHA-1': 'a9993e364706816aba3e25717850c26c9cd0d89d',
  'SHA-256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'SHA-512': 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
}

describe('digestHex / digestAll', () => {
  it('NIST "abc" 向量（四种算法）', async () => {
    for (const algorithm of ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const) {
      expect(await digestHex(algorithm, bytes('abc'))).toBe(ABC[algorithm])
    }
    expect(await digestAll(bytes('abc'))).toEqual(ABC)
  })

  it('空输入', async () => {
    const result = await digestAll(new Uint8Array(0))
    expect(result.MD5).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(result['SHA-256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('中文按 UTF-8 字节（SHA-256("你好")）', async () => {
    expect(await digestHex('SHA-256', bytes('你好'))).toBe('670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e')
  })

  it('进度回调单调递增并以 1 结束', async () => {
    const seen: number[] = []
    await digestAll(new Uint8Array(9 * 1024 * 1024), (done) => seen.push(done))
    expect(seen.at(-1)).toBe(1)
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
  })
})

describe('文件大小上限', () => {
  it('1 GB 以内放行，超出给提示', () => {
    expect(fileTooLargeMessage(MAX_HASH_FILE_BYTES)).toBeNull()
    expect(fileTooLargeMessage(MAX_HASH_FILE_BYTES + 1)).toMatch(/1 GB/)
  })
})

describe('期望值对比', () => {
  it('归一化：大小写不敏感、去首尾空白', () => {
    expect(normalizeHash('  ABC\n')).toBe('abc')
  })

  it('按长度认出算法，大写带空白也算一致', () => {
    expect(matchExpected(`  ${ABC['SHA-256'].toUpperCase()}\n`, ABC)).toEqual({ status: 'match', algorithm: 'SHA-256' })
    expect(matchExpected(ABC.MD5, ABC)).toEqual({ status: 'match', algorithm: 'MD5' })
  })

  it('sha256sum 格式（哈希 + 文件名）只取第一段', () => {
    expect(matchExpected(`${ABC['SHA-1']}  setup.exe`, ABC)).toEqual({ status: 'match', algorithm: 'SHA-1' })
  })

  it('同长度但值不同 → 不一致', () => {
    expect(matchExpected('0'.repeat(128), ABC)).toEqual({ status: 'mismatch', algorithm: 'SHA-512' })
  })

  it('空、非十六进制、长度对不上', () => {
    expect(matchExpected('   ', ABC)).toEqual({ status: 'empty' })
    expect(matchExpected('xyz', ABC).status).toBe('invalid')
    expect(matchExpected('abcd', ABC).status).toBe('invalid')
  })
})
