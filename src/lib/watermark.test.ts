import { describe, expect, it } from 'vitest'

import { anchorPosition, hexToRgba, shadowColorFor, tilePositions } from './watermark'

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
