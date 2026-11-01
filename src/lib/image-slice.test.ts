import { describe, expect, it } from 'vitest'

import {
  centerSquareArea,
  computeSliceRects,
  fitSlicePreview,
  sliceArchiveName,
  sliceFileName,
} from './image-slice'

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
    const totalW = rects.filter((rect) => rect.row === 0).reduce((sum, rect) => sum + rect.sw, 0)
    const totalH = rects.filter((rect) => rect.col === 0).reduce((sum, rect) => sum + rect.sh, 0)
    expect(totalW).toBe(100)
    expect(totalH).toBe(70)
  })

  it('格子首尾相接，没有缝隙也没有重叠', () => {
    const rects = computeSliceRects(101, 53, 3, 4)
    for (let row = 0; row < 3; row += 1) {
      const rowRects = rects.filter((rect) => rect.row === row).sort((a, b) => a.col - b.col)
      for (let index = 1; index < rowRects.length; index += 1) {
        expect(rowRects[index].sx).toBe(rowRects[index - 1].sx + rowRects[index - 1].sw)
      }
    }
  })

  it('不整除时各格宽度最多相差 1 像素（分布均匀）', () => {
    const widths = computeSliceRects(100, 100, 1, 3).map((rect) => rect.sw)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  })

  it('返回顺序是逐行从左到右', () => {
    const rects = computeSliceRects(30, 30, 2, 2)
    expect(rects.map((rect) => [rect.row, rect.col])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
  })

  it('第一格从 (0,0) 开始', () => {
    const [first] = computeSliceRects(300, 300, 3, 3)
    expect(first.sx).toBe(0)
    expect(first.sy).toBe(0)
  })

  it('横图先居中裁成正方形，再切出九张正方形', () => {
    const rects = computeSliceRects(601, 300, 3, 3, true)
    expect(rects).toHaveLength(9)
    expect(rects[0]).toMatchObject({ sx: 150, sy: 0, sw: 100, sh: 100 })
    expect(rects.at(-1)).toMatchObject({ sx: 350, sy: 200, sw: 100, sh: 100 })
    expect(rects.every((rect) => rect.sw === rect.sh)).toBe(true)
  })

  it('竖图居中裁正方形时只裁上下', () => {
    const rects = computeSliceRects(300, 601, 3, 3, true)
    expect(rects[0]).toMatchObject({ sx: 0, sy: 150, sw: 100, sh: 100 })
    expect(rects.at(-1)).toMatchObject({ sx: 200, sy: 350, sw: 100, sh: 100 })
  })

  it('非法参数或格数超过像素数时返回空数组', () => {
    expect(computeSliceRects(100, 100, 0, 3)).toEqual([])
    expect(computeSliceRects(100, 100, 3, 0)).toEqual([])
    expect(computeSliceRects(100, 100, 2.5, 3)).toEqual([])
    expect(computeSliceRects(0, 100, 3, 3)).toEqual([])
    expect(computeSliceRects(-5, 100, 3, 3)).toEqual([])
    expect(computeSliceRects(NaN, 100, 3, 3)).toEqual([])
    expect(computeSliceRects(2, 2, 3, 3)).toEqual([])
  })
})

describe('centerSquareArea', () => {
  it('用整数像素居中，奇数差值多出的像素留在右下侧', () => {
    expect(centerSquareArea(601, 300)).toEqual({ x: 150, y: 0, width: 300, height: 300 })
    expect(centerSquareArea(300, 601)).toEqual({ x: 0, y: 150, width: 300, height: 300 })
    expect(centerSquareArea(300, 300)).toEqual({ x: 0, y: 0, width: 300, height: 300 })
  })

  it('无效尺寸返回 null', () => {
    expect(centerSquareArea(0, 100)).toBeNull()
    expect(centerSquareArea(10.5, 100)).toBeNull()
  })
})

describe('fitSlicePreview', () => {
  it('只缩小长边，不放大小图', () => {
    expect(fitSlicePreview(1200, 800, 720)).toEqual({ width: 720, height: 480 })
    expect(fitSlicePreview(300, 200, 720)).toEqual({ width: 300, height: 200 })
  })

  it('取整后不会越过预览上限，无效参数返回 0×0', () => {
    expect(fitSlicePreview(1001, 333, 720)).toEqual({ width: 720, height: 239 })
    expect(fitSlicePreview(100, 100, 0)).toEqual({ width: 0, height: 0 })
  })
})

describe('切图文件名', () => {
  it('去掉扩展名并加行列号', () => {
    expect(sliceFileName('photo.jpg', 0, 0)).toBe('photo-1-1.png')
    expect(sliceFileName('photo.png', 2, 2)).toBe('photo-3-3.png')
  })

  it('带多点的文件名只去掉最后一段扩展名', () => {
    expect(sliceFileName('my.photo.v2.jpeg', 0, 1)).toBe('my.photo.v2-1-2.png')
    expect(sliceArchiveName('my.photo.v2.jpeg')).toBe('my.photo.v2-slices.zip')
  })

  it('空文件名退回 slice', () => {
    expect(sliceFileName('', 0, 0)).toBe('slice-1-1.png')
    expect(sliceFileName('   ', 0, 0)).toBe('slice-1-1.png')
    expect(sliceArchiveName('')).toBe('slice-slices.zip')
  })
})
