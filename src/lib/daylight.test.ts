import { describe, expect, it } from 'vitest'

import { PALETTES, paletteForNow, phaseForHour } from './daylight'

describe('phaseForHour', () => {
  it('0-23 每一小时都有归属，不会落空', () => {
    // 这个测试的价值：防止改边界时漏掉某个小时，
    // 那种 bug 只在特定时间才暴露，人工测很难发现
    for (let hour = 0; hour < 24; hour++) {
      expect(PALETTES[phaseForHour(hour)]).toBeDefined()
    }
  })

  it('清晨边界 5 点开始、9 点结束', () => {
    expect(phaseForHour(4)).toBe('night')
    expect(phaseForHour(5)).toBe('dawn')
    expect(phaseForHour(8)).toBe('dawn')
    expect(phaseForHour(9)).toBe('day')
  })

  it('白天边界 9 点开始、17 点结束', () => {
    expect(phaseForHour(16)).toBe('day')
    expect(phaseForHour(17)).toBe('dusk')
  })

  it('黄昏边界 17 点开始、20 点结束', () => {
    expect(phaseForHour(19)).toBe('dusk')
    expect(phaseForHour(20)).toBe('night')
  })

  it('午夜和凌晨归入夜晚', () => {
    expect(phaseForHour(0)).toBe('night')
    expect(phaseForHour(23)).toBe('night')
  })
})

describe('paletteForNow', () => {
  it('返回完整色板（每个字段都是非空字符串）', () => {
    const palette = paletteForNow(new Date(2026, 9, 2, 10, 0))
    for (const value of Object.values(palette)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('四套色板结构一致，字段不缺失', () => {
    const keys = Object.keys(PALETTES.night).sort()
    for (const phase of ['dawn', 'day', 'dusk', 'night'] as const) {
      expect(Object.keys(PALETTES[phase]).sort()).toEqual(keys)
    }
  })
})
