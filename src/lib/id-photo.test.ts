import { describe, expect, it } from 'vitest'

import {
  BG_COLORS,
  ID_PHOTO_SIZES,
  centerCropRect,
  colorDistance,
  estimateBackgroundColor,
  isBackgroundPixel,
  replaceBackground,
  type Rgb,
} from './id-photo'

describe('ID_PHOTO_SIZES', () => {
  it('三种常见尺寸，宽高比合理（竖版）', () => {
    expect(ID_PHOTO_SIZES).toHaveLength(3)
    for (const size of ID_PHOTO_SIZES) {
      expect(size.height).toBeGreaterThan(size.width)
      expect(size.width).toBeGreaterThan(0)
    }
  })

  it('一寸约 295×413（300dpi）', () => {
    const one = ID_PHOTO_SIZES.find((s) => s.id === 'one')!
    expect(one.width).toBe(295)
    expect(one.height).toBe(413)
  })
})

describe('BG_COLORS', () => {
  it('白蓝红三色齐备', () => {
    expect(BG_COLORS.map((c) => c.id)).toEqual(['white', 'blue', 'red'])
  })
})

describe('colorDistance', () => {
  it('相同颜色距离 0', () => {
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0)
  })

  it('黑白距离 = 255√3', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(255 * Math.sqrt(3), 5)
  })

  it('对称', () => {
    expect(colorDistance([1, 2, 3], [4, 5, 6])).toBeCloseTo(colorDistance([4, 5, 6], [1, 2, 3]), 10)
  })
})

describe('isBackgroundPixel', () => {
  it('距离在容差内算背景', () => {
    expect(isBackgroundPixel([250, 250, 250], [255, 255, 255], 20)).toBe(true)
  })

  it('距离超容差不算背景', () => {
    expect(isBackgroundPixel([100, 100, 100], [255, 255, 255], 20)).toBe(false)
  })

  it('容差 0 时只有完全相同才算', () => {
    expect(isBackgroundPixel([255, 255, 255], [255, 255, 255], 0)).toBe(true)
    expect(isBackgroundPixel([254, 255, 255], [255, 255, 255], 0)).toBe(false)
  })
})

describe('replaceBackground', () => {
  const mk = (pixels: Rgb[]) => {
    const arr = new Uint8ClampedArray(pixels.length * 4)
    pixels.forEach((p, i) => { arr[i * 4] = p[0]; arr[i * 4 + 1] = p[1]; arr[i * 4 + 2] = p[2]; arr[i * 4 + 3] = 255 })
    return arr
  }

  it('接近背景的像素被替换成目标色', () => {
    const data = mk([[250, 250, 250], [10, 10, 10]])
    const out = replaceBackground(data, [255, 255, 255], 20, [67, 142, 219])
    // 第一个（接近白）变蓝
    expect([out[0], out[1], out[2]]).toEqual([67, 142, 219])
    // 第二个（深色主体）不变
    expect([out[4], out[5], out[6]]).toEqual([10, 10, 10])
  })

  it('保留透明度通道', () => {
    const arr = new Uint8ClampedArray([250, 250, 250, 128])
    const out = replaceBackground(arr, [255, 255, 255], 20, [0, 0, 0])
    expect(out[3]).toBe(128)
  })

  it('不改原数组（返回副本）', () => {
    const data = mk([[250, 250, 250]])
    const before = data[0]
    replaceBackground(data, [255, 255, 255], 20, [67, 142, 219])
    expect(data[0]).toBe(before)
  })

  it('容差 0 时不替换', () => {
    const data = mk([[250, 250, 250]])
    const out = replaceBackground(data, [255, 255, 255], 0, [67, 142, 219])
    expect(out[0]).toBe(250)
  })
})

describe('estimateBackgroundColor', () => {
  it('取中位数，抗单个离群采样点', () => {
    const samples: Rgb[] = [[250, 250, 250], [252, 252, 252], [248, 248, 248], [0, 0, 0]]
    // 中位数应为 ~250，不被黑色的 0 拉偏
    const bg = estimateBackgroundColor(samples)
    expect(bg[0]).toBeGreaterThan(200)
  })

  it('空样本退回白色', () => {
    expect(estimateBackgroundColor([])).toEqual([255, 255, 255])
  })
})

describe('centerCropRect', () => {
  it('源图更宽：裁左右，高度铺满', () => {
    // 源 400×200，目标 1:1 → 裁成 200×200 居中
    const rect = centerCropRect(400, 200, 100, 100)
    expect(rect).toEqual({ x: 100, y: 0, width: 200, height: 200 })
  })

  it('源图更高：裁上下，宽度铺满', () => {
    // 源 200×400，目标 1:1 → 裁成 200×200 居中
    const rect = centerCropRect(200, 400, 100, 100)
    expect(rect).toEqual({ x: 0, y: 100, width: 200, height: 200 })
  })

  it('比例一致时整张保留', () => {
    const rect = centerCropRect(300, 400, 295, 413)
    expect(rect.width).toBeLessThanOrEqual(300)
    expect(rect.height).toBeLessThanOrEqual(400)
  })

  it('非法尺寸返回原尺寸矩形', () => {
    const rect = centerCropRect(0, 0, 100, 100)
    expect(rect.width).toBe(0)
  })
})
