/* 图片转 PDF —— 纯函数，手写一个最小合法 PDF，可单测。
 *
 * 为什么手写而不是引库：项目铁律是「不引第三方依赖」，而「把若干张 JPEG
 * 各占一页拼成一个 PDF」这件事本身不难，PDF 是一个「对象 + 交叉引用表」的
 * 简单容器格式。手写出来体积最小、可解释、面试能讲清每一段。
 *
 * 关键取舍：图片**不做解码**，直接用 DCTDecode 滤镜把 JPEG 原始字节塞进去。
 * JPEG 的 DCT 压缩数据本身就是 PDF 里 DCTDecode 流要的东西，PDF 阅读器会自己解。
 * 这样既省 CPU 又不会二次压缩掉画质 —— 组件层已经把任意格式重编码成 JPEG，
 * 这里只负责「打包」。
 *
 * 最容易错的地方是 xref（交叉引用表）：每个对象的「字节偏移」必须精确到 byte。
 * 所以全程用 TextEncoder 编码后再累计字节长度，绝不能用字符串 length 估算
 * （二进制图片字节不是 UTF-8，用字符串长度会错位）。
 */

export interface PdfImage {
  /** 一张 JPEG 的原始字节（以 0xFF 0xD8 开头、0xFF 0xD9 结尾） */
  bytes: Uint8Array
  /** 图片像素宽，同时作为页面宽（1px = 1pt） */
  width: number
  /** 图片像素高，同时作为页面高 */
  height: number
}

/**
 * 把若干张 JPEG 打包成一个 PDF 1.4（每张图一页），返回完整文件字节。
 *
 * 对象编号布局（n = 图片数）：
 *   1        Catalog
 *   2        Pages
 *   3+3i     第 i 页的 Page 对象
 *   4+3i     第 i 页的 Contents 内容流
 *   5+3i     第 i 页的 Image XObject
 * 每页固定占 3 个对象，编号可算，所以 Kids 引用能提前拼出来。
 */
export function buildPdf(images: PdfImage[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let length = 0
  // 所有写入都走这里，保证 length 始终是真实字节数（偏移计算的唯一依据）
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    length += bytes.length
  }
  const writeText = (text: string) => push(encoder.encode(text))

  const pageCount = images.length
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
  // 第二行放几个高位字节，让传输工具把文件当二进制处理（PDF 规范建议的「二进制注释」）
  writeText('%\xE2\xE3\xCF\xD3\n')

  // ── Catalog（文档根）──
  beginObject(catalogId)
  writeText(`<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`)
  endObject()

  // ── Pages（页树根）──
  // Kids 里的页对象号形如 3, 6, 9…，可直接算出来
  beginObject(pagesId)
  const kids = images.map((_, i) => `${firstPageId + i * 3} 0 R`).join(' ')
  writeText(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\n`)
  endObject()

  // ── 每页：Page + Contents + Image ──
  images.forEach((image, i) => {
    const pageId = firstPageId + i * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    // MediaBox 必须是数字；round 一下避免出现 1024.5 这种（像素本就整数，防御性处理）
    const w = Math.round(image.width)
    const h = Math.round(image.height)

    // Page 对象：指向内容流和图片 XObject，资源里登记 /Im0
    beginObject(pageId)
    writeText(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\n`,
    )
    endObject()

    // 内容流：把图片铺满整页（cm 矩阵把单位方块的 1x1 缩放成 W×H）
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`
    const contentBytes = encoder.encode(content)
    beginObject(contentId)
    writeText(`<< /Length ${contentBytes.length} >>\nstream\n`)
    push(contentBytes)
    // endstream 前的换行是「流结束标记」，不计入 /Length（PDF 规范如此）
    writeText('\nendstream\n')
    endObject()

    // Image XObject：DCTDecode 表示「这段是 JPEG 压缩数据，别管它，直接解码」
    beginObject(imageId)
    writeText(
      `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
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
