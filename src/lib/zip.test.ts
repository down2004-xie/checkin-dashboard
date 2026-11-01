import { describe, expect, it } from 'vitest'

import { crc32, createZip, dosDateTime, uniqueNames } from './zip'

const bytes = (text: string) => new TextEncoder().encode(text)

/** 测试用的最小读取器：从目录结束记录出发，按中央目录把文件读回来 */
function readZip(zip: Uint8Array): { name: string; data: string; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const result = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50)
    const nameLength = view.getUint16(offset + 28, true)
    const size = view.getUint32(offset + 24, true)
    const local = view.getUint32(offset + 42, true)
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength))
    const localNameLength = view.getUint16(local + 26, true)
    const dataStart = local + 30 + localNameLength
    result.push({
      name,
      data: new TextDecoder().decode(zip.subarray(dataStart, dataStart + size)),
      crc: view.getUint32(offset + 16, true),
    })
    offset += 46 + nameLength
  }
  return result
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    // CRC-32/ISO-HDLC 的标准校验值：crc32("123456789") = 0xCBF43926
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })

  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('dosDateTime', () => {
  it('packs local time with 2-second precision', () => {
    const { time, date } = dosDateTime(new Date(2026, 10, 1, 13, 45, 31))
    expect(time).toBe((13 << 11) | (45 << 5) | 15)
    expect(date).toBe(((2026 - 1980) << 9) | (11 << 5) | 1)
  })

  it('clamps years before 1980', () => {
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0)
  })
})

describe('uniqueNames', () => {
  it('suffixes duplicates before the extension', () => {
    expect(uniqueNames(['a.png', 'a.png', 'b', 'b', 'a.png'])).toEqual(['a.png', 'a (2).png', 'b', 'b (2)', 'a (3).png'])
  })

  it('does not collide with an existing suffixed name', () => {
    expect(uniqueNames(['a (2).png', 'a.png', 'a.png'])).toEqual(['a (2).png', 'a.png', 'a (3).png'])
  })
})

describe('createZip', () => {
  const now = new Date(2026, 10, 1, 12, 0, 0)

  it('round-trips names and contents, including UTF-8 names', () => {
    const zip = createZip([
      { name: 'hello.txt', data: bytes('hello') },
      { name: '切片/第1张.txt', data: bytes('你好') },
    ], now)
    expect(readZip(zip)).toEqual([
      { name: 'hello.txt', data: 'hello', crc: crc32(bytes('hello')) },
      { name: '切片/第1张.txt', data: '你好', crc: crc32(bytes('你好')) },
    ])
  })

  it('sets the UTF-8 flag and store method on every entry', () => {
    const zip = createZip([{ name: 'a', data: bytes('x') }], now)
    const view = new DataView(zip.buffer)
    expect(view.getUint16(6, true)).toBe(0x0800)
    expect(view.getUint16(8, true)).toBe(0)
  })

  it('renames duplicate entries instead of writing two files with one name', () => {
    const zip = createZip([{ name: 'a.png', data: bytes('1') }, { name: 'a.png', data: bytes('2') }], now)
    expect(readZip(zip).map((entry) => entry.name)).toEqual(['a.png', 'a (2).png'])
  })

  it('produces a valid empty archive', () => {
    const zip = createZip([], now)
    expect(zip.length).toBe(22)
    expect(readZip(zip)).toEqual([])
  })

  it('is deterministic for the same input and time', () => {
    const entries = [{ name: 'a', data: bytes('abc') }]
    expect(createZip(entries, now)).toEqual(createZip(entries, now))
  })
})
