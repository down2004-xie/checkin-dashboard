import { describe, expect, it } from 'vitest'

import {
  blurRadius,
  cellExtent,
  downscaleSteps,
  mosaicBlockSize,
  mosaicCells,
  normalizeBlurEdges,
  paddedRect,
  pixelate,
  undoOverflow,
} from './image-mosaic'

/** 造一块 w×h 的 RGBA 像素，fill(x, y) 返回该点的 [r,g,b,a] */
function pixels(w: number, h: number, fill: (x: number, y: number) => number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4)
  return data
}

const at = (data: Uint8ClampedArray, w: number, x: number, y: number) => [...data.slice((y * w + x) * 4, (y * w + x) * 4 + 4)]

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

describe('blurRadius', () => {
  it('至少 2px，强度越大越大', () => {
    expect(blurRadius(10, 1)).toBeGreaterThanOrEqual(2)
    expect(blurRadius(1000, 10)).toBeGreaterThan(blurRadius(1000, 1))
  })
})

describe('paddedRect', () => {
  const bounds = { width: 400, height: 300 }

  it('选区在图中间：四周各扩 3 倍半径', () => {
    expect(paddedRect({ x: 100, y: 100, width: 50, height: 20 }, 5, bounds)).toEqual({ x: 85, y: 85, width: 80, height: 50 })
  })

  it('padding 不小于 2 倍半径（模糊核覆盖不到画布外的透明）', () => {
    const rect = { x: 100, y: 100, width: 10, height: 10 }
    const radius = 7
    const padded = paddedRect(rect, radius, bounds)
    expect(rect.x - padded.x).toBeGreaterThanOrEqual(radius * 2)
    expect(padded.x + padded.width - (rect.x + rect.width)).toBeGreaterThanOrEqual(radius * 2)
  })

  it('贴边时 clamp 到图片边界，不出现负坐标或越界', () => {
    expect(paddedRect({ x: 2, y: 0, width: 10, height: 10 }, 5, bounds)).toEqual({ x: 0, y: 0, width: 27, height: 25 })
    expect(paddedRect({ x: 390, y: 290, width: 10, height: 10 }, 5, bounds)).toEqual({ x: 375, y: 275, width: 25, height: 25 })
  })

  it('始终包含原选区', () => {
    const rect = { x: 0, y: 0, width: 400, height: 300 }
    expect(paddedRect(rect, 10, bounds)).toEqual(rect)
  })

  it('半径非法时不扩', () => {
    expect(paddedRect({ x: 10, y: 10, width: 5, height: 5 }, -3, bounds)).toEqual({ x: 10, y: 10, width: 5, height: 5 })
  })
})

describe('normalizeBlurEdges', () => {
  it('不透明图片在边缘被拉低的 alpha 补回 255', () => {
    // 模拟贴边：图像和掩码都只剩一半覆盖
    const blurred = new Uint8ClampedArray([10, 20, 30, 128])
    normalizeBlurEdges(blurred, new Uint8ClampedArray([255, 255, 255, 128]))
    expect([...blurred]).toEqual([10, 20, 30, 255])
  })

  it('本身透明的区域除完仍是透明（不会被补成不透明）', () => {
    const blurred = new Uint8ClampedArray([0, 0, 0, 0, 50, 50, 50, 64])
    normalizeBlurEdges(blurred, new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]))
    expect([...blurred]).toEqual([0, 0, 0, 0, 50, 50, 50, 64])
  })

  it('半透明图片在边缘按覆盖率放大，结果不超过 255', () => {
    const blurred = new Uint8ClampedArray([0, 0, 0, 60, 0, 0, 0, 200])
    normalizeBlurEdges(blurred, new Uint8ClampedArray([0, 0, 0, 120, 0, 0, 0, 100]))
    expect(blurred[3]).toBe(128)
    expect(blurred[7]).toBe(255)
  })

  it('掩码覆盖为 0 的像素保持不变（不除以 0）', () => {
    const blurred = new Uint8ClampedArray([1, 2, 3, 0])
    normalizeBlurEdges(blurred, new Uint8ClampedArray([0, 0, 0, 0]))
    expect([...blurred]).toEqual([1, 2, 3, 0])
  })
})

describe('pixelate', () => {
  it('不透明区域：每格填成格内平均色', () => {
    // 2×1 一格：黑 + 白 → 灰
    const data = pixels(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    pixelate(data, 2, 1, 2)
    expect(at(data, 2, 0, 0)).toEqual([128, 128, 128, 255])
    expect(at(data, 2, 1, 0)).toEqual([128, 128, 128, 255])
  })

  it('全透明的格保持全透明（旧实现会填成不透明黑块）', () => {
    const data = pixels(4, 4, () => [0, 0, 0, 0])
    pixelate(data, 4, 4, 2)
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(0)
  })

  it('半透明格按 alpha 加权：透明像素的 RGB 不把颜色拉黑', () => {
    // 一格 2 像素：纯红不透明 + 透明（RGB 是 0）。颜色应保持纯红，alpha 取平均
    const data = pixels(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    pixelate(data, 2, 1, 2)
    expect(at(data, 2, 1, 0)).toEqual([255, 0, 0, 128])
  })

  it('格与格之间互不影响；贴边不满一格的也处理到', () => {
    // 3×1，块 2：第一格 [黑, 白]，第二格只有 [红]
    const data = pixels(3, 1, (x) => [[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255]][x])
    pixelate(data, 3, 1, 2)
    expect(at(data, 3, 0, 0)).toEqual([128, 128, 128, 255])
    expect(at(data, 3, 2, 0)).toEqual([255, 0, 0, 255])
  })

  it('细条纹打完码后格内只剩一种颜色', () => {
    const data = pixels(8, 8, (x) => (x % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    pixelate(data, 8, 8, 4)
    const colors = new Set<string>()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) colors.add(at(data, 8, x, y).join())
    expect(colors.size).toBe(1)
  })
})

describe('downscaleSteps', () => {
  it('每步最多缩一半，最后一步正好到目标', () => {
    const steps = downscaleSteps(100, 40, 10)
    expect(steps.at(-1)).toEqual({ width: 10, height: 4 })
    let prev = { width: 100, height: 40 }
    for (const step of steps) {
      expect(step.width).toBeGreaterThanOrEqual(Math.ceil(prev.width / 2))
      expect(step.height).toBeGreaterThanOrEqual(Math.ceil(prev.height / 2))
      prev = step
    }
  })

  it('目标至少 1×1', () => {
    expect(downscaleSteps(3, 3, 100).at(-1)).toEqual({ width: 1, height: 1 })
  })

  it('不需要缩或参数非法时返回空数组', () => {
    expect(downscaleSteps(100, 100, 1)).toEqual([])
    expect(downscaleSteps(0, 100, 4)).toEqual([])
    expect(downscaleSteps(100, 100, NaN)).toEqual([])
  })
})

describe('undoOverflow', () => {
  it('没超限不丢', () => {
    expect(undoOverflow([10, 10, 10], 5, 100)).toBe(0)
  })

  it('超过深度从最老的丢', () => {
    expect(undoOverflow([1, 1, 1, 1, 1, 1, 1], 5, 100)).toBe(2)
  })

  it('超过字节预算从最老的丢，直到预算内', () => {
    expect(undoOverflow([40, 40, 40], 10, 90)).toBe(1)
  })

  it('至少保留最新一条，哪怕它自己就超预算', () => {
    expect(undoOverflow([10, 500], 10, 100)).toBe(1)
    expect(undoOverflow([500], 10, 100)).toBe(0)
  })
})
