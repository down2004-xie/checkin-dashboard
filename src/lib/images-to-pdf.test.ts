import { describe, expect, it } from 'vitest'

import {
  A4_HEIGHT,
  A4_WIDTH,
  PDF_MAX_SIDE,
  buildPdf,
  displaySize,
  jpegColorSpace,
  layoutPage,
  makePage,
  movePage,
  orientationMatrix,
  parseJpegInfo,
  type PdfImage,
  type PdfPage,
} from './images-to-pdf'

// 一张「假的 JPEG」：只需要首尾的 SOI/EOI 标记，结构测试不真的解码它
const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

/** 用 latin1 解码：每个字节映射成一个字符（0-255），字节偏移 == 字符下标，便于按偏移切。 */
function toLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

function makeImage(width: number, height: number): PdfImage {
  return { bytes: FAKE_JPEG, width, height, colorSpace: 'DeviceRGB' }
}

/** 原尺寸模式下按「像素 = 显示尺寸、无旋转」组一页；尺寸用 4/3 倍，换算成 pt 正好是整数 */
function makePageOf(width: number, height: number): PdfPage {
  return makePage(makeImage(width, height), { width, height }, 1, 'original')
}

/**
 * 从 PDF 里解析出 xref 表：返回「对象号 -> 该对象在文件里的字节偏移」。
 * 走真实路径：先读 startxref 找到 xref 起点，再按每行 20 字节读出偏移。
 * 这样能真正验证我们写出的偏移是对的，而不是假设它对。
 */
function readXrefOffsets(pdf: Uint8Array): Map<number, number> {
  const text = toLatin1(pdf)
  const startxref = /startxref\n(\d+)\n/.exec(text)
  if (!startxref) throw new Error('找不到 startxref')
  const xrefOffset = Number(startxref[1])

  const header = /^xref\n0 (\d+)\n/.exec(text.slice(xrefOffset))
  if (!header) throw new Error('xref 头格式不对')
  const total = Number(header[1])
  const entriesStart = xrefOffset + header[0].length

  const map = new Map<number, number>()
  for (let id = 0; id < total; id += 1) {
    const entry = text.slice(entriesStart + id * 20, entriesStart + id * 20 + 20)
    map.set(id, Number(entry.slice(0, 10)))
  }
  return map
}

describe('buildPdf', () => {
  it('以 %PDF-1.4 开头', () => {
    const pdf = buildPdf([makePageOf(133, 106)])
    expect(toLatin1(pdf).startsWith('%PDF-1.4')).toBe(true)
  })

  it('包含 Catalog 和 Pages 根对象', () => {
    const text = toLatin1(buildPdf([makePageOf(133, 106)]))
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Pages')
  })

  it('页对象数量等于图片数量', () => {
    const count = (n: number) => toLatin1(buildPdf(Array.from({ length: n }, () => makePageOf(60, 60)))).split('/Type /Page ').length - 1
    expect(count(1)).toBe(1)
    expect(count(3)).toBe(3)
  })

  it('以 %%EOF 结尾', () => {
    const text = toLatin1(buildPdf([makePageOf(133, 106)]))
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('包含 startxref', () => {
    expect(toLatin1(buildPdf([makePageOf(133, 106)]))).toContain('startxref')
  })

  it('单张图：Count 1、MediaBox 按 96dpi 换算（800×600px → 600×450pt）', () => {
    const text = toLatin1(buildPdf([makePageOf(800, 600)]))
    expect(text).toContain('/Count 1')
    expect(text).toContain('/MediaBox [0 0 600 450]')
    // 内容流按页面尺寸缩放铺满整页；XObject 的宽高仍是像素数
    expect(text).toContain('600 0 0 450 0 0 cm')
    expect(text).toContain('/Width 800 /Height 600')
  })

  it('两张图：Count 2、两页各自尺寸独立', () => {
    const text = toLatin1(buildPdf([makePageOf(200, 100), makePageOf(400, 300)]))
    expect(text).toContain('/Count 2')
    expect(text).toContain('/MediaBox [0 0 150 75]')
    expect(text).toContain('/MediaBox [0 0 300 225]')
  })

  it('xref 里每个对象的偏移都精确指向 "N 0 obj"', () => {
    const pdf = buildPdf([makePageOf(120, 90), makePageOf(80, 60)])
    const text = toLatin1(pdf)
    const offsets = readXrefOffsets(pdf)
    // 对象 0 是自由对象，跳过；其余每个偏移处都应正好是该对象的开头
    const lastId = offsets.size - 1
    for (let id = 1; id <= lastId; id += 1) {
      const offset = offsets.get(id)!
      expect(text.startsWith(`${id} 0 obj`, offset)).toBe(true)
    }
  })

  it('空数组也产出合法 PDF（0 页，Count 0）', () => {
    const pdf = buildPdf([])
    const text = toLatin1(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Pages')
    expect(text).toContain('/Count 0')
    expect(text).toContain('/Kids []')
    expect(text).not.toContain('/Type /Page ')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    // 空文档的 xref 只有 0/1/2 三个对象（自由 + Catalog + Pages）
    expect(readXrefOffsets(pdf).size).toBe(3)
  })
})
// ── 手工构造 JPEG 头：只拼 parseJpegInfo 会读的段，不需要真能解码 ──

const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0))
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}
function sof(marker: number, width: number, height: number, components: number): number[] {
  const specs = Array.from({ length: components }, (_, i) => [i + 1, 0x11, 0]).flat()
  return segment(marker, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, components, ...specs])
}
const APP0 = segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const DQT = segment(0xdb, [0, ...Array(64).fill(1)])
const ADOBE = segment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 2])
/** EXIF APP1：TIFF 头 + IFD0 里只有一条 Orientation */
function exif(orientation: number, little: boolean): number[] {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff])
  const u32 = (v: number) => (little ? [v & 0xff, 0, 0, 0] : [0, 0, 0, v & 0xff])
  const tiff = [...(little ? ascii('II') : ascii('MM')), ...u16(42), ...u32(8),
    ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
  return segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff])
}
const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat(), 0xff, 0xda, 0, 2, 0xff, 0xd9])

describe('parseJpegInfo', () => {
  it('基线 SOF0：跳过 APP0 / DQT，读出宽高和分量数', () => {
    expect(parseJpegInfo(jpeg(APP0, DQT, sof(0xc0, 4032, 3024, 3)))).toEqual({
      width: 4032, height: 3024, components: 3, adobe: false, orientation: 1,
    })
  })

  it('渐进 SOF2、扩展 SOF1 都认；灰度 1 分量', () => {
    expect(parseJpegInfo(jpeg(sof(0xc2, 100, 50, 1)))?.components).toBe(1)
    expect(parseJpegInfo(jpeg(sof(0xc1, 100, 50, 3)))?.width).toBe(100)
  })

  it('段之间的 0xFF 填充字节被跳过', () => {
    expect(parseJpegInfo(jpeg([0xff, 0xff], sof(0xc0, 10, 20, 3)))?.height).toBe(20)
  })

  it('记下 Adobe APP14', () => {
    expect(parseJpegInfo(jpeg(ADOBE, sof(0xc0, 10, 10, 4)))?.adobe).toBe(true)
  })

  it('读 EXIF 方向（大端 MM 和小端 II 都行）', () => {
    expect(parseJpegInfo(jpeg(exif(6, false), sof(0xc0, 4032, 3024, 3)))?.orientation).toBe(6)
    expect(parseJpegInfo(jpeg(exif(8, true), sof(0xc0, 4032, 3024, 3)))?.orientation).toBe(8)
  })

  it('不是 JPEG / 截断 / 不支持的 SOF / 扫描前没有 SOF → null', () => {
    expect(parseJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(parseJpegInfo(jpeg(APP0).slice(0, 10))).toBeNull()
    expect(parseJpegInfo(jpeg(sof(0xc3, 10, 10, 3)))).toBeNull() // 无损 JPEG
    expect(parseJpegInfo(jpeg(APP0))).toBeNull()
  })
})

describe('jpegColorSpace / displaySize', () => {
  const info = (components: number, adobe = false, orientation = 1) => ({ width: 40, height: 30, components, adobe, orientation })

  it('1 → Gray，3 → RGB，4 + Adobe → CMYK 反相', () => {
    expect(jpegColorSpace(info(1))).toEqual({ colorSpace: 'DeviceGray', invert: false })
    expect(jpegColorSpace(info(3))).toEqual({ colorSpace: 'DeviceRGB', invert: false })
    expect(jpegColorSpace(info(4, true))).toEqual({ colorSpace: 'DeviceCMYK', invert: true })
  })

  it('没有 APP14 的 4 分量不猜，返回 null 走 canvas', () => {
    expect(jpegColorSpace(info(4))).toBeNull()
    expect(jpegColorSpace(info(2))).toBeNull()
  })

  it('EXIF 方向 5~8 宽高对调', () => {
    expect(displaySize(info(3, false, 6))).toEqual({ width: 30, height: 40 })
    expect(displaySize(info(3, false, 3))).toEqual({ width: 40, height: 30 })
  })
})

describe('layoutPage', () => {
  it('A4：手机横拍 4000×3000 等比缩进页边距内、居中', () => {
    const page = layoutPage(4000, 3000, 'a4')
    expect([page.width, page.height]).toEqual([A4_WIDTH, A4_HEIGHT])
    expect(page.drawWidth).toBeCloseTo(523.28, 2) // 595.28 − 2×36
    expect(page.drawHeight).toBeCloseTo(392.46, 2)
    expect(page.x).toBeCloseTo(36, 2)
    expect(page.y + page.drawHeight / 2).toBeCloseTo(A4_HEIGHT / 2, 1)
  })

  it('A4：小图不放大，按 96dpi 原大居中', () => {
    const page = layoutPage(100, 100, 'a4')
    expect([page.drawWidth, page.drawHeight]).toEqual([75, 75])
    expect(page.x).toBeCloseTo((A4_WIDTH - 75) / 2, 2)
  })

  it('原尺寸：4000×3000 → 3000×2250pt（不再是 1px = 1pt 的 141cm）', () => {
    const page = layoutPage(4000, 3000, 'original')
    expect([page.width, page.height, page.x, page.y]).toEqual([3000, 2250, 0, 0])
  })

  it('原尺寸：长截图超过 14400pt 时等比缩小', () => {
    const page = layoutPage(1080, 20000, 'original')
    expect(page.height).toBe(PDF_MAX_SIDE)
    expect(page.width).toBeCloseTo(777.6, 2)
  })

  it('原尺寸：极细长图页面不小于 3pt，图片居中', () => {
    const page = layoutPage(1, 100000, 'original')
    expect(page.width).toBe(3)
    expect(page.height).toBeLessThanOrEqual(PDF_MAX_SIDE)
    expect(page.x).toBeGreaterThan(0)
  })
})

describe('orientationMatrix', () => {
  // PDF 图片空间：(u, v) ∈ [0,1]²，v = 1 是图片第一行（编码方向的顶边）
  const apply = (m: number[], u: number, v: number) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]
  const box = { x: 10, y: 20, w: 300, h: 400 }
  const corner = { TL: [10, 420], TR: [310, 420], BL: [10, 20], BR: [310, 20] }
  // EXIF 规范：编码图左上角 / 右上角的像素，转正后落在显示框的哪个角
  const expected: Record<number, [keyof typeof corner, keyof typeof corner]> = {
    1: ['TL', 'TR'], 2: ['TR', 'TL'], 3: ['BR', 'BL'], 4: ['BL', 'BR'],
    5: ['TL', 'BL'], 6: ['TR', 'BR'], 7: ['BR', 'TR'], 8: ['BL', 'TL'],
  }
  for (const [orientation, [topLeft, topRight]] of Object.entries(expected)) {
    it(`方向 ${orientation}：编码左上 → ${topLeft}，右上 → ${topRight}`, () => {
      const m = orientationMatrix(Number(orientation), box.x, box.y, box.w, box.h)
      expect(apply(m, 0, 1)).toEqual(corner[topLeft])
      expect(apply(m, 1, 1)).toEqual(corner[topRight])
    })
  }
})

describe('buildPdf 页面与颜色空间', () => {
  it('A4 模式 MediaBox 是 [0 0 595.28 841.89]', () => {
    const text = toLatin1(buildPdf([makePage(makeImage(4000, 3000), { width: 4000, height: 3000 }, 1, 'a4')]))
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]')
  })

  it('CMYK 反相写 /Decode，灰度写 DeviceGray', () => {
    const cmyk: PdfImage = { ...makeImage(10, 10), colorSpace: 'DeviceCMYK', invert: true }
    const gray: PdfImage = { ...makeImage(10, 10), colorSpace: 'DeviceGray' }
    const text = toLatin1(buildPdf([
      makePage(cmyk, { width: 10, height: 10 }, 1, 'original'),
      makePage(gray, { width: 10, height: 10 }, 1, 'original'),
    ]))
    expect(text).toContain('/ColorSpace /DeviceCMYK /BitsPerComponent 8 /Decode [1 0 1 0 1 0 1 0]')
    expect(text).toContain('/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter')
  })

  it('EXIF 方向 6 的竖拍：页面按显示尺寸竖排，XObject 仍是编码尺寸', () => {
    const image = makeImage(4000, 3000)
    const text = toLatin1(buildPdf([makePage(image, { width: 3000, height: 4000 }, 6, 'original')]))
    expect(text).toContain('/MediaBox [0 0 2250 3000]')
    expect(text).toContain('/Width 4000 /Height 3000')
    expect(text).toContain('0 -3000 2250 0 0 3000 cm')
  })
})

describe('movePage', () => {
  it('和相邻项互换', () => {
    expect(movePage(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(movePage(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
  })

  it('越界原样返回同一个数组', () => {
    const list = ['a', 'b']
    expect(movePage(list, 0, -1)).toBe(list)
    expect(movePage(list, 1, 1)).toBe(list)
  })
})
