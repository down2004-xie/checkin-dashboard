import { describe, expect, it } from 'vitest'

import { UNIT_GROUPS, checkPhysical, convert, formatResult, getUnitGroup, parseAmount } from './unit-convert'

describe('convert', () => {
  it('长度：米转厘米是 ×100', () => {
    expect(convert(1, 'length', 'm', 'cm')).toBeCloseTo(100, 10)
  })

  it('长度：英里转千米', () => {
    expect(convert(1, 'length', 'mi', 'km')).toBeCloseTo(1.609344, 10)
  })

  it('英制系数由码的定义推出，等于常见的定义值', () => {
    expect(convert(1, 'length', 'in', 'm')).toBeCloseTo(0.0254, 15)
    expect(convert(1, 'length', 'ft', 'm')).toBeCloseTo(0.3048, 15)
    expect(convert(1, 'weight', 'oz', 'kg')).toBeCloseTo(0.028349523125, 15)
    expect(convert(1, 'area', 'ft2', 'm2')).toBeCloseTo(0.09290304, 15)
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

  it('面积：英亩 = 4046.8564224 平方米', () => {
    expect(convert(1, 'area', 'acre', 'm2')).toBeCloseTo(4046.8564224, 9)
  })

  it('面积：15 亩 = 1 公顷（亩用分数系数，不是截断小数）', () => {
    expect(formatResult(convert(15, 'area', 'mu', 'ha'))).toBe('1')
    expect(convert(1, 'area', 'mu', 'm2')).toBeCloseTo(666.6666666667, 9)
  })

  it('市制长度：3 尺 = 1 米、1 丈 = 10 尺、1 尺 = 10 寸、1 里 = 500 米', () => {
    expect(formatResult(convert(3, 'length', 'chi', 'm'))).toBe('1')
    expect(formatResult(convert(1, 'length', 'zhang', 'chi'))).toBe('10')
    expect(formatResult(convert(1, 'length', 'chi', 'cun'))).toBe('10')
    expect(formatResult(convert(1, 'length', 'li', 'm'))).toBe('500')
  })

  it('市制重量：1 斤 = 0.5 千克 = 10 两', () => {
    expect(convert(1, 'weight', 'jin', 'kg')).toBe(0.5)
    expect(formatResult(convert(1, 'weight', 'jin', 'liang'))).toBe('10')
    expect(formatResult(convert(1, 'weight', 'liang', 'g'))).toBe('50')
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

  it('每组的默认单位都在本组里（否则切量纲后下拉框指向不存在的选项）', () => {
    for (const group of UNIT_GROUPS) {
      const ids = group.units.map((unit) => unit.id)
      expect(ids).toContain(group.defaultFrom)
      expect(ids).toContain(group.defaultTo)
      expect(group.defaultFrom).not.toBe(group.defaultTo)
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

  it('1 英里 = 1609344 毫米，不丢末位（旧实现 6 位有效数字显示成 1609340）', () => {
    expect(formatResult(convert(1, 'length', 'mi', 'mm'))).toBe('1609344')
  })

  it('大整数原样保留：1234567', () => {
    expect(formatResult(1234567)).toBe('1234567')
  })

  it('1 毫克 = 0.000000001 吨，常见量级不用科学计数法', () => {
    expect(formatResult(convert(1, 'weight', 'mg', 't'))).toBe('0.000000001')
  })

  it('吸收浮点尾巴：0.1 + 0.2 显示 0.3', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3')
  })

  it('保留到 12 位有效数字', () => {
    expect(formatResult(1 / 3)).toBe('0.333333333333')
    expect(formatResult(convert(1, 'area', 'acre', 'm2'))).toBe('4046.8564224')
  })

  it('负数正常输出（温度会用到）', () => {
    expect(formatResult(-17.77777777777778)).toBe('-17.7777777778')
  })

  it('极端量级才用科学计数法', () => {
    expect(formatResult(1e-13)).toBe('1e-13')
    expect(formatResult(2.5e20)).toBe('2.5e+20')
  })

  it('NaN 显示破折号', () => {
    expect(formatResult(NaN)).toBe('—')
  })

  it('0 和 -0 都显示 0', () => {
    expect(formatResult(0)).toBe('0')
    expect(formatResult(-0)).toBe('0')
  })
})

describe('parseAmount', () => {
  it('普通小数、负数、前导小数点', () => {
    expect(parseAmount('12.5')).toEqual({ ok: true, value: 12.5 })
    expect(parseAmount('-3')).toEqual({ ok: true, value: -3 })
    expect(parseAmount('.5')).toEqual({ ok: true, value: 0.5 })
    expect(parseAmount(' 7 ')).toEqual({ ok: true, value: 7 })
  })

  it('接受科学计数法（结果可能以这种形态显示，必须能粘回来）', () => {
    expect(parseAmount('1e3')).toEqual({ ok: true, value: 1000 })
    expect(parseAmount('2.5E-9')).toEqual({ ok: true, value: 2.5e-9 })
    expect(parseAmount(formatResult(2.5e20))).toEqual({ ok: true, value: 2.5e20 })
  })

  it('全角数字先归一再解析', () => {
    expect(parseAmount('１２．５')).toEqual({ ok: true, value: 12.5 })
  })

  it('空输入给出原因', () => {
    expect(parseAmount('')).toEqual({ ok: false, reason: '请输入数值' })
    expect(parseAmount('   ')).toEqual({ ok: false, reason: '请输入数值' })
  })

  it('千位分隔符给出原因（不猜逗号是千位还是小数点）', () => {
    const result = parseAmount('1,000')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/千位分隔符/)
  })

  it('十六进制被拒绝（Number("0x10") 会静默得到 16）', () => {
    const result = parseAmount('0x10')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/十进制/)
  })

  it('其他乱码、Infinity 被拒绝', () => {
    expect(parseAmount('abc').ok).toBe(false)
    expect(parseAmount('1.2.3').ok).toBe(false)
    expect(parseAmount('Infinity').ok).toBe(false)
    expect(parseAmount('1e999')).toEqual({ ok: false, reason: '数值太大，超出可计算范围' })
  })
})

describe('checkPhysical', () => {
  it('长度 / 重量 / 面积为负给提示，0 和正数放行', () => {
    expect(checkPhysical(-1, 'length', 'm')).toBe('长度不能为负数')
    expect(checkPhysical(-1, 'weight', 'kg')).toBe('重量不能为负数')
    expect(checkPhysical(-1, 'area', 'm2')).toBe('面积不能为负数')
    expect(checkPhysical(0, 'length', 'm')).toBeNull()
    expect(checkPhysical(5, 'area', 'mu')).toBeNull()
  })

  it('温度允许负数，但不能低于绝对零度', () => {
    expect(checkPhysical(-40, 'temperature', 'c')).toBeNull()
    expect(checkPhysical(-274, 'temperature', 'c')).toMatch(/绝对零度/)
    expect(checkPhysical(-1, 'temperature', 'k')).toMatch(/绝对零度/)
    expect(checkPhysical(-460, 'temperature', 'f')).toMatch(/绝对零度/)
  })

  it('恰好等于绝对零度不报（-459.67 °F 换算有 1e-14 量级的浮点误差）', () => {
    expect(checkPhysical(-273.15, 'temperature', 'c')).toBeNull()
    expect(checkPhysical(-459.67, 'temperature', 'f')).toBeNull()
    expect(checkPhysical(0, 'temperature', 'k')).toBeNull()
  })
})
