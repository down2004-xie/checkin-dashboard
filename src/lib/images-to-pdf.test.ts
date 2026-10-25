import { describe, expect, it } from 'vitest'

import { buildPdf, type PdfImage } from './images-to-pdf'

// 一张「假的 JPEG」：只需要首尾的 SOI/EOI 标记，结构测试不真的解码它
const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

/** 用 latin1 解码：每个字节映射成一个字符（0-255），字节偏移 == 字符下标，便于按偏移切。 */
function toLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

function makeImage(width: number, height: number): PdfImage {
  return { bytes: FAKE_JPEG, width, height }
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
    const pdf = buildPdf([makeImage(100, 80)])
    expect(toLatin1(pdf).startsWith('%PDF-1.4')).toBe(true)
  })

  it('包含 Catalog 和 Pages 根对象', () => {
    const text = toLatin1(buildPdf([makeImage(100, 80)]))
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Pages')
  })

  it('页对象数量等于图片数量', () => {
    const count = (n: number) => toLatin1(buildPdf(Array.from({ length: n }, () => makeImage(50, 50)))).split('/Type /Page ').length - 1
    expect(count(1)).toBe(1)
    expect(count(3)).toBe(3)
  })

  it('以 %%EOF 结尾', () => {
    const text = toLatin1(buildPdf([makeImage(100, 80)]))
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('包含 startxref', () => {
    expect(toLatin1(buildPdf([makeImage(100, 80)]))).toContain('startxref')
  })

  it('单张图：Count 1、MediaBox 尺寸正确', () => {
    const text = toLatin1(buildPdf([makeImage(640, 480)]))
    expect(text).toContain('/Count 1')
    expect(text).toContain('/MediaBox [0 0 640 480]')
    // 内容流按图片尺寸缩放铺满整页
    expect(text).toContain('640 0 0 480 0 0 cm')
  })

  it('两张图：Count 2、两页各自尺寸独立', () => {
    const text = toLatin1(buildPdf([makeImage(200, 100), makeImage(300, 400)]))
    expect(text).toContain('/Count 2')
    expect(text).toContain('/MediaBox [0 0 200 100]')
    expect(text).toContain('/MediaBox [0 0 300 400]')
  })

  it('xref 里每个对象的偏移都精确指向 "N 0 obj"', () => {
    const pdf = buildPdf([makeImage(120, 90), makeImage(80, 60)])
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
