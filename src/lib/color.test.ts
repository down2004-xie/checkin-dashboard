import { describe, expect, it } from 'vitest'

import {
  composite,
  contrastRatio,
  formatHex,
  formatHsl,
  formatRatio,
  formatRgb,
  hslToRgb,
  parseColor,
  relativeLuminance,
  rgbToHsl,
  wcagVerdict,
  type Rgba,
} from './color'

const rgb = (r: number, g: number, b: number, a = 1): Rgba => ({ r, g, b, a })

describe('parseColor', () => {
  it('HEX 三种长度 + 四位简写，大小写和前后空格都行', () => {
    expect(parseColor('#f80')).toEqual(rgb(255, 136, 0))
    expect(parseColor('  #FF8800 ')).toEqual(rgb(255, 136, 0))
    expect(parseColor('#ff880080')).toEqual(rgb(255, 136, 0, 128 / 255))
    expect(parseColor('#f808')).toEqual(rgb(255, 136, 0, 136 / 255))
  })

  it('rgb()/rgba() 逗号语法和空格语法', () => {
    expect(parseColor('rgb(255, 136, 0)')).toEqual(rgb(255, 136, 0))
    expect(parseColor('rgba(255,136,0,0.5)')).toEqual(rgb(255, 136, 0, 0.5))
    expect(parseColor('rgb(255 136 0)')).toEqual(rgb(255, 136, 0))
    expect(parseColor('rgb(255 136 0 / 50%)')).toEqual(rgb(255, 136, 0, 0.5))
    expect(parseColor('rgb(100% 0% 50%)')).toEqual(rgb(255, 0, 128))
  })

  it('hsl()/hsla() 逗号语法和空格语法，色相单位', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual(rgb(255, 0, 0))
    expect(parseColor('hsla(120, 100%, 25%, 0.3)')).toEqual(rgb(0, 128, 0, 0.3))
    expect(parseColor('hsl(240 100% 50%)')).toEqual(rgb(0, 0, 255))
    expect(parseColor('hsl(0.5turn 100% 50% / 0.25)')).toEqual(rgb(0, 255, 255, 0.25))
    expect(parseColor('hsl(-120, 100%, 50%)')).toEqual(rgb(0, 0, 255)) // 负色相绕回
  })

  it('非法输入返回 null', () => {
    for (const bad of ['', 'red', '#12', '#12345', '#ggg', 'rgb(256, 0, 0)', 'rgb(-1, 0, 0)', 'rgb(1, 2)',
      'rgb(1, 2, 3, 4, 5)', 'rgb(1, 2 3)', 'rgb(1 2 3 / )', 'rgba(1, 2, 3, 1.5)', 'hsl(0, 120%, 50%)',
      'hsl(abc, 50%, 50%)', 'rgb(1 2 3 / 0.5 / 1)', 'rgb(1, 2, 3 / 0.5)', 'rgb(1,,2,3)']) {
      expect(parseColor(bad), bad).toBeNull()
    }
  })
})

describe('互转与往返', () => {
  it('典型值', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 })
    expect(hslToRgb({ h: 210, s: 50, l: 40 })).toEqual({ r: 51, g: 102, b: 153 })
    expect(formatHex(rgb(51, 102, 153))).toBe('#336699')
    expect(formatRgb(rgb(51, 102, 153))).toBe('rgb(51, 102, 153)')
    expect(formatHsl(rgb(51, 102, 153))).toBe('hsl(210, 50%, 40%)')
    expect(formatHex(rgb(255, 0, 0, 0.5))).toBe('#ff000080')
    expect(formatRgb(rgb(255, 0, 0, 0.5))).toBe('rgba(255, 0, 0, 0.5)')
    expect(formatHsl(rgb(255, 0, 0, 0.5))).toBe('hsla(0, 100%, 50%, 0.5)')
    expect(formatHsl(rgb(128, 128, 128))).toBe('hsl(0, 0%, 50.2%)')
  })

  it('RGB → HSL → RGB 全色域抽样零误差（不取整的 HSL）', () => {
    for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 5) {
      expect(hslToRgb(rgbToHsl({ r, g, b }))).toEqual({ r, g, b })
    }
  })

  it('经过显示文本（HSL 一位小数）往返，每个通道误差不超过 1', () => {
    let worst = 0
    for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 5) {
      const back = parseColor(formatHsl(rgb(r, g, b)))
      expect(back).not.toBeNull()
      if (!back) continue
      worst = Math.max(worst, Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b))
    }
    expect(worst).toBeLessThanOrEqual(1)
  })

  it('HEX / RGB 文本往返完全一致（含透明度）', () => {
    for (const color of [rgb(0, 0, 0), rgb(255, 255, 255), rgb(18, 52, 86), rgb(1, 2, 3, 0.2)]) {
      expect(parseColor(formatHex(color))?.r).toBe(color.r)
      expect(parseColor(formatRgb(color))).toEqual(color)
    }
  })
})

describe('WCAG 对比度', () => {
  const black = rgb(0, 0, 0)
  const white = rgb(255, 255, 255)

  it('黑白 = 21，同色 = 1，与顺序无关', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10)
    expect(contrastRatio(white, black)).toBeCloseTo(21, 10)
    expect(contrastRatio(rgb(18, 52, 86), rgb(18, 52, 86))).toBe(1)
  })

  it('相对亮度端点和已知值', () => {
    expect(relativeLuminance(black)).toBe(0)
    expect(relativeLuminance(white)).toBeCloseTo(1, 12)
    // 纯红 = 0.2126（只有 R 通道）
    expect(relativeLuminance(rgb(255, 0, 0))).toBeCloseTo(0.2126, 12)
  })

  it('#767676 刚好过 AA，#777 差一点不过（不许四舍五入）', () => {
    const pass = contrastRatio(rgb(0x76, 0x76, 0x76), white)
    const fail = contrastRatio(rgb(0x77, 0x77, 0x77), white)
    expect(pass).toBeGreaterThan(4.5)
    expect(fail).toBeLessThan(4.5)
    expect(fail).toBeGreaterThan(4.47)
    expect(wcagVerdict(pass).aaNormal).toBe(true)
    expect(wcagVerdict(fail)).toEqual({ aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false })
    expect(formatRatio(fail)).toBe('4.47')
  })

  it('判定阈值边界', () => {
    expect(wcagVerdict(3)).toEqual({ aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false })
    expect(wcagVerdict(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true })
    expect(wcagVerdict(7)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true })
    expect(wcagVerdict(2.99)).toEqual({ aaNormal: false, aaLarge: false, aaaNormal: false, aaaLarge: false })
  })

  it('formatRatio 向下截断，不会显示出「看着达标」的数', () => {
    expect(formatRatio(4.4999)).toBe('4.49')
    expect(formatRatio(21)).toBe('21.00')
    expect(formatRatio(1)).toBe('1.00')
  })

  it('半透明前景先叠到背景上再算', () => {
    expect(composite(rgb(0, 0, 0, 0.5), white)).toEqual(rgb(128, 128, 128))
    // 完全透明的文字 = 背景色本身，对比度 1
    expect(contrastRatio(rgb(0, 0, 0, 0), white)).toBe(1)
    // 半透明黑字在白底上 = #808080 在白底上
    expect(contrastRatio(rgb(0, 0, 0, 0.5), white)).toBeCloseTo(contrastRatio(rgb(128, 128, 128), white), 12)
  })
})
