import { describe, expect, it } from 'vitest'

import { computeStitchLayout } from './image-stitch'

describe('computeStitchLayout · 纵向拼接', () => {
  it('等宽图直接堆叠，画布高为各高之和', () => {
    const layout = computeStitchLayout(
      [
        { width: 100, height: 50 },
        { width: 100, height: 80 },
      ],
      'vertical',
      0,
    )
    expect(layout.canvasWidth).toBe(100)
    expect(layout.canvasHeight).toBe(130)
    expect(layout.placements).toEqual([
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 50, width: 100, height: 80 },
    ])
  })

  it('gap 计入：画布高 = 各高之和 + gap*(n-1)，每张 y 递增高+gap', () => {
    const layout = computeStitchLayout(
      [
        { width: 100, height: 50 },
        { width: 100, height: 80 },
        { width: 100, height: 20 },
      ],
      'vertical',
      10,
    )
    // 50 + 80 + 20 + 10*2 = 170
    expect(layout.canvasHeight).toBe(170)
    expect(layout.placements.map((p) => p.y)).toEqual([0, 60, 150])
  })

  it('缩放到共同宽度：以最大宽度为基准，等比缩放', () => {
    const layout = computeStitchLayout(
      [
        { width: 200, height: 100 },
        { width: 100, height: 100 },
      ],
      'vertical',
      0,
    )
    // 共同宽 = 200；第二张 100 宽放大到 200，高 100 -> 200
    expect(layout.canvasWidth).toBe(200)
    expect(layout.placements[0]).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    expect(layout.placements[1]).toEqual({ x: 0, y: 100, width: 200, height: 200 })
    expect(layout.canvasHeight).toBe(300)
  })

  it('maxEdge 上限：共同宽被 maxEdge 封顶后等比缩放', () => {
    const layout = computeStitchLayout(
      [
        { width: 2000, height: 1000 },
        { width: 1000, height: 500 },
      ],
      'vertical',
      0,
      1000,
    )
    // 共同宽 = min(2000, 1000) = 1000
    expect(layout.canvasWidth).toBe(1000)
    // 第一张 2000x1000 -> 1000x500；第二张 1000x500 -> 1000x500
    expect(layout.placements[0]).toEqual({ x: 0, y: 0, width: 1000, height: 500 })
    expect(layout.placements[1]).toEqual({ x: 0, y: 500, width: 1000, height: 500 })
    expect(layout.canvasHeight).toBe(1000)
  })
})

describe('computeStitchLayout · 横向拼接', () => {
  it('等高图直接并排，画布宽为各宽之和', () => {
    const layout = computeStitchLayout(
      [
        { width: 50, height: 100 },
        { width: 80, height: 100 },
      ],
      'horizontal',
      0,
    )
    expect(layout.canvasHeight).toBe(100)
    expect(layout.canvasWidth).toBe(130)
    expect(layout.placements).toEqual([
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 80, height: 100 },
    ])
  })

  it('横向 gap 计入，每张 x 递增加宽+gap', () => {
    const layout = computeStitchLayout(
      [
        { width: 50, height: 100 },
        { width: 80, height: 100 },
        { width: 20, height: 100 },
      ],
      'horizontal',
      10,
    )
    // 50 + 80 + 20 + 10*2 = 170
    expect(layout.canvasWidth).toBe(170)
    expect(layout.placements.map((p) => p.x)).toEqual([0, 60, 150])
  })

  it('缩放到共同高度：以最大高度为基准，等比缩放', () => {
    const layout = computeStitchLayout(
      [
        { width: 100, height: 200 },
        { width: 100, height: 100 },
      ],
      'horizontal',
      0,
    )
    // 共同高 = 200；第二张 100 高放大到 200，宽 100 -> 200
    expect(layout.canvasHeight).toBe(200)
    expect(layout.placements[0]).toEqual({ x: 0, y: 0, width: 100, height: 200 })
    expect(layout.placements[1]).toEqual({ x: 100, y: 0, width: 200, height: 200 })
    expect(layout.canvasWidth).toBe(300)
  })

  it('横向 maxEdge 上限', () => {
    const layout = computeStitchLayout(
      [
        { width: 1000, height: 2000 },
        { width: 500, height: 1000 },
      ],
      'horizontal',
      0,
      1000,
    )
    // 共同高 = min(2000, 1000) = 1000
    expect(layout.canvasHeight).toBe(1000)
    expect(layout.placements[0]).toEqual({ x: 0, y: 0, width: 500, height: 1000 })
    expect(layout.placements[1]).toEqual({ x: 500, y: 0, width: 500, height: 1000 })
    expect(layout.canvasWidth).toBe(1000)
  })
})

describe('computeStitchLayout · 边界', () => {
  it('空数组返回全 0 空布局', () => {
    expect(computeStitchLayout([], 'vertical', 10)).toEqual({
      canvasWidth: 0,
      canvasHeight: 0,
      placements: [],
    })
    expect(computeStitchLayout([], 'horizontal', 10)).toEqual({
      canvasWidth: 0,
      canvasHeight: 0,
      placements: [],
    })
  })

  it('gap 为负数按 0 处理', () => {
    const layout = computeStitchLayout(
      [
        { width: 100, height: 50 },
        { width: 100, height: 50 },
      ],
      'vertical',
      -20,
    )
    expect(layout.canvasHeight).toBe(100)
    expect(layout.placements[1].y).toBe(50)
  })

  it('单图：画布就是这张图本身（纵向/横向都一样）', () => {
    const v = computeStitchLayout([{ width: 120, height: 80 }], 'vertical', 10)
    expect(v).toEqual({ canvasWidth: 120, canvasHeight: 80, placements: [{ x: 0, y: 0, width: 120, height: 80 }] })
    const h = computeStitchLayout([{ width: 120, height: 80 }], 'horizontal', 10)
    expect(h).toEqual({ canvasWidth: 120, canvasHeight: 80, placements: [{ x: 0, y: 0, width: 120, height: 80 }] })
  })

  it('非等比缩放后取整：高度/宽度 round 到整数', () => {
    // 纵向：共同宽 = max(300, 200) = 300；
    // 第二张 200x101 -> 高 = 101 * 300 / 200 = 151.5 -> 152
    const v = computeStitchLayout(
      [
        { width: 300, height: 50 },
        { width: 200, height: 101 },
      ],
      'vertical',
      0,
    )
    expect(v.placements[0]).toEqual({ x: 0, y: 0, width: 300, height: 50 })
    expect(v.placements[1]).toEqual({ x: 0, y: 50, width: 300, height: 152 })
    expect(v.canvasHeight).toBe(202)

    // 横向：共同高 = max(300, 200) = 300；
    // 第二张 101x200 -> 宽 = 101 * 300 / 200 = 151.5 -> 152
    const h = computeStitchLayout(
      [
        { width: 50, height: 300 },
        { width: 101, height: 200 },
      ],
      'horizontal',
      0,
    )
    expect(h.placements[0]).toEqual({ x: 0, y: 0, width: 50, height: 300 })
    expect(h.placements[1]).toEqual({ x: 50, y: 0, width: 152, height: 300 })
    expect(h.canvasWidth).toBe(202)
  })
})
