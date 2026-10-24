import { describe, expect, it } from 'vitest'

import { cellExtent, mosaicBlockSize, mosaicCells } from './image-mosaic'

describe('mosaicBlockSize', () => {
  it('强度越大块越大', () => {
    const small = mosaicBlockSize(1000, 1)
    const large = mosaicBlockSize(1000, 10)
    expect(large).toBeGreaterThan(small)
  })

  it('强度钳到 1~10（超范围不越界）', () => {
    expect(mosaicBlockSize(1000, 0)).toBe(mosaicBlockSize(1000, 1))
    expect(mosaicBlockSize(1000, 99)).toBe(mosaicBlockSize(1000, 10))
  })

  it('块边长至少 2px', () => {
    expect(mosaicBlockSize(10, 1)).toBeGreaterThanOrEqual(2)
  })

  it('块边长不超过长边的 1/4（避免整块糊成纯色）', () => {
    const long = 400
    expect(mosaicBlockSize(long, 10)).toBeLessThanOrEqual(Math.floor(long / 4))
  })

  it('同样强度下，大图的块更大（按比例而非固定像素）', () => {
    expect(mosaicBlockSize(4000, 5)).toBeGreaterThan(mosaicBlockSize(400, 5))
  })
})

describe('mosaicCells', () => {
  it('整除时格子数正确', () => {
    // 100×100，块 10 → 10×10 = 100 格
    expect(mosaicCells(100, 100, 10)).toHaveLength(100)
  })

  it('不整除时边缘也铺满（用 ceil，不留缝）', () => {
    // 25 宽，块 10 → 需要 3 列（0,10,20），最后一列只占 5px
    const cells = mosaicCells(25, 10, 10)
    const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b)
    expect(xs).toEqual([0, 10, 20])
  })

  it('起始坐标是 0,0', () => {
    expect(mosaicCells(20, 20, 10)[0]).toEqual({ x: 0, y: 0 })
  })

  it('非法参数返回空数组', () => {
    expect(mosaicCells(0, 10, 10)).toEqual([])
    expect(mosaicCells(10, 10, 0)).toEqual([])
  })
})

describe('cellExtent', () => {
  it('中间格是完整块', () => {
    expect(cellExtent(10, 10, 100, 100, 10)).toEqual({ width: 10, height: 10 })
  })

  it('贴边的格不超出区域（最后一列只有剩余宽度）', () => {
    // 区域宽 25，最后一块从 x=20 起，只剩 5px
    expect(cellExtent(20, 0, 25, 10, 10)).toEqual({ width: 5, height: 10 })
  })

  it('右下角同时截断宽高', () => {
    expect(cellExtent(20, 20, 25, 25, 10)).toEqual({ width: 5, height: 5 })
  })
})
