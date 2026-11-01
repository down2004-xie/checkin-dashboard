import { describe, expect, it } from 'vitest'

import { allPages, dpiToScale, formatPageList, pageFileName, parsePageRange, pdfBaseName } from './pdf-pages'

describe('parsePageRange', () => {
  it('parses singles and ranges, sorted and deduplicated', () => {
    expect(parsePageRange('5, 1-3, 2', 10)).toEqual({ ok: true, pages: [1, 2, 3, 5] })
  })

  it('accepts Chinese punctuation and dash variants', () => {
    expect(parsePageRange('1～2，4、6—7', 10)).toEqual({ ok: true, pages: [1, 2, 4, 6, 7] })
  })

  it('rejects out-of-range pages and names the bad token', () => {
    const result = parsePageRange('1-3,12', 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('12')
    expect(parsePageRange('0', 10).ok).toBe(false)
  })

  it('rejects reversed ranges instead of silently flipping them', () => {
    const result = parsePageRange('5-3', 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('3-5')
  })

  it('rejects garbage and empty input', () => {
    expect(parsePageRange('a-b', 10).ok).toBe(false)
    expect(parsePageRange('1-', 10).ok).toBe(false)
    expect(parsePageRange('   ', 10).ok).toBe(false)
    expect(parsePageRange(',,', 10).ok).toBe(false)
  })
})

describe('allPages', () => {
  it('lists 1..total', () => {
    expect(allPages(3)).toEqual([1, 2, 3])
    expect(allPages(0)).toEqual([])
  })
})

describe('formatPageList', () => {
  it('compresses consecutive runs', () => {
    expect(formatPageList([7, 1, 2, 3, 5, 8])).toBe('1-3、5、7-8')
    expect(formatPageList([4])).toBe('4')
    expect(formatPageList([])).toBe('')
  })
})

describe('pdfBaseName', () => {
  it('strips .pdf case-insensitively and falls back when empty', () => {
    expect(pdfBaseName('报告.PDF')).toBe('报告')
    expect(pdfBaseName('a.pdf.pdf')).toBe('a.pdf')
    expect(pdfBaseName('.pdf')).toBe('document')
  })
})

describe('pageFileName', () => {
  it('pads to at least two digits', () => {
    expect(pageFileName('doc', 1, 9, 'png')).toBe('doc-p01.png')
  })

  it('pads to the width of the total page count', () => {
    expect(pageFileName('doc', 7, 120, 'jpg')).toBe('doc-p007.jpg')
    expect(pageFileName('doc', 120, 120, 'jpg')).toBe('doc-p120.jpg')
  })
})

describe('dpiToScale', () => {
  it('maps 72 dpi to 1x', () => {
    expect(dpiToScale(72)).toBe(1)
    expect(dpiToScale(144)).toBe(2)
  })
})
