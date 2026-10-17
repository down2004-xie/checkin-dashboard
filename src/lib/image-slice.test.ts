import { describe, expect, it } from 'vitest'

import { computeSliceRects, sliceFileName } from './image-slice'

describe('computeSliceRects', () => {
  it('整除时每格尺寸相等（900×900 切九宫格 = 300×300）', () => {
    const rects = computeSliceRects(900, 900, 3, 3)
    expect(rects).toHaveLength(9)
    for (const rect of rects) {
      expect(rect.sw).toBe(300)
      expect(rect.sh).toBe(300)
    }
  })

  it('每格尺寸之和正好等于原图（不丢像素）', () => {
    // 100 宽切 3 列：100/3 不整除，靠边界取整保证总和还是 100
    const rects = computeSliceRects(100, 70, 2, 3)
    const totalW = rects.filter((r) => r.row === 0).reduce((sum, r) => sum + r.sw, 0)
    const totalH = rects.filter((r) => r.col === 0).reduce((sum, r) => sum + r.sh, 0)
    expect(totalW).toBe(100)
    expect(totalH).toBe(70)
  })

  it('格子首尾相接，没有缝隙也没有重叠', () => {
    const rects = computeSliceRects(101, 53, 3, 4)
    // 每一行的格子：前一格的 sx+sw 必须等于后一格的 sx
    for (let row = 0; row < 3; row += 1) {
      const rowRects = rects.filter((r) => r.row === row).sort((a, b) => a.col - b.col)
      for (let i = 1; i < rowRects.length; i += 1) {
        expect(rowRects[i].sx).toBe(rowRects[i - 1].sx + rowRects[i - 1].sw)
      }
    }
  })

  it('不整除时各格宽度最多相差 1 像素（分布均匀）', () => {
    const rects = computeSliceRects(100, 100, 1, 3)
    const widths = rects.map((r) => r.sw)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  })

  it('返回顺序是逐行从左到右', () => {
    const rects = computeSliceRects(30, 30, 2, 2)
    expect(rects.map((r) => [r.row, r.col])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
  })

  it('第一格从 (0,0) 开始', () => {
    const [first] = computeSliceRects(300, 300, 3, 3)
    expect(first.sx).toBe(0)
    expect(first.sy).toBe(0)
  })

  it('非法参数返回空数组', () => {
    expect(computeSliceRects(100, 100, 0, 3)).toEqual([])
    expect(computeSliceRects(100, 100, 3, 0)).toEqual([])
    expect(computeSliceRects(100, 100, 2.5, 3)).toEqual([])
    expect(computeSliceRects(0, 100, 3, 3)).toEqual([])
    expect(computeSliceRects(-5, 100, 3, 3)).toEqual([])
    expect(computeSliceRects(NaN, 100, 3, 3)).toEqual([])
  })
})

describe('sliceFileName', () => {
  it('去掉扩展名并加行列号', () => {
    expect(sliceFileName('photo.jpg', 0, 0)).toBe('photo-1-1.png')
    expect(sliceFileName('photo.png', 2, 2)).toBe('photo-3-3.png')
  })

  it('带多点的文件名只去掉最后一段扩展名', () => {
    expect(sliceFileName('my.photo.v2.jpeg', 0, 1)).toBe('my.photo.v2-1-2.png')
  })

  it('空文件名退回 slice', () => {
    expect(sliceFileName('', 0, 0)).toBe('slice-1-1.png')
    expect(sliceFileName('   ', 0, 0)).toBe('slice-1-1.png')
  })
})
