/* 图片转 PDF —— 纯函数：JPEG 头解析 + 页面几何 + 手写最小合法 PDF，可单测。
 *
 * 为什么手写而不是引库：项目铁律是「不引第三方依赖」，而「把若干张 JPEG
 * 各占一页拼成一个 PDF」这件事本身不难，PDF 是一个「对象 + 交叉引用表」的
 * 简单容器格式。手写出来体积最小、可解释、面试能讲清每一段。
 *
 * 图片怎么进 PDF：PDF 的 DCTDecode 滤镜吃的就是 JPEG 压缩数据，阅读器自己解码。
 * - 输入本来就是 JPEG：组件直接把**原始文件字节**交过来（parseJpegInfo 读出宽高和颜色分量），
 *   不解码、不二次压缩，画质无损、体积就是原图大小。
 * - PNG / WebP 等：组件先用 canvas 重编码成 JPEG 再交过来（这一步有损，但别无他法：
 *   PDF 里直接存 PNG 要自己实现 Flate + 预测器，超出这个工具的范围）。
 * 这里只负责「打包」，不知道字节是透传的还是重编码的。
 *
 * 最容易错的地方是 xref（交叉引用表）：每个对象的「字节偏移」必须精确到 byte。
 * 所以全程用 TextEncoder 编码后再累计字节长度，绝不能用字符串 length 估算
 * （二进制图片字节不是 UTF-8，用字符串长度会错位）。
 */

export type PdfColorSpace = 'DeviceGray' | 'DeviceRGB' | 'DeviceCMYK'

export interface PdfImage {
  /** 一张 JPEG 的完整字节（以 0xFF 0xD8 开头） */
  bytes: Uint8Array
  /** JPEG 里实际编码的像素宽（SOF 里的值，不考虑 EXIF 旋转） */
  width: number
  /** JPEG 里实际编码的像素高 */
  height: number
  colorSpace: PdfColorSpace
  /**
   * 反相解码。Photoshop 存的 CMYK JPEG（带 Adobe APP14 段）数值是反的，
   * 不加 /Decode [1 0 1 0 1 0 1 0] 的话颜色整体反相。
   */
  invert?: boolean
}

/** 图片在页面上怎么摆：PDF 的 cm 矩阵 [a b c d e f]，把 1×1 的图片空间映射到页面坐标 */
export type PdfMatrix = [number, number, number, number, number, number]

export interface PdfPage {
  image: PdfImage
  /** 页面宽（pt，1pt = 1/72 英寸） */
  width: number
  height: number
  matrix: PdfMatrix
}
// ───────────────────────── JPEG 头解析 ─────────────────────────

export interface JpegInfo {
  /** SOF 段里的像素宽高（编码方向，不考虑 EXIF 旋转） */
  width: number
  height: number
  /** 颜色分量数：1 灰度 / 3 YCbCr(RGB) / 4 CMYK(YCCK) */
  components: number
  /** 是否有 Adobe APP14 段（决定 CMYK 要不要反相） */
  adobe: boolean
  /** EXIF 方向 1~8，没有 EXIF 时为 1 */
  orientation: number
}

/** 读 EXIF APP1 段里的方向标签（0x0112）。payload 从 "Exif\0\0" 开始；读不到返回 1 */
function readExifOrientation(bytes: Uint8Array, start: number, end: number): number {
  const tiff = start + 6
  if (end - tiff < 8) return 1
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49 // "II" 小端，"MM" 大端
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1])
  const u32 = (at: number) => (little
    ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + bytes[at + 3] * 0x1000000
    : bytes[at] * 0x1000000 + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]))
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return 1
  const count = u16(ifd)
  for (let n = 0; n < count; n += 1) {
    const entry = ifd + 2 + n * 12
    if (entry + 12 > end) return 1
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8) // SHORT 类型的值放在条目的值字段开头
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

/**
 * 从 JPEG 字节里读出 SOF0/SOF1/SOF2（基线 / 扩展 / 渐进）的宽高和分量数，
 * 顺带记下有没有 Adobe APP14 段、EXIF 方向。不是 JPEG 或结构不认识时返回 null，
 * 组件据此退回 canvas 重编码 —— 宁可多转一次，不能塞一个阅读器打不开的流进去。
 *
 * JPEG 的结构是一串「段」：0xFF + 标记字节 + 2 字节大端长度（含长度自己）+ 内容。
 * SOF 段内容：精度(1) 高(2) 宽(2) 分量数(1) ……
 */
export function parseJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let adobe = false
  let orientation = 1
  let pos = 2
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null // 段和段之间必须紧挨，错位说明文件坏了
    const marker = bytes[pos + 1]
    if (marker === 0xff) { pos += 1; continue } // 填充字节
    // 没有长度字段的独立标记（TEM、RST0~7）
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return null // 到了 EOI / 扫描数据还没见到 SOF
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3]
    const start = pos + 4
    const end = pos + 2 + length
    if (length < 2 || end > bytes.length) return null
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (end - start < 6) return null
      const precision = bytes[start]
      const height = (bytes[start + 1] << 8) | bytes[start + 2]
      const width = (bytes[start + 3] << 8) | bytes[start + 4]
      const components = bytes[start + 5]
      // 高为 0 表示「高度写在后面的 DNL 段」，极少见，不处理
      if (precision !== 8 || width === 0 || height === 0) return null
      return { width, height, components, adobe, orientation }
    }
    // 其他 SOF（无损、算术编码等）大多数阅读器不支持，退回重编码
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return null
    if (marker === 0xee && end - start >= 5 && String.fromCharCode(...bytes.subarray(start, start + 5)) === 'Adobe') adobe = true
    if (marker === 0xe1 && end - start >= 6 && String.fromCharCode(...bytes.subarray(start, start + 4)) === 'Exif') {
      orientation = readExifOrientation(bytes, start, end)
    }
    pos = end
  }
  return null
}

/**
 * JPEG 分量数 → PDF 颜色空间。返回 null 表示「别透传，走 canvas」。
 * 4 分量只在有 Adobe APP14 时透传（并反相）；没有 APP14 的 CMYK 少见、
 * 各家软件存法不一，猜错了整页颜色就是反的，所以不猜。
 */
export function jpegColorSpace(info: JpegInfo): { colorSpace: PdfColorSpace; invert: boolean } | null {
  if (info.components === 1) return { colorSpace: 'DeviceGray', invert: false }
  if (info.components === 3) return { colorSpace: 'DeviceRGB', invert: false }
  if (info.components === 4 && info.adobe) return { colorSpace: 'DeviceCMYK', invert: true }
  return null
}

/** EXIF 方向 5~8 是转了 90°：显示出来的宽高和编码的宽高对调 */
export function displaySize(info: JpegInfo): { width: number; height: number } {
  return info.orientation >= 5
    ? { width: info.height, height: info.width }
    : { width: info.width, height: info.height }
}
// ───────────────────────── 页面几何 ─────────────────────────

export type PageMode = 'a4' | 'original'

export const PAGE_MODES: { id: PageMode; label: string }[] = [
  { id: 'a4', label: 'A4（图片居中）' },
  { id: 'original', label: '原尺寸' },
]

/** A4 = 210×297mm，换成 pt（mm / 25.4 × 72），保留两位小数 */
export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89
/** A4 页边距 36pt = 0.5 英寸，打印机通常留白在这个量级 */
export const A4_MARGIN = 36
/** PDF 1.4 规定页面边长 3~14400pt（约 5 米），超出阅读器会拒绝或截断 */
export const PDF_MAX_SIDE = 14400
export const PDF_MIN_SIDE = 3
/** 原尺寸模式按屏幕 96dpi 换算：1px = 72/96 = 0.75pt，截图打开和屏幕上一样大 */
export const PT_PER_PX = 72 / 96

/** 两位小数，PDF 里数字太长没意义，也让测试能精确比对 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * EXIF 方向 → 贴图矩阵。PDF 把图片当成 1×1 的方块，(0,0) 是图片**左下**、(1,1) 右上；
 * 矩阵把它映射到页面上 (x, y) 起、宽 w 高 h 的显示框里，同时把编码方向转成显示方向。
 * 浏览器显示 JPEG 时会按 EXIF 转正，透传字节时 PDF 阅读器不认 EXIF，只能靠这个矩阵转。
 */
export function orientationMatrix(orientation: number, x: number, y: number, w: number, h: number): PdfMatrix {
  switch (orientation) {
    case 2: return [-w, 0, 0, h, x + w, y] // 水平镜像
    case 3: return [-w, 0, 0, -h, x + w, y + h] // 转 180°
    case 4: return [w, 0, 0, -h, x, y + h] // 垂直镜像
    case 5: return [0, -h, -w, 0, x + w, y + h] // 转置
    case 6: return [0, -h, w, 0, x, y + h] // 顺时针 90°
    case 7: return [0, h, w, 0, x, y] // 反转置
    case 8: return [0, h, -w, 0, x + w, y] // 逆时针 90°
    default: return [w, 0, 0, h, x, y]
  }
}

export interface PageLayout {
  /** 页面宽高（pt） */
  width: number
  height: number
  /** 图片显示框在页面上的位置和大小（pt，原点在左下角） */
  x: number
  y: number
  drawWidth: number
  drawHeight: number
}

/**
 * 按显示尺寸（像素，已按 EXIF 转正）算页面和图片位置。
 *
 * - A4：竖版 A4，图片等比缩进去、居中。只缩不放：小图硬放大到整页会糊，
 *   按 96dpi 的原始大小摆在页面中间更诚实。
 * - 原尺寸：页面 = 图片按 96dpi 换算的大小；任一边超过 14400pt 时等比缩小
 *   （长截图常见，不缩阅读器打不开）。过小的图把页面撑到 3pt，图片居中。
 */
export function layoutPage(pixelWidth: number, pixelHeight: number, mode: PageMode): PageLayout {
  const w = Math.max(1, pixelWidth) * PT_PER_PX
  const h = Math.max(1, pixelHeight) * PT_PER_PX
  if (mode === 'a4') {
    const scale = Math.min(1, (A4_WIDTH - A4_MARGIN * 2) / w, (A4_HEIGHT - A4_MARGIN * 2) / h)
    const drawWidth = round2(w * scale)
    const drawHeight = round2(h * scale)
    return {
      width: A4_WIDTH,
      height: A4_HEIGHT,
      x: round2((A4_WIDTH - drawWidth) / 2),
      y: round2((A4_HEIGHT - drawHeight) / 2),
      drawWidth,
      drawHeight,
    }
  }
  const scale = Math.min(1, PDF_MAX_SIDE / w, PDF_MAX_SIDE / h)
  const drawWidth = round2(w * scale)
  const drawHeight = round2(h * scale)
  // 先保上限再保下限：极细长图（如 1×100000）缩完宽度不足 3pt，把页面撑宽、图片居中
  const width = Math.max(PDF_MIN_SIDE, drawWidth)
  const height = Math.max(PDF_MIN_SIDE, drawHeight)
  return { width, height, x: round2((width - drawWidth) / 2), y: round2((height - drawHeight) / 2), drawWidth, drawHeight }
}

/** 把一张图和它的显示尺寸、EXIF 方向组装成一页 */
export function makePage(image: PdfImage, display: { width: number; height: number }, orientation: number, mode: PageMode): PdfPage {
  const layout = layoutPage(display.width, display.height, mode)
  return {
    image,
    width: layout.width,
    height: layout.height,
    matrix: orientationMatrix(orientation, layout.x, layout.y, layout.drawWidth, layout.drawHeight),
  }
}

/** 页面排序：把 index 处的项和相邻项互换。越界时原样返回（同一个数组引用，调用方可据此判断没动） */
export function movePage<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}
// ───────────────────────── PDF 拼装 ─────────────────────────

/** 数字转 PDF 文本：最多两位小数，去掉无意义的尾零（595.28 / 36 / -12.5） */
function num(value: number): string {
  const rounded = round2(value)
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * 把若干页打包成一个 PDF 1.4，返回完整文件字节。
 *
 * 对象编号布局（n = 页数）：
 *   1        Catalog
 *   2        Pages
 *   3+3i     第 i 页的 Page 对象
 *   4+3i     第 i 页的 Contents 内容流
 *   5+3i     第 i 页的 Image XObject
 * 每页固定占 3 个对象，编号可算，所以 Kids 引用能提前拼出来。
 */
export function buildPdf(pages: PdfPage[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  // 所有写入都走这里，保证 length 始终是真实字节数（偏移计算的唯一依据）
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    length += bytes.length
  }
  const writeText = (text: string) => push(encoder.encode(text))

  const pageCount = pages.length
  const catalogId = 1
  const pagesId = 2
  const firstPageId = 3

  // offsets[对象号] = 该对象 `N 0 obj` 起始处的字节偏移，最后写 xref 用
  const offsets: number[] = []
  const beginObject = (id: number) => {
    offsets[id] = length
    writeText(`${id} 0 obj\n`)
  }
  const endObject = () => writeText('endobj\n')

  // ── 文件头 ──
  writeText('%PDF-1.4\n')
  // 第二行放几个高位字节，让传输工具把文件当二进制处理（PDF 规范建议的「二进制注释」）。
  // 注意 TextEncoder 会把它们编成 UTF-8 多字节，仍然都 ≥ 0x80，目的照样达到
  writeText('%\xE2\xE3\xCF\xD3\n')

  // ── Catalog（文档根）──
  beginObject(catalogId)
  writeText(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`)
  endObject()

  // ── Pages（页树根）──
  // Kids 里的页对象号形如 3, 6, 9…，可直接算出来
  beginObject(pagesId)
  const kids = pages.map((_, i) => `${firstPageId + i * 3} 0 R`).join(' ')
  writeText(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\n`)
  endObject()

  // ── 每页：Page + Contents + Image ──
  pages.forEach((page, i) => {
    const pageId = firstPageId + i * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    const { image } = page

    // Page 对象：指向内容流和图片 XObject，资源里登记 /Im0
    beginObject(pageId)
    writeText(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\n`,
    )
    endObject()

    // 内容流：cm 矩阵把图片的 1×1 单位方块摆到页面上（含缩放、平移、按 EXIF 旋转）
    const content = `q\n${page.matrix.map(num).join(' ')} cm\n/Im0 Do\nQ\n`
    const contentBytes = encoder.encode(content)
    beginObject(contentId)
    writeText(`<< /Length ${contentBytes.length} >>\nstream\n`)
    push(contentBytes)
    // endstream 前的换行是「流结束标记」，不计入 /Length（PDF 规范如此）
    writeText('\nendstream\n')
    endObject()

    // Image XObject：DCTDecode 表示「这段是 JPEG 压缩数据，阅读器自己解码」。
    // Width/Height 必须是 JPEG 里实际编码的像素数，和页面上画多大无关
    const decode = image.invert ? ' /Decode [1 0 1 0 1 0 1 0]' : ''
    beginObject(imageId)
    writeText(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /${image.colorSpace} /BitsPerComponent 8${decode} /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
    )
    push(image.bytes) // 原始 JPEG 字节，不能当文本处理
    writeText('\nendstream\n')
    endObject()
  })

  // ── 交叉引用表 ──
  // 对象总数 = 最后一个对象号 + 1（0 号是「自由对象」，永远存在）
  const lastObjectId = pagesId + pageCount * 3 // n=0 时=2，n>=1 时=3n+2
  const totalObjects = lastObjectId + 1
  const xrefOffset = length
  writeText(`xref\n0 ${totalObjects}\n`)
  // 0 号自由对象：固定格式，指向空链表头
  writeText('0000000000 65535 f \n')
  // 每个对象一条：10 位偏移 + 空格 + 5 位代号 + 空格 + 'n' + 空格 + 换行 = 恰好 20 字节
  for (let id = 1; id <= lastObjectId; id += 1) {
    writeText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }

  // ── trailer + startxref + EOF ──
  writeText(`trailer\n<< /Size ${totalObjects} /Root ${catalogId} 0 R >>\n`)
  writeText(`startxref\n${xrefOffset}\n%%EOF\n`)

  // 把分块按顺序拼成一整块 Uint8Array
  const out = new Uint8Array(length)
  let cursor = 0
  for (const chunk of chunks) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}
