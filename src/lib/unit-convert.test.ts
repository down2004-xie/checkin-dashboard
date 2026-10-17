import { describe, expect, it } from 'vitest'

import { UNIT_GROUPS, convert, formatResult, getUnitGroup } from './unit-convert'

describe('convert', () => {
  it('长度：米转厘米是 ×100', () => {
    expect(convert(1, 'length', 'm', 'cm')).toBeCloseTo(100, 10)
  })

  it('长度：英里转千米', () => {
    expect(convert(1, 'length', 'mi', 'km')).toBeCloseTo(1.609344, 10)
  })

  it('同单位互转是恒等', () => {
    expect(convert(42, 'weight', 'kg', 'kg')).toBeCloseTo(42, 10)
  })

  it('重量：磅转千克', () => {
    expect(convert(1, 'weight', 'lb', 'kg')).toBeCloseTo(0.45359237, 10)
  })

  it('重量：吨转克', () => {
    expect(convert(2, 'weight', 't', 'g')).toBeCloseTo(2_000_000, 6)
  })

  it('面积：公顷转平方米', () => {
    expect(convert(1, 'area', 'ha', 'm2')).toBeCloseTo(10_000, 6)
  })

  it('面积：亩转平方米（1 亩≈666.67 ㎡）', () => {
    expect(convert(1, 'area', 'mu', 'm2')).toBeCloseTo(666.6666666667, 6)
  })

  it('温度：摄氏转华氏（100°C = 212°F）', () => {
    expect(convert(100, 'temperature', 'c', 'f')).toBeCloseTo(212, 10)
  })

  it('温度：华氏转摄氏（32°F = 0°C）', () => {
    expect(convert(32, 'temperature', 'f', 'c')).toBeCloseTo(0, 10)
  })

  it('温度：摄氏转开尔文（0°C = 273.15K）', () => {
    expect(convert(0, 'temperature', 'c', 'k')).toBeCloseTo(273.15, 10)
  })

  it('温度：负四十度摄氏与华氏相等（经典交叉点）', () => {
    expect(convert(-40, 'temperature', 'c', 'f')).toBeCloseTo(-40, 10)
  })

  it('往返换算能还原原值（摄氏→华氏→摄氏）', () => {
    const f = convert(37, 'temperature', 'c', 'f')
    expect(convert(f, 'temperature', 'f', 'c')).toBeCloseTo(37, 10)
  })

  it('未知单位返回 NaN，不抛异常', () => {
    expect(convert(1, 'length', 'm', 'nope')).toBeNaN()
  })

  it('非有限数返回 NaN', () => {
    expect(convert(NaN, 'length', 'm', 'cm')).toBeNaN()
    expect(convert(Infinity, 'length', 'm', 'cm')).toBeNaN()
  })
})

describe('getUnitGroup', () => {
  it('每个分类都能取到单位组', () => {
    for (const group of UNIT_GROUPS) {
      expect(getUnitGroup(group.category)).toBe(group)
    }
  })

  it('单位表内部没有重复 id（重复会导致换算取错单位）', () => {
    for (const group of UNIT_GROUPS) {
      const ids = group.units.map((unit) => unit.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('formatResult', () => {
  it('整数原样输出', () => {
    expect(formatResult(100)).toBe('100')
  })

  it('去掉末尾多余的 0', () => {
    expect(formatResult(1.5)).toBe('1.5')
  })

  it('极小值不丢成 0（保留有效数字而不是固定两位小数）', () => {
    expect(formatResult(0.0000001)).toBe('1e-7')
  })

  it('NaN 显示破折号', () => {
    expect(formatResult(NaN)).toBe('—')
  })

  it('0 直接显示 0', () => {
    expect(formatResult(0)).toBe('0')
  })
})
