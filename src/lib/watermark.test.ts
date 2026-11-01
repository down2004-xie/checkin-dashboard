import { describe, expect, it } from 'vitest'

import {
  anchorCenter,
  anchorPosition,
  fontSizeFromPercent,
  hexToRgba,
  rotatedBounds,
  shadowColorFor,
  tilePositions,
  type Anchor,
} from './watermark'

/** 宽 w、高 h 的矩形以 center 为中心转 deg 度后的四个角 */
function rotatedCorners(center: { x: number; y: number }, w: number, h: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([dx, dy]) => ({
    x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  }))
}

const ALL_ANCHORS: Anchor[] = [
  'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right',
]

describe('rotatedBounds', () => {
  it('0° 不变、90° 宽高互换', () => {
    expect(rotatedBounds(100, 20, 0)).toEqual({ width: 100, height: 20 })
    const r = rotatedBounds(100, 20, 90)
    expect(r.width).toBeCloseTo(20, 10)
    expect(r.height).toBeCloseTo(100, 10)
  })

  it('45°：宽高都是 (w + h)·√2/2；负角度与正角度相同', () => {
    const r = rotatedBounds(100, 20, 45)
    expect(r.width).toBeCloseTo(120 * Math.SQRT1_2, 10)
    expect(r.height).toBeCloseTo(120 * Math.SQRT1_2, 10)
    expect(rotatedBounds(100, 20, -45)).toEqual(r)
  })
})

describe('anchorCenter（按旋转后的外接框锚定）', () => {
  const W = 400
  const H = 300
  const wmW = 160
  const wmH = 30

  it('45° 右下锚点：水印四个角都不越出画布', () => {
    const center = anchorCenter(W, H, wmW, wmH, 45, 'bottom-right', 10)
    for (const p of rotatedCorners(center, wmW, wmH, 45)) {
      expect(p.x).toBeLessThanOrEqual(W - 10 + 1e-9)
      expect(p.y).toBeLessThanOrEqual(H - 10 + 1e-9)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('反验：按未旋转的框锚定（旧实现）在 45° 时会越出画布', () => {
    const corner = anchorPosition(W, H, wmW, wmH, 'bottom-right', 10)
    const oldCenter = { x: corner.x + wmW / 2, y: corner.y + wmH / 2 }
    const maxY = Math.max(...rotatedCorners(oldCenter, wmW, wmH, 45).map((p) => p.y))
    expect(maxY).toBeGreaterThan(H)
  })

  it('九个锚点 × 多个角度：画布放得下时都不越界', () => {
    for (const deg of [-90, -45, -30, 0, 15, 45, 60, 90]) {
      for (const anchor of ALL_ANCHORS) {
        const center = anchorCenter(W, H, wmW, wmH, deg, anchor, 10)
        for (const p of rotatedCorners(center, wmW, wmH, deg)) {
          expect(p.x, `${anchor} ${deg}°`).toBeGreaterThanOrEqual(-1e-9)
          expect(p.y, `${anchor} ${deg}°`).toBeGreaterThanOrEqual(-1e-9)
          expect(p.x, `${anchor} ${deg}°`).toBeLessThanOrEqual(W + 1e-9)
          expect(p.y, `${anchor} ${deg}°`).toBeLessThanOrEqual(H + 1e-9)
        }
      }
    }
  })

  it('0° 时与旧的 anchorPosition 一致（不旋转的用户看不出变化）', () => {
    const center = anchorCenter(W, H, wmW, wmH, 0, 'bottom-right', 10)
    expect(center).toEqual({ x: W - wmW - 10 + wmW / 2, y: H - wmH - 10 + wmH / 2 })
  })
})

describe('fontSizeFromPercent', () => {
  it('按短边算：4000×3000 的 5% = 150px', () => {
    expect(fontSizeFromPercent(4000, 3000, 5)).toBe(150)
    expect(fontSizeFromPercent(3000, 4000, 5)).toBe(150)
  })

  it('预览缩小后同比例缩小（不取整）', () => {
    expect(fontSizeFromPercent(1600, 1200, 5)).toBe(60)
    expect(fontSizeFromPercent(333, 1000, 3)).toBeCloseTo(9.99, 10)
  })

  it('非法输入返回 0', () => {
    expect(fontSizeFromPercent(100, 100, 0)).toBe(0)
    expect(fontSizeFromPercent(100, 100, NaN)).toBe(0)
    expect(fontSizeFromPercent(0, 100, 5)).toBe(0)
  })
})

describe('anchorPosition', () => {
  // 画布 1000×800，水印 100×50，padding 10
  const C = { w: 1000, h: 800, wmW: 100, wmH: 50, pad: 10 }
  const at = (anchor: Parameters<typeof anchorPosition>[4]) =>
    anchorPosition(C.w, C.h, C.wmW, C.wmH, anchor, C.pad)

  it('左上角', () => {
    expect(at('top-left')).toEqual({ x: 10, y: 10 })
  })

  it('右下角', () => {
    expect(at('bottom-right')).toEqual({ x: 1000 - 100 - 10, y: 800 - 50 - 10 })
  })

  it('正中', () => {
    expect(at('center')).toEqual({ x: (1000 - 100) / 2, y: (800 - 50) / 2 })
  })

  it('顶部居中：x 居中，y 贴顶', () => {
    const p = at('top-center')
    expect(p.x).toBe((1000 - 100) / 2)
    expect(p.y).toBe(10)
  })

  it('左中：x 贴左，y 居中', () => {
    const p = at('middle-left')
    expect(p.x).toBe(10)
    expect(p.y).toBe((800 - 50) / 2)
  })

  it('水印比画布大时坐标可为负（不钳 0）', () => {
    const p = anchorPosition(100, 100, 200, 200, 'center', 0)
    expect(p.x).toBe(-50)
    expect(p.y).toBe(-50)
  })

  it('padding 默认 0', () => {
    expect(anchorPosition(1000, 800, 100, 50, 'top-left')).toEqual({ x: 0, y: 0 })
  })
})

describe('tilePositions', () => {
  it('画布刚好铺满一格时返回 1 个点', () => {
    expect(tilePositions(100, 50, 100, 50)).toEqual([{ x: 0, y: 0 }])
  })

  it('铺 2×2（无间隔）', () => {
    const points = tilePositions(200, 100, 100, 50)
    expect(points).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 50 }, { x: 100, y: 50 },
    ])
  })

  it('间隔参与步长计算', () => {
    const points = tilePositions(250, 50, 100, 50, 25, 0)
    // 步长 125：x = 0, 125, 250(超出<250? 250<250 false 停) → 0,125 两个
    expect(points.map((p) => p.x)).toEqual([0, 125])
  })

  it('padding 作为起始偏移', () => {
    const points = tilePositions(200, 100, 100, 50, 0, 0, 20)
    expect(points[0]).toEqual({ x: 20, y: 20 })
  })

  it('左上角落在画布内就铺（边缘允许被裁）', () => {
    // 画布 150 宽，水印 100 宽：x=0 和 x=100 都 < 150，铺两列（第二列被裁一半）
    const points = tilePositions(150, 50, 100, 50)
    expect(points.map((p) => p.x)).toEqual([0, 100])
  })

  it('尺寸非法返回空数组（避免死循环）', () => {
    expect(tilePositions(0, 100, 100, 50)).toEqual([])
    expect(tilePositions(100, 100, 0, 50)).toEqual([])
    expect(tilePositions(100, 100, 100, 50, -100, 0)).toEqual([])
  })
})

describe('hexToRgba', () => {
  it('6 位十六进制转 rgba', () => {
    expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)')
    expect(hexToRgba('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)')
    expect(hexToRgba('#0000ff', 0)).toBe('rgba(0, 0, 255, 0)')
  })

  it('3 位简写展开', () => {
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)')
    expect(hexToRgba('#f00', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('带不带 # 都能解析', () => {
    expect(hexToRgba('ff8800', 1)).toBe('rgba(255, 136, 0, 1)')
  })

  it('透明度钳到 0~1', () => {
    expect(hexToRgba('#fff', 2)).toBe('rgba(255, 255, 255, 1)')
    expect(hexToRgba('#fff', -1)).toBe('rgba(255, 255, 255, 0)')
  })

  it('非法颜色退回白色（不抛异常）', () => {
    expect(hexToRgba('not-a-color', 1)).toBe('rgba(255, 255, 255, 1)')
    expect(hexToRgba('#12345', 0.3)).toBe('rgba(255, 255, 255, 0.3)')
  })
})

describe('shadowColorFor', () => {
  it('亮色（白）配黑影', () => {
    expect(shadowColorFor('#ffffff')).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('暗色（黑）配白影', () => {
    expect(shadowColorFor('#000000')).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('中等亮度的黄配黑影（亮度 > 128）', () => {
    expect(shadowColorFor('#ffff00')).toBe('rgba(0, 0, 0, 0.5)') // 亮度 226
  })

  it('深蓝配白影（亮度 < 128）', () => {
    expect(shadowColorFor('#000080')).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('非法颜色按亮字处理（配黑影）', () => {
    expect(shadowColorFor('nope')).toBe('rgba(0, 0, 0, 0.5)')
  })
})
