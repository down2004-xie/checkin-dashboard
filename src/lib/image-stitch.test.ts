import { describe, expect, it } from 'vitest'

import {
  backgroundFill,
  computeStitchLayout,
  MAX_EDGE,
  MAX_GAP,
  moveItem,
  parseStitchNumber,
  scaleLayout,
} from './image-stitch'

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
      { index: 0, x: 0, y: 0, width: 100, height: 50 },
      { index: 1, x: 0, y: 50, width: 100, height: 80 },
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
    expect(layout.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 200, height: 100 })
    expect(layout.placements[1]).toEqual({ index: 1, x: 0, y: 100, width: 200, height: 200 })
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
    expect(layout.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 1000, height: 500 })
    expect(layout.placements[1]).toEqual({ index: 1, x: 0, y: 500, width: 1000, height: 500 })
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
      { index: 0, x: 0, y: 0, width: 50, height: 100 },
      { index: 1, x: 50, y: 0, width: 80, height: 100 },
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
    expect(layout.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 100, height: 200 })
    expect(layout.placements[1]).toEqual({ index: 1, x: 100, y: 0, width: 200, height: 200 })
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
    expect(layout.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 500, height: 1000 })
    expect(layout.placements[1]).toEqual({ index: 1, x: 500, y: 0, width: 500, height: 1000 })
    expect(layout.canvasWidth).toBe(1000)
  })
})

describe('computeStitchLayout · 边界', () => {
  it('空数组返回全 0 空布局', () => {
    expect(computeStitchLayout([], 'vertical', 10)).toEqual({
      canvasWidth: 0,
      canvasHeight: 0,
      placements: [],
      skipped: [],
    })
    expect(computeStitchLayout([], 'horizontal', 10)).toEqual({
      canvasWidth: 0,
      canvasHeight: 0,
      placements: [],
      skipped: [],
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
    const single = { canvasWidth: 120, canvasHeight: 80, placements: [{ index: 0, x: 0, y: 0, width: 120, height: 80 }], skipped: [] }
    expect(v).toEqual(single)
    const h = computeStitchLayout([{ width: 120, height: 80 }], 'horizontal', 10)
    expect(h).toEqual(single)
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
    expect(v.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 300, height: 50 })
    expect(v.placements[1]).toEqual({ index: 1, x: 0, y: 50, width: 300, height: 152 })
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
    expect(h.placements[0]).toEqual({ index: 0, x: 0, y: 0, width: 50, height: 300 })
    expect(h.placements[1]).toEqual({ index: 1, x: 50, y: 0, width: 152, height: 300 })
    expect(h.canvasWidth).toBe(202)
  })

  it('宽或高为 0 / NaN 的图被跳过并记下下标，不会让画布尺寸变 NaN', () => {
    const layout = computeStitchLayout(
      [
        { width: 100, height: 50 },
        { width: 0, height: 80 },
        { width: 100, height: Number.NaN },
        { width: 50, height: 50 },
      ],
      'vertical',
      0,
    )
    expect(layout.skipped).toEqual([1, 2])
    expect(layout.placements.map((p) => p.index)).toEqual([0, 3])
    expect(layout.canvasWidth).toBe(100)
    expect(layout.canvasHeight).toBe(150)
    for (const p of layout.placements) expect(Number.isFinite(p.height)).toBe(true)
  })

  it('全部不可用时返回空布局', () => {
    const layout = computeStitchLayout([{ width: 0, height: 0 }], 'horizontal', 0)
    expect(layout).toEqual({ canvasWidth: 0, canvasHeight: 0, placements: [], skipped: [0] })
  })

  it('maxEdge 小于 1 时统一边至少 1px', () => {
    const layout = computeStitchLayout([{ width: 100, height: 100 }], 'vertical', 0, 0.3)
    expect(layout.canvasWidth).toBe(1)
    expect(layout.placements[0].height).toBe(1)
  })
})

describe('scaleLayout', () => {
  // 20 张 1080×2400 纵向 = 1080×48000，超过 canvas 单边上限 32767（审核确认的高危 bug 场景）
  const tall = computeStitchLayout(Array.from({ length: 20 }, () => ({ width: 1080, height: 2400 })), 'vertical', 8)

  it('缩到给定画布尺寸，最后一张正好贴底', () => {
    const scaled = scaleLayout(tall, 737, 32767)
    expect(scaled.canvasWidth).toBe(737)
    expect(scaled.canvasHeight).toBe(32767)
    const last = scaled.placements.at(-1)!
    expect(last.y + last.height).toBe(32767)
  })

  it('接缝和原布局一样：相邻两张之间的间隔一致，不出现重叠', () => {
    const scaled = scaleLayout(tall, 737, 32767)
    for (let i = 1; i < scaled.placements.length; i++) {
      const prev = scaled.placements[i - 1]
      const gap = scaled.placements[i].y - (prev.y + prev.height)
      expect(gap).toBeGreaterThanOrEqual(5)
      expect(gap).toBeLessThanOrEqual(6)
    }
  })

  it('没有间隔时缩完也严丝合缝（不出现 1px 缝）', () => {
    const layout = computeStitchLayout(Array.from({ length: 7 }, () => ({ width: 300, height: 333 })), 'horizontal', 0)
    const scaled = scaleLayout(layout, 1000, 143)
    for (let i = 1; i < scaled.placements.length; i++) {
      const prev = scaled.placements[i - 1]
      expect(scaled.placements[i].x).toBe(prev.x + prev.width)
    }
    expect(scaled.placements.at(-1)!.x + scaled.placements.at(-1)!.width).toBe(1000)
  })

  it('保留 index 和 skipped；空布局原样返回', () => {
    const layout = computeStitchLayout([{ width: 0, height: 1 }, { width: 10, height: 10 }], 'vertical', 0)
    const scaled = scaleLayout(layout, 5, 5)
    expect(scaled.placements[0].index).toBe(1)
    expect(scaled.skipped).toEqual([0])
    const empty = computeStitchLayout([], 'vertical', 0)
    expect(scaleLayout(empty, 10, 10)).toBe(empty)
  })
})

describe('parseStitchNumber', () => {
  it('留空返回 null', () => {
    expect(parseStitchNumber('  ', '间隔', 0, MAX_GAP)).toEqual({ ok: true, value: null })
  })

  it('合法整数', () => {
    expect(parseStitchNumber(' 12 ', '间隔', 0, MAX_GAP)).toEqual({ ok: true, value: 12 })
  })

  it('非数字、小数、负数、超上限都给出提示（不再静默当成 0）', () => {
    for (const bad of ['abc', '1.5', '-3', '1e3', '1001']) {
      const result = parseStitchNumber(bad, '间隔', 0, MAX_GAP)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toContain('间隔')
    }
  })

  it('低于下限给出提示', () => {
    expect(parseStitchNumber('0', '最大边长', 1, MAX_EDGE).ok).toBe(false)
  })
})

describe('moveItem', () => {
  it('上移 / 下移交换相邻两项，不改原数组', () => {
    const items = ['a', 'b', 'c']
    expect(moveItem(items, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(items, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(items).toEqual(['a', 'b', 'c'])
  })

  it('越界时原样返回', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 5, -1)).toEqual(['a', 'b'])
  })
})

describe('backgroundFill', () => {
  it('透明不填色，白 / 黑给出颜色', () => {
    expect(backgroundFill('transparent')).toBeNull()
    expect(backgroundFill('white')).toBe('#ffffff')
    expect(backgroundFill('black')).toBe('#000000')
  })
})
