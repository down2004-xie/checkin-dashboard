import { describe, expect, it } from 'vitest'

import {
  cleanFileName,
  dmsToDecimal,
  formatExifDate,
  formatExposure,
  formatGps,
  mapLink,
  orientationLabel,
  orientationSwapsAxes,
  readJpegInfo,
  stripMetadata,
} from './exif'

// ---------- 在测试里手工造最小 JPEG ----------

interface Entry {
  tag: number
  type: number
  /** 字符串（ASCII）、数字数组（SHORT/LONG）或 [分子, 分母] 数组（RATIONAL） */
  value: string | number[] | [number, number][]
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

/** 造一个 TIFF 结构：IFD0 + 可选 ExifIFD + 可选 GPS IFD，指针自动回填。overrides 用来造坏指针 */
function tiff(little: boolean, ifd0: Entry[], exif: Entry[] = [], gps: Entry[] = [], overrides: { exifPointer?: number; gpsPointer?: number } = {}): Uint8Array {
  const ifdSize = (n: number) => 2 + 12 * n + 4
  const all0 = [...ifd0]
  if (exif.length) all0.push({ tag: 0x8769, type: 4, value: [0] })
  if (gps.length || overrides.gpsPointer !== undefined) all0.push({ tag: 0x8825, type: 4, value: [0] })
  const off0 = 8
  const offExif = off0 + ifdSize(all0.length)
  const offGps = offExif + (exif.length ? ifdSize(exif.length) : 0)
  for (const entry of all0) {
    if (entry.tag === 0x8769) entry.value = [overrides.exifPointer ?? offExif]
    if (entry.tag === 0x8825) entry.value = [overrides.gpsPointer ?? offGps]
  }
  let dataAt = offGps + (gps.length ? ifdSize(gps.length) : 0)
  const buf = new Uint8Array(8192)
  const view = new DataView(buf.buffer)
  buf.set(ascii(little ? 'II' : 'MM'), 0)
  view.setUint16(2, 42, little)
  view.setUint32(4, off0, little)

  const encode = (entry: Entry): { data: Uint8Array; count: number } => {
    if (typeof entry.value === 'string') { const data = new TextEncoder().encode(entry.value + '\0'); return { data, count: data.length } }
    const size = entry.type === 3 ? 2 : entry.type === 4 ? 4 : 8
    const data = new Uint8Array(size * entry.value.length)
    const v = new DataView(data.buffer)
    entry.value.forEach((item, i) => {
      if (Array.isArray(item)) { v.setUint32(i * 8, item[0], little); v.setUint32(i * 8 + 4, item[1], little) }
      else if (size === 2) v.setUint16(i * 2, item, little)
      else v.setUint32(i * 4, item, little)
    })
    return { data, count: entry.value.length }
  }
  const writeIfd = (offset: number, entries: Entry[]) => {
    view.setUint16(offset, entries.length, little)
    entries.forEach((entry, i) => {
      const at = offset + 2 + i * 12
      const { data, count } = encode(entry)
      view.setUint16(at, entry.tag, little)
      view.setUint16(at + 2, entry.type, little)
      view.setUint32(at + 4, count, little)
      if (data.length <= 4) buf.set(data, at + 8)
      else { view.setUint32(at + 8, dataAt, little); buf.set(data, dataAt); dataAt += data.length + (data.length % 2) }
    })
    view.setUint32(offset + 2 + entries.length * 12, 0, little) // 没有下一个 IFD
  }
  writeIfd(off0, all0)
  if (exif.length) writeIfd(offExif, exif)
  if (gps.length) writeIfd(offGps, gps)
  return buf.slice(0, dataAt)
}

const segment = (marker: number, payload: ArrayLike<number>) => {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...Array.from(payload)]
}
const exifSegment = (tiffBytes: Uint8Array) => segment(0xe1, [...ascii('Exif\0\0'), ...tiffBytes])

const SOI = [0xff, 0xd8]
const EOI = [0xff, 0xd9]
const APP0 = segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
const ICC = segment(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, 9, 9, 9])
const XMP = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS</x:xmpmeta>'))
const IPTC = segment(0xed, ascii('Photoshop 3.0\x008BIM'))
const MPF = segment(0xe2, [...ascii('MPF\0'), 0, 0, 0, 0])
const DQT = segment(0xdb, new Array(65).fill(1))
const SOF0 = segment(0xc0, [8, 0, 16, 0, 32, 1, 1, 0x11, 0]) // 高 16、宽 32
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0])
// 扫描数据里故意放 FF 00（转义）和 FF D0（重启标记），解析器不能把它们当成段
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]

const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat())

const CANON_IFD0: Entry[] = [
  { tag: 0x010f, type: 2, value: 'Canon' },
  { tag: 0x0110, type: 2, value: 'EOS R5' },
  { tag: 0x0112, type: 3, value: [6] },
  { tag: 0x0131, type: 2, value: 'Lightroom 中文版' },
]
const CANON_EXIF: Entry[] = [
  { tag: 0x829a, type: 5, value: [[1, 125]] },
  { tag: 0x829d, type: 5, value: [[28, 10]] },
  { tag: 0x8827, type: 3, value: [400] },
  { tag: 0x9003, type: 2, value: '2024:05:01 08:30:00' },
  { tag: 0x920a, type: 5, value: [[50, 1]] },
]
// 39°54'15.12" N, 116°24'26.64" E（北京）
const gpsEntries = (latRef: string, lonRef: string): Entry[] => [
  { tag: 0x0001, type: 2, value: latRef },
  { tag: 0x0002, type: 5, value: [[39, 1], [54, 1], [1512, 100]] },
  { tag: 0x0003, type: 2, value: lonRef },
  { tag: 0x0004, type: 5, value: [[116, 1], [24, 1], [2664, 100]] },
]

const fullJpeg = (little: boolean) => jpeg(SOI, APP0, exifSegment(tiff(little, CANON_IFD0, CANON_EXIF, gpsEntries('N', 'E'))), ICC, XMP, IPTC, DQT, SOF0, SOS, SCAN, EOI)

describe('readJpegInfo', () => {
  it('II（小端）：相机、拍摄时间、曝光参数、方向、GPS 十进制坐标', () => {
    const report = readJpegInfo(fullJpeg(true))
    expect(report.isJpeg).toBe(true)
    expect([report.width, report.height]).toEqual([32, 16])
    expect(report.hasXmp).toBe(true)
    expect(report.hasIptc).toBe(true)
    expect(report.warnings).toEqual([])
    const exif = report.exif
    expect(exif).toMatchObject({
      make: 'Canon', model: 'EOS R5', orientation: 6, software: 'Lightroom 中文版',
      dateTimeOriginal: '2024:05:01 08:30:00', exposureTime: { num: 1, den: 125 }, fNumber: 2.8, iso: 400, focalLength: 50, hasGps: true,
    })
    expect(exif?.gps?.latitude).toBeCloseTo(39.9042, 6)
    expect(exif?.gps?.longitude).toBeCloseTo(116.4074, 6)
  })

  it('MM（大端）：同样能读，S / W 取负', () => {
    const bytes = jpeg(SOI, exifSegment(tiff(false, [{ tag: 0x010f, type: 2, value: 'NIKON' }], CANON_EXIF, gpsEntries('S', 'W'))), SOF0, SOS, SCAN, EOI)
    const exif = readJpegInfo(bytes).exif
    expect(exif?.make).toBe('NIKON')
    expect(exif?.dateTimeOriginal).toBe('2024:05:01 08:30:00')
    expect(exif?.gps?.latitude).toBeCloseTo(-39.9042, 6)
    expect(exif?.gps?.longitude).toBeCloseTo(-116.4074, 6)
  })

  it('≤ 4 字节的值塞在条目里（"LG\\0"）也能读', () => {
    const exif = readJpegInfo(jpeg(SOI, exifSegment(tiff(true, [{ tag: 0x010f, type: 2, value: 'LG' }])), SOS, SCAN, EOI)).exif
    expect(exif?.make).toBe('LG')
    expect(exif?.hasGps).toBe(false)
  })

  it('没有 EXIF 的 JPEG：exif 为 null', () => {
    const report = readJpegInfo(jpeg(SOI, APP0, SOF0, SOS, SCAN, EOI))
    expect(report).toMatchObject({ isJpeg: true, exif: null, hasXmp: false, hasIptc: false, trailingBytes: 0 })
  })

  it('不是 JPEG（PNG 头 / 空 / 随便的字节）', () => {
    expect(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).isJpeg).toBe(false)
    expect(readJpegInfo(new Uint8Array()).isJpeg).toBe(false)
    expect(stripMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })
})

describe('坏数据不崩，返回部分结果', () => {
  it('完整文件的每一种截断都不抛异常', () => {
    const good = fullJpeg(true)
    for (let cut = 0; cut <= good.length; cut += 1) {
      const part = good.slice(0, cut)
      expect(() => readJpegInfo(part)).not.toThrow()
      expect(() => stripMetadata(part)).not.toThrow()
    }
  })

  it('EXIF 段被截断在 GPS 数据中间：相机信息照样读出来，坐标不瞎编', () => {
    const body = tiff(true, CANON_IFD0, CANON_EXIF, gpsEntries('N', 'E'))
    const header = exifSegment(body).slice(0, 4) // 段头里声明的是完整长度
    const bytes = new Uint8Array([...SOI, ...header, ...ascii('Exif\0\0'), ...body.slice(0, body.length - 10)])
    const report = readJpegInfo(bytes)
    expect(report.exif?.make).toBe('Canon')
    expect(report.exif?.hasGps).toBe(true)
    expect(report.exif?.gps).toBeUndefined()
    expect(report.warnings.length).toBeGreaterThan(0)
    // 头部就坏了的文件不清除（不知道图像数据在哪，不敢动）
    expect(stripMetadata(bytes)).toBeNull()
  })

  it('循环 IFD（ExifIFD 指回 IFD0）不死循环', () => {
    const bytes = jpeg(SOI, exifSegment(tiff(true, CANON_IFD0, CANON_EXIF, [], { exifPointer: 8 })), SOS, SCAN, EOI)
    const report = readJpegInfo(bytes)
    expect(report.exif?.make).toBe('Canon')
    expect(report.warnings.some((w) => w.includes('循环'))).toBe(true)
  })

  it('越界偏移：GPS 指针指到文件外', () => {
    const bytes = jpeg(SOI, exifSegment(tiff(true, CANON_IFD0, [], [], { gpsPointer: 999_999 })), SOS, SCAN, EOI)
    const report = readJpegInfo(bytes)
    expect(report.exif?.make).toBe('Canon')
    expect(report.exif?.hasGps).toBe(true)
    expect(report.exif?.gps).toBeUndefined()
    expect(report.warnings.some((w) => w.includes('越界'))).toBe(true)
  })

  it('GPS 分母为 0 / 缺方向参考：不显示坐标', () => {
    const zero: Entry[] = [{ tag: 0x0001, type: 2, value: 'N' }, { tag: 0x0002, type: 5, value: [[39, 0], [0, 1], [0, 1]] },
      { tag: 0x0003, type: 2, value: 'E' }, { tag: 0x0004, type: 5, value: [[116, 1], [0, 1], [0, 1]] }]
    expect(readJpegInfo(jpeg(SOI, exifSegment(tiff(true, CANON_IFD0, [], zero)), SOS, EOI)).exif?.gps).toBeUndefined()
    const noRef = gpsEntries('N', 'E').filter((e) => e.tag !== 0x0001)
    expect(readJpegInfo(jpeg(SOI, exifSegment(tiff(true, CANON_IFD0, [], noRef)), SOS, EOI)).exif?.gps).toBeUndefined()
  })

  it('字节序标记错 / 魔数错 / 条目数离谱', () => {
    const bad = tiff(true, CANON_IFD0)
    bad[0] = 0x58
    expect(readJpegInfo(jpeg(SOI, exifSegment(bad), SOS, EOI)).exif).toBeNull()
    const huge = tiff(true, CANON_IFD0)
    new DataView(huge.buffer).setUint16(8, 0xffff, true)
    const report = readJpegInfo(jpeg(SOI, exifSegment(huge), SOS, EOI))
    expect(report.exif?.make).toBeUndefined()
    expect(report.warnings.length).toBeGreaterThan(0)
  })
})

describe('stripMetadata', () => {
  const findSof = (bytes: Uint8Array) => bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0)

  it('删 EXIF / XMP / IPTC，保留 JFIF 和 ICC，图像数据字节不变', () => {
    for (const little of [true, false]) {
      const original = fullJpeg(little)
      const result = stripMetadata(original)
      expect(result).not.toBeNull()
      if (!result) continue
      expect(result.removedSegments).toBe(3)
      const report = readJpegInfo(result.bytes)
      expect(report).toMatchObject({ isJpeg: true, exif: null, hasXmp: false, hasIptc: false, width: 32, height: 16 })
      // 期望结果 = 原文件去掉三段，其余逐字节相同
      expect([...result.bytes]).toEqual([...jpeg(SOI, APP0, ICC, DQT, SOF0, SOS, SCAN, EOI)])
      // 从帧头起（帧头 + 扫描头 + 图像数据）与原文件逐字节一致
      expect([...result.bytes.subarray(findSof(result.bytes))]).toEqual([...original.subarray(findSof(original))])
      expect(result.bytes.length).toBeLessThan(original.length)
    }
  })

  it('MPF 索引和 EOI 之后的附加数据（动态照片 / 附加图）一起删', () => {
    const trailing = [...SOI, ...exifSegment(tiff(true, CANON_IFD0)), ...EOI] // 附加图自带 EXIF
    const original = jpeg(SOI, APP0, MPF, SOF0, SOS, SCAN, EOI, trailing)
    expect(readJpegInfo(original).trailingBytes).toBe(trailing.length)
    const result = stripMetadata(original)
    expect(result?.removedTrailing).toBe(trailing.length)
    expect([...(result?.bytes ?? [])]).toEqual([...jpeg(SOI, APP0, SOF0, SOS, SCAN, EOI)])
  })

  it('扫描数据被截断（没有 EOI）：图像数据原样保留', () => {
    const original = jpeg(SOI, exifSegment(tiff(true, CANON_IFD0)), SOF0, SOS, SCAN)
    const result = stripMetadata(original)
    expect([...(result?.bytes ?? [])]).toEqual([...jpeg(SOI, SOF0, SOS, SCAN)])
    expect(readJpegInfo(original).warnings.length).toBeGreaterThan(0)
  })

  it('标记前的 FF 填充字节不影响解析', () => {
    const original = jpeg(SOI, [0xff, 0xff], exifSegment(tiff(true, CANON_IFD0)), SOF0, SOS, SCAN, [0xff], EOI)
    expect(readJpegInfo(original).exif?.make).toBe('Canon')
    expect(readJpegInfo(stripMetadata(original)?.bytes ?? new Uint8Array()).exif).toBeNull()
  })

  it('没有元数据的文件清除后字节完全不变', () => {
    const original = jpeg(SOI, APP0, ICC, SOF0, SOS, SCAN, EOI)
    expect([...(stripMetadata(original)?.bytes ?? [])]).toEqual([...original])
  })
})

describe('显示用的小函数', () => {
  it('dmsToDecimal', () => {
    expect(dmsToDecimal([{ num: 30, den: 1 }, { num: 30, den: 1 }, { num: 0, den: 1 }], 'N')).toBe(30.5)
    expect(dmsToDecimal([{ num: 30, den: 1 }, { num: 30, den: 1 }, { num: 0, den: 1 }], 'w')).toBe(-30.5)
    expect(dmsToDecimal([{ num: 30, den: 1 }, { num: 70, den: 1 }, { num: 0, den: 1 }], 'N')).toBeNull()
    expect(dmsToDecimal([{ num: 30, den: 1 }], 'N')).toBeNull()
    expect(dmsToDecimal([{ num: 30, den: 1 }, { num: 0, den: 1 }, { num: 0, den: 1 }], '')).toBeNull()
  })

  it('formatExposure / formatExifDate / formatGps / mapLink', () => {
    expect(formatExposure({ num: 1, den: 125 })).toBe('1/125 s')
    expect(formatExposure({ num: 10, den: 4000 })).toBe('1/400 s')
    expect(formatExposure({ num: 2, den: 1 })).toBe('2 s')
    expect(formatExposure({ num: 0, den: 1 })).toBe('—')
    expect(formatExifDate('2024:05:01 08:30:00')).toBe('2024-05-01 08:30:00')
    expect(formatExifDate('garbage')).toBe('garbage')
    expect(formatGps({ latitude: -39.9042, longitude: 116.4074 })).toBe('39.904200° S, 116.407400° E')
    expect(mapLink({ latitude: 39.9042, longitude: -116.4074 })).toBe('https://www.openstreetmap.org/?mlat=39.904200&mlon=-116.407400#map=16/39.904200/-116.407400')
  })

  it('orientationLabel / orientationSwapsAxes / cleanFileName', () => {
    expect(orientationLabel(6)).toBe('顺时针旋转 90°')
    expect(orientationLabel(9)).toBe('未知（9）')
    expect([1, 3, 6, 8].map(orientationSwapsAxes)).toEqual([false, false, true, true])
    expect(cleanFileName('IMG_001.JPG')).toBe('IMG_001-clean.JPG')
    expect(cleanFileName('a.b.jpeg')).toBe('a.b-clean.jpeg')
    expect(cleanFileName('photo')).toBe('photo-clean.jpg')
  })
})
