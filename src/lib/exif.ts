/* JPEG 元数据（EXIF）读取与无损清除 —— 纯函数，可单测（只吃 Uint8Array，不碰 File / Canvas）。
 *
 * JPEG 文件是一串「段」：FF D8（SOI）开头，每段 FF xx + 2 字节长度（大端，含长度字段本身）+ 内容；
 * FF DA（SOS）之后是压缩后的图像数据（熵编码段），一直到 FF D9（EOI）。
 * EXIF 放在 APP1 段里：内容以 "Exif\0\0" 开头，后面是一个完整的 TIFF 结构（字节序头 + IFD 链）。
 * 规范：CIPA DC-008（Exif 2.3）、TIFF 6.0 第 2 节。
 *
 * 防御原则：照片来自用户，可能是截断的、被别的软件写坏的、甚至故意构造的。
 * 每次读字节都先查边界；IFD 记录访问过的偏移防循环；读不出来的字段跳过，返回已经读到的部分，绝不抛异常。
 */

// ---------- 段扫描 ----------

interface Piece {
  /** 段标记（FF 后面那个字节）；熵编码数据为 null */
  marker: number | null
  /** 在文件里的起止（含标记），end 不含 */
  start: number
  end: number
  /** 段内容起点（标记和长度字段之后） */
  dataStart: number
}

interface Scan {
  pieces: Piece[]
  /**
   * 结构解析到这里就断了（SOS 之后才断的：文件截断、或者熵编码数据里有认不出的字节）。
   * 从这个偏移到文件尾，清除时**原样保留** —— 认不出来的字节不敢删，删了可能就是图像数据。
   */
  rawTail: number | null
  /** 第一个 SOS 之前就读不下去（长度字段越界、标记非法）：这种文件不清除，只尽量读 */
  brokenHeader: boolean
  /** 正常读到 EOI 后还剩多少字节（动态照片的视频、HDR 增益图、MPF 附加图会挂在这里） */
  trailing: number
}

// 没有长度字段的独立标记：TEM、RST0–7、SOI、EOI
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7

/** 把 JPEG 切成段 + 熵编码数据块，首尾相接、不重不漏 */
function scanJpeg(bytes: Uint8Array): Scan | null {
  const len = bytes.length
  if (len < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const pieces: Piece[] = [{ marker: 0xd8, start: 0, end: 2, dataStart: 2 }]
  let pos = 2
  let inScan = false
  let seenSos = false
  // 读不下去时统一从这里收尾：SOS 之后断的保留原样尾巴，之前断的标记为坏头
  const stop = (at: number): Scan => (seenSos
    ? { pieces, rawTail: at, brokenHeader: false, trailing: 0 }
    : { pieces, rawTail: null, brokenHeader: true, trailing: 0 })

  while (pos < len) {
    if (inScan) {
      // 熵编码数据里 FF 00 是转义的 FF、FF D0–D7 是重启标记、FF FF 是填充，都算数据；碰到别的真标记才结束
      let p = pos
      while (p + 1 < len && !(bytes[p] === 0xff && bytes[p + 1] !== 0x00 && bytes[p + 1] !== 0xff && !isRestart(bytes[p + 1]))) p += 1
      if (p + 1 >= len) return stop(pos) // 截断：没有 EOI
      if (p > pos) pieces.push({ marker: null, start: pos, end: p, dataStart: pos })
      pos = p
      inScan = false
      continue
    }
    if (bytes[pos] !== 0xff) return stop(pos)
    let p = pos
    while (p + 1 < len && bytes[p + 1] === 0xff) p += 1 // 标记前可以有任意多个 FF 填充字节
    if (p + 1 >= len) return stop(pos)
    const marker = bytes[p + 1]
    if (standalone(marker)) {
      pieces.push({ marker, start: pos, end: p + 2, dataStart: p + 2 })
      pos = p + 2
      if (marker === 0xd9) return { pieces, rawTail: null, brokenHeader: false, trailing: len - pos }
      continue
    }
    if (p + 3 >= len) return stop(pos)
    const segmentLength = (bytes[p + 2] << 8) | bytes[p + 3]
    const end = p + 2 + segmentLength
    if (segmentLength < 2 || end > len) {
      // 段长度越界（文件被截断）。SOS 之前的话，把剩下的字节当成这一段交给读取方尽量解析
      if (!seenSos && segmentLength >= 2) pieces.push({ marker, start: pos, end: len, dataStart: p + 4 })
      return stop(pos)
    }
    pieces.push({ marker, start: pos, end, dataStart: p + 4 })
    pos = end
    if (marker === 0xda) { inScan = true; seenSos = true }
  }
  return stop(pos)
}

const startsWith = (bytes: Uint8Array, at: number, end: number, signature: string) => {
  if (at + signature.length > end) return false
  for (let i = 0; i < signature.length; i += 1) if (bytes[at + i] !== signature.charCodeAt(i)) return false
  return true
}

const EXIF_SIGNATURE = 'Exif\0\0'
const MPF_SIGNATURE = 'MPF\0'

type MetaKind = 'exif' | 'xmp' | 'iptc' | 'mpf' | null

function metaKind(bytes: Uint8Array, piece: Piece): MetaKind {
  const { marker, dataStart, end } = piece
  if (marker === 0xe1) {
    if (startsWith(bytes, dataStart, end, EXIF_SIGNATURE)) return 'exif'
    // 其余 APP1 是 XMP（"http://ns.adobe.com/xap/1.0/\0" 及扩展 XMP）或少见的私有格式，
    // 都是元数据，统一归为 xmp、清除时一并删
    return 'xmp'
  }
  if (marker === 0xed) return 'iptc' // APP13：Photoshop IRB，IPTC 就装在里面
  // APP2 里同时可能有 ICC 色彩配置（要保留）和 MPF 多图索引（指向 EOI 之后的附加图）
  if (marker === 0xe2 && startsWith(bytes, dataStart, end, MPF_SIGNATURE)) return 'mpf'
  return null
}

// ---------- TIFF / IFD ----------

/** 有理数原样保留分子分母：曝光时间要显示成 1/125 而不是 0.008 */
export interface Rational {
  num: number
  den: number
}

type TagValue = { kind: 'text'; text: string } | { kind: 'numbers'; values: number[]; rationals: Rational[] }

// TIFF 6.0 类型码 → 每个值的字节数。13 = IFD（Exif 2.x 允许指针用这个类型）
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 }
/** 单个标签最多读多少个值：我们要的标签最多几十字节，挡住伪造的 count = 40 亿 */
const MAX_VALUES = 1024
/** 单个 IFD 最多多少条目：正常相机几十条，挡住伪造的 65535 条 */
const MAX_ENTRIES = 1000

class TiffReader {
  readonly view: DataView
  readonly little: boolean
  constructor(bytes: Uint8Array, start: number, end: number, little: boolean) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start)
    this.little = little
  }
  get length(): number { return this.view.byteLength }
  fits(offset: number, size: number): boolean { return offset >= 0 && size >= 0 && offset + size <= this.view.byteLength }
  u16(offset: number): number | null { return this.fits(offset, 2) ? this.view.getUint16(offset, this.little) : null }
  u32(offset: number): number | null { return this.fits(offset, 4) ? this.view.getUint32(offset, this.little) : null }
}

function readValue(reader: TiffReader, type: number, count: number, at: number): TagValue | null {
  const size = TYPE_SIZE[type]
  if (!size || count === 0 || count > MAX_VALUES) return null
  const total = size * count
  // 总长 ≤ 4 字节时值就塞在条目里，否则条目里放的是偏移
  const offset = total <= 4 ? at : reader.u32(at)
  if (offset === null || !reader.fits(offset, total)) return null
  const view = reader.view
  const le = reader.little
  if (type === 2) {
    // ASCII 规范上只许 7 位，但不少手机会写 UTF-8（中文软件名），按 UTF-8 解，遇到 \0 截止
    const raw = new Uint8Array(view.buffer, view.byteOffset + offset, total)
    const zero = raw.indexOf(0)
    return { kind: 'text', text: new TextDecoder().decode(zero === -1 ? raw : raw.subarray(0, zero)).trim() }
  }
  const values: number[] = []
  const rationals: Rational[] = []
  for (let i = 0; i < count; i += 1) {
    const p = offset + i * size
    switch (type) {
      case 1: case 7: values.push(view.getUint8(p)); break
      case 6: values.push(view.getInt8(p)); break
      case 3: values.push(view.getUint16(p, le)); break
      case 8: values.push(view.getInt16(p, le)); break
      case 4: case 13: values.push(view.getUint32(p, le)); break
      case 9: values.push(view.getInt32(p, le)); break
      case 11: values.push(view.getFloat32(p, le)); break
      case 12: values.push(view.getFloat64(p, le)); break
      case 5: case 10: {
        const num = type === 5 ? view.getUint32(p, le) : view.getInt32(p, le)
        const den = type === 5 ? view.getUint32(p + 4, le) : view.getInt32(p + 4, le)
        rationals.push({ num, den })
        values.push(den === 0 ? Number.NaN : num / den) // 分母 0：值不可用，下游按 NaN 丢弃
        break
      }
    }
  }
  return { kind: 'numbers', values, rationals }
}

/**
 * 读一个 IFD 里我们关心的标签（wanted）。其余标签（尤其是几 KB 的 MakerNote）不解码。
 * visited 跨 IFD 共享：ExifIFD 指针指回 IFD0 这种循环会被挡住。
 */
function readIfd(reader: TiffReader, offset: number, wanted: ReadonlySet<number>, visited: Set<number>, warnings: string[]): Map<number, TagValue> {
  const tags = new Map<number, TagValue>()
  if (visited.has(offset)) { warnings.push('EXIF 目录有循环引用，已跳过'); return tags }
  visited.add(offset)
  const count = reader.u16(offset)
  if (count === null) { warnings.push('EXIF 目录偏移越界，部分信息读不出'); return tags }
  if (count > MAX_ENTRIES) { warnings.push('EXIF 目录条目数异常，已跳过'); return tags }
  for (let i = 0; i < count; i += 1) {
    const at = offset + 2 + i * 12
    if (!reader.fits(at, 12)) { warnings.push('EXIF 数据被截断，只读出了一部分'); break }
    const tag = reader.u16(at) ?? 0
    if (!wanted.has(tag)) continue
    const value = readValue(reader, reader.u16(at + 2) ?? 0, reader.u32(at + 4) ?? 0, at + 8)
    if (value) tags.set(tag, value)
  }
  return tags
}

const TAG = {
  // IFD0
  make: 0x010f, model: 0x0110, orientation: 0x0112, software: 0x0131, dateTime: 0x0132,
  exifPointer: 0x8769, gpsPointer: 0x8825,
  // ExifIFD
  exposureTime: 0x829a, fNumber: 0x829d, iso: 0x8827, dateTimeOriginal: 0x9003, focalLength: 0x920a,
  pixelX: 0xa002, pixelY: 0xa003,
  // GPS IFD
  latRef: 0x0001, lat: 0x0002, lonRef: 0x0003, lon: 0x0004,
} as const

const IFD0_TAGS = new Set<number>([TAG.make, TAG.model, TAG.orientation, TAG.software, TAG.dateTime, TAG.exifPointer, TAG.gpsPointer])
const EXIF_TAGS = new Set<number>([TAG.exposureTime, TAG.fNumber, TAG.iso, TAG.dateTimeOriginal, TAG.focalLength, TAG.pixelX, TAG.pixelY])
const GPS_TAGS = new Set<number>([TAG.latRef, TAG.lat, TAG.lonRef, TAG.lon])

const text = (tags: Map<number, TagValue>, tag: number): string | undefined => {
  const value = tags.get(tag)
  return value?.kind === 'text' && value.text !== '' ? value.text : undefined
}
const firstNumber = (tags: Map<number, TagValue>, tag: number): number | undefined => {
  const value = tags.get(tag)
  const n = value?.kind === 'numbers' ? value.values[0] : undefined
  return n !== undefined && Number.isFinite(n) ? n : undefined
}
const firstRational = (tags: Map<number, TagValue>, tag: number): Rational | undefined => {
  const value = tags.get(tag)
  const r = value?.kind === 'numbers' ? value.rationals[0] : undefined
  return r && r.den !== 0 ? r : undefined
}

/** 度、分、秒三个有理数 → 十进制度数。S / W 取负。任何一项坏了就返回 null（宁可不显示，也不显示错的位置） */
export function dmsToDecimal(dms: readonly Rational[], ref: string): number | null {
  if (dms.length < 3 || dms.some((part) => part.den === 0)) return null
  const [d, m, s] = dms.map((part) => part.num / part.den)
  if (![d, m, s].every((n) => Number.isFinite(n) && n >= 0) || m >= 60 || s >= 60) return null
  const upper = ref.toUpperCase()
  if (upper !== 'N' && upper !== 'S' && upper !== 'E' && upper !== 'W') return null
  const value = d + m / 60 + s / 3600
  return upper === 'S' || upper === 'W' ? -value : value
}

export interface Gps {
  latitude: number
  longitude: number
}

export interface ExifInfo {
  make?: string
  model?: string
  /** 拍摄时间（DateTimeOriginal），原样 "YYYY:MM:DD HH:MM:SS" */
  dateTimeOriginal?: string
  /** 文件修改时间（IFD0 DateTime） */
  dateTime?: string
  exposureTime?: Rational
  fNumber?: number
  iso?: number
  /** 焦距（毫米） */
  focalLength?: number
  /** 1–8，见 orientationLabel */
  orientation?: number
  software?: string
  pixelWidth?: number
  pixelHeight?: number
  /** 有 GPS 目录（哪怕坐标读不出来）。分享前最该知道的一件事 */
  hasGps: boolean
  /** 坐标能完整读出来时才有 */
  gps?: Gps
}

function parseTiff(bytes: Uint8Array, start: number, end: number, warnings: string[]): ExifInfo | null {
  if (end - start < 8) { warnings.push('EXIF 数据太短，读不出内容'); return null }
  const order = String.fromCharCode(bytes[start], bytes[start + 1])
  if (order !== 'II' && order !== 'MM') { warnings.push('EXIF 字节序标记无法识别'); return null }
  const reader = new TiffReader(bytes, start, end, order === 'II')
  if (reader.u16(2) !== 42) { warnings.push('EXIF 头部校验失败'); return null }
  const ifd0Offset = reader.u32(4)
  if (ifd0Offset === null) return null
  const visited = new Set<number>()
  const ifd0 = readIfd(reader, ifd0Offset, IFD0_TAGS, visited, warnings)
  const exifOffset = firstNumber(ifd0, TAG.exifPointer)
  const exif = exifOffset === undefined ? new Map<number, TagValue>() : readIfd(reader, exifOffset, EXIF_TAGS, visited, warnings)
  const gpsOffset = firstNumber(ifd0, TAG.gpsPointer)
  const gpsTags = gpsOffset === undefined ? new Map<number, TagValue>() : readIfd(reader, gpsOffset, GPS_TAGS, visited, warnings)

  const info: ExifInfo = { hasGps: gpsOffset !== undefined }
  const put = <K extends keyof ExifInfo>(key: K, value: ExifInfo[K] | undefined) => { if (value !== undefined) info[key] = value }
  put('make', text(ifd0, TAG.make))
  put('model', text(ifd0, TAG.model))
  put('software', text(ifd0, TAG.software))
  put('dateTime', text(ifd0, TAG.dateTime))
  const orientation = firstNumber(ifd0, TAG.orientation)
  put('orientation', orientation !== undefined && orientation >= 1 && orientation <= 8 ? orientation : undefined)
  put('dateTimeOriginal', text(exif, TAG.dateTimeOriginal))
  put('exposureTime', firstRational(exif, TAG.exposureTime))
  put('fNumber', firstNumber(exif, TAG.fNumber))
  put('iso', firstNumber(exif, TAG.iso))
  put('focalLength', firstNumber(exif, TAG.focalLength))
  put('pixelWidth', firstNumber(exif, TAG.pixelX))
  put('pixelHeight', firstNumber(exif, TAG.pixelY))

  const lat = gpsTags.get(TAG.lat)
  const lon = gpsTags.get(TAG.lon)
  if (lat?.kind === 'numbers' && lon?.kind === 'numbers') {
    const latitude = dmsToDecimal(lat.rationals, text(gpsTags, TAG.latRef) ?? '')
    const longitude = dmsToDecimal(lon.rationals, text(gpsTags, TAG.lonRef) ?? '')
    if (latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      info.gps = { latitude, longitude }
    }
  }
  return info
}

// ---------- 对外接口 ----------

export interface JpegReport {
  /** 文件头是 FF D8：确实是 JPEG（扩展名可能骗人） */
  isJpeg: boolean
  /** 从帧头（SOF）读的真实像素尺寸，比 EXIF 里的 PixelXDimension 可靠（后者常被编辑软件忘了改） */
  width?: number
  height?: number
  /** 没有 EXIF 段，或 EXIF 段解析失败时为 null */
  exif: ExifInfo | null
  hasXmp: boolean
  hasIptc: boolean
  /** EOI 之后附加的字节数（动态照片的视频、HDR 增益图等）。附加内容可能也带着元数据 */
  trailingBytes: number
  /** 读的过程中遇到的问题（截断、越界、循环），给界面提示用 */
  warnings: string[]
}

const isSof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

/** 读 JPEG 的元数据概况。任何输入都不抛异常 */
export function readJpegInfo(bytes: Uint8Array): JpegReport {
  const scan = scanJpeg(bytes)
  const report: JpegReport = { isJpeg: scan !== null, exif: null, hasXmp: false, hasIptc: false, trailingBytes: 0, warnings: [] }
  if (!scan) return report
  report.trailingBytes = scan.trailing
  if (scan.brokenHeader) report.warnings.push('文件头部结构不完整（可能被截断），只读出了一部分信息')
  else if (scan.rawTail !== null) report.warnings.push('文件结尾不完整（可能没下载完），图像可能显示不全')
  for (const piece of scan.pieces) {
    if (piece.marker === null) continue
    if (report.width === undefined && isSof(piece.marker) && piece.dataStart + 5 <= piece.end) {
      // SOF 内容：精度(1) 高(2) 宽(2)
      report.height = (bytes[piece.dataStart + 1] << 8) | bytes[piece.dataStart + 2]
      report.width = (bytes[piece.dataStart + 3] << 8) | bytes[piece.dataStart + 4]
    }
    const kind = metaKind(bytes, piece)
    if (kind === 'exif' && report.exif === null) {
      report.exif = parseTiff(bytes, piece.dataStart + EXIF_SIGNATURE.length, piece.end, report.warnings)
    } else if (kind === 'xmp') report.hasXmp = true
    else if (kind === 'iptc') report.hasIptc = true
  }
  return report
}

export interface StripResult {
  bytes: Uint8Array
  /** 删掉的段数（APP1 EXIF/XMP、APP13、APP2 MPF） */
  removedSegments: number
  /** 一并删掉的 EOI 之后附加数据的字节数 */
  removedTrailing: number
}

/**
 * 无损清除元数据：只删段，不重新编码图像。删除的有：
 * - APP1：EXIF（相机、时间、GPS）和 XMP（编辑记录、有时也有 GPS）
 * - APP13：Photoshop IRB / IPTC（作者、版权、地点）
 * - APP2 里的 MPF 多图索引，以及 EOI 之后的附加数据：手机的动态照片视频、HDR 增益图、
 *   景深图都挂在 EOI 后面，它们**自带一份 EXIF**，只删主图的段等于没删干净。
 *   这些附加内容靠刚删掉的 XMP / MPF 描述，留着也只是没人认识的垃圾字节。
 * 保留：APP0（JFIF）、APP2 ICC 色彩配置（删了颜色会变）、APP14（Adobe，CMYK 图靠它解码）、
 * 量化表 / 霍夫曼表 / 帧头 / 扫描数据，字节原样拷贝。
 * 不是 JPEG、或第一段扫描之前就坏了，返回 null（不敢动）。
 */
export function stripMetadata(bytes: Uint8Array): StripResult | null {
  const scan = scanJpeg(bytes)
  if (!scan || scan.brokenHeader) return null
  const keep: Piece[] = []
  let removedSegments = 0
  for (const piece of scan.pieces) {
    if (metaKind(bytes, piece) !== null) removedSegments += 1
    else keep.push(piece)
  }
  const tailStart = scan.rawTail ?? bytes.length
  const size = keep.reduce((sum, piece) => sum + piece.end - piece.start, 0) + (bytes.length - tailStart)
  const out = new Uint8Array(size)
  let at = 0
  for (const piece of keep) {
    out.set(bytes.subarray(piece.start, piece.end), at)
    at += piece.end - piece.start
  }
  // 认不出的尾巴（截断的扫描数据）原样保留；正常读到 EOI 的，EOI 之后的附加数据丢掉
  if (scan.rawTail !== null) out.set(bytes.subarray(scan.rawTail), at)
  return { bytes: out, removedSegments, removedTrailing: scan.trailing }
}

// ---------- 显示用 ----------

/** 1/125 s、0.5 s、2 s。快门快于 1 秒时按「1/x」显示，这是摄影里的习惯写法 */
export function formatExposure(time: Rational): string {
  const seconds = time.num / time.den
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`
  return `1/${Math.round(1 / seconds)} s`
}

/** "2024:05:01 08:30:00" → "2024-05-01 08:30:00"。EXIF 时间没有时区，是相机的本地时间 */
export function formatExifDate(value: string): string {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}` : value
}

const ORIENTATIONS: Record<number, string> = {
  1: '正常',
  2: '水平镜像',
  3: '旋转 180°',
  4: '垂直镜像',
  5: '水平镜像后逆时针旋转 90°',
  6: '顺时针旋转 90°',
  7: '水平镜像后顺时针旋转 90°',
  8: '逆时针旋转 90°',
}

/** 方向标签含义：图像数据要怎么转才是正的（6 = 手机竖拍最常见） */
export function orientationLabel(orientation: number): string {
  return ORIENTATIONS[orientation] ?? `未知（${orientation}）`
}

/** 5–8 会交换宽高：按方向显示后，横图变竖图 */
export function orientationSwapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8
}

/** 39.904200° N, 116.407400° E */
export function formatGps({ latitude, longitude }: Gps): string {
  const lat = `${Math.abs(latitude).toFixed(6)}° ${latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(longitude).toFixed(6)}° ${longitude >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}

/**
 * OpenStreetMap 链接。只在用户主动点击时打开（会把坐标发给 openstreetmap.org）。
 * 选 OSM 而不是国内地图：照片 GPS 是 WGS-84 坐标，OSM 直接用 WGS-84；
 * 高德 / 百度用加偏坐标（GCJ-02 / BD-09），直接塞进去会偏几百米。
 */
export function mapLink({ latitude, longitude }: Gps): string {
  const lat = latitude.toFixed(6)
  const lon = longitude.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}

/** "IMG_001.JPG" → "IMG_001-clean.JPG"；没有扩展名的补 .jpg */
export function cleanFileName(name: string): string {
  const match = /^(.*?)(\.[^./\\]+)?$/.exec(name)
  const base = match?.[1] || 'photo'
  return `${base}-clean${match?.[2] ?? '.jpg'}`
}
