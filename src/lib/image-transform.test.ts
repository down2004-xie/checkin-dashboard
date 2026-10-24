import { describe, expect, it } from 'vitest'

import {
  clampRect,
  fullRect,
  normalizeRotation,
  pointsToRatio,
  ratioRectToPixels,
  rotatedSize,
} from './image-transform'

describe('normalizeRotation', () => {
  it('归一到 0/90/180/270', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(180)).toBe(180)
    expect(normalizeRotation(270)).toBe(270)
  })

  it('超出一圈取模', () => {
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(720)).toBe(0)
  })

  it('负数归一（-90 → 270）', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(-180)).toBe(180)
    expect(normalizeRotation(-270)).toBe(90)
  })

  it('非整档就近取整', () => {
    expect(normalizeRotation(44)).toBe(0)
    expect(normalizeRotation(46)).toBe(90)
  })
})

describe('rotatedSize', () => {
  const size = { width: 400, height: 300 }
  it('90/270 宽高互换', () => {
    expect(rotatedSize(size, 90)).toEqual({ width: 300, height: 400 })
    expect(rotatedSize(size, 270)).toEqual({ width: 300, height: 400 })
  })
  it('0/180 不变', () => {
    expect(rotatedSize(size, 0)).toEqual(size)
    expect(rotatedSize(size, 180)).toEqual(size)
  })
})

describe('fullRect', () => {
  it('覆盖整张图', () => {
    expect(fullRect({ width: 100, height: 50 })).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })
})

describe('clampRect', () => {
  const bounds = { width: 100, height: 100 }

  it('越界矩形被钳进边界', () => {
    const rect = clampRect({ x: -10, y: -10, width: 50, height: 50 }, bounds)
    expect(rect).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('右下角超出时收缩宽高', () => {
    const rect = clampRect({ x: 80, y: 80, width: 50, height: 50 }, bounds)
    expect(rect).toEqual({ x: 80, y: 80, width: 20, height: 20 })
  })

  it('宽高至少 1px', () => {
    const rect = clampRect({ x: 50, y: 50, width: 0, height: 0 }, bounds)
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})

describe('ratioRectToPixels', () => {
  it('百分比转像素', () => {
    const rect = ratioRectToPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 }, { width: 400, height: 200 })
    expect(rect).toEqual({ x: 100, y: 100, width: 200, height: 100 })
  })

  it('超范围会 clamp', () => {
    const rect = ratioRectToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, { width: 100, height: 100 })
    expect(rect.x).toBe(90)
    expect(rect.width).toBe(10)
  })
})

describe('pointsToRatio', () => {
  const expectRatio = (actual: ReturnType<typeof pointsToRatio>, expected: { x: number; y: number; width: number; height: number }) => {
    expect(actual.x).toBeCloseTo(expected.x, 10)
    expect(actual.y).toBeCloseTo(expected.y, 10)
    expect(actual.width).toBeCloseTo(expected.width, 10)
    expect(actual.height).toBeCloseTo(expected.height, 10)
  }

  it('正向拖拽（左上→右下）', () => {
    expectRatio(pointsToRatio(0.1, 0.2, 0.6, 0.8), { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
  })

  it('反向拖拽（右下→左上）也能得到正向矩形', () => {
    expectRatio(pointsToRatio(0.6, 0.8, 0.1, 0.2), { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
  })

  it('拖出容器被 clamp 到 0~1', () => {
    expectRatio(pointsToRatio(-0.5, -0.5, 1.5, 1.5), { x: 0, y: 0, width: 1, height: 1 })
  })
})
