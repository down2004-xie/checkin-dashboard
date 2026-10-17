/* 单位换算 —— 纯函数，不依赖 React，可单测。
 *
 * 设计要点：所有换算都「先转成该量纲的基准单位，再从基准单位转出」，
 * 而不是为每一对单位写一个换算率（N 个单位需要 N² 条，且必然抄错几条）。
 * 基准单位：长度米、重量千克、面积平方米。温度没有「基准单位线性缩放」
 * 这回事（有偏移量），单独处理。
 */

export type UnitCategory = 'length' | 'weight' | 'area' | 'temperature'

export interface UnitDef {
  id: string
  label: string
  /** 1 个该单位等于多少个基准单位（温度不用这个字段） */
  factor: number
}

export interface UnitGroup {
  category: UnitCategory
  label: string
  units: UnitDef[]
}

/**
 * 各量纲的单位表。factor 是「1 个该单位 = factor 个基准单位」。
 * 基准单位分别是：米 / 千克 / 平方米。
 */
export const UNIT_GROUPS: UnitGroup[] = [
  {
    category: 'length',
    label: '长度',
    units: [
      { id: 'mm', label: '毫米', factor: 0.001 },
      { id: 'cm', label: '厘米', factor: 0.01 },
      { id: 'm', label: '米', factor: 1 },
      { id: 'km', label: '千米', factor: 1000 },
      { id: 'in', label: '英寸', factor: 0.0254 },
      { id: 'ft', label: '英尺', factor: 0.3048 },
      { id: 'yd', label: '码', factor: 0.9144 },
      { id: 'mi', label: '英里', factor: 1609.344 },
    ],
  },
  {
    category: 'weight',
    label: '重量',
    units: [
      { id: 'mg', label: '毫克', factor: 0.000001 },
      { id: 'g', label: '克', factor: 0.001 },
      { id: 'kg', label: '千克', factor: 1 },
      { id: 't', label: '吨', factor: 1000 },
      { id: 'oz', label: '盎司', factor: 0.028349523125 },
      { id: 'lb', label: '磅', factor: 0.45359237 },
    ],
  },
  {
    category: 'area',
    label: '面积',
    units: [
      { id: 'cm2', label: '平方厘米', factor: 0.0001 },
      { id: 'm2', label: '平方米', factor: 1 },
      { id: 'km2', label: '平方千米', factor: 1_000_000 },
      { id: 'ha', label: '公顷', factor: 10_000 },
      { id: 'mu', label: '亩', factor: 666.6666666667 },
      { id: 'ft2', label: '平方英尺', factor: 0.09290304 },
    ],
  },
  {
    category: 'temperature',
    label: '温度',
    units: [
      { id: 'c', label: '摄氏度', factor: 1 },
      { id: 'f', label: '华氏度', factor: 1 },
      { id: 'k', label: '开尔文', factor: 1 },
    ],
  },
]

/** 按分类取单位组；找不到返回 null（调用方据此判断输入合法性） */
export function getUnitGroup(category: UnitCategory): UnitGroup | null {
  return UNIT_GROUPS.find((group) => group.category === category) ?? null
}

/** 温度：把某单位的值转成摄氏度（作为温度的中间基准） */
function temperatureToCelsius(value: number, unitId: string): number {
  switch (unitId) {
    case 'c':
      return value
    case 'f':
      return (value - 32) * (5 / 9)
    case 'k':
      return value - 273.15
    default:
      return NaN
  }
}

/** 温度：把摄氏度转成目标单位 */
function celsiusToTemperature(celsius: number, unitId: string): number {
  switch (unitId) {
    case 'c':
      return celsius
    case 'f':
      return celsius * (9 / 5) + 32
    case 'k':
      return celsius + 273.15
    default:
      return NaN
  }
}

/**
 * 换算入口。
 *
 * 温度走偏移量公式，其余走「基准单位中转」。
 * 输入非法（未知分类/单位、value 不是有限数）时返回 NaN，
 * 由界面判断并显示「—」，不抛异常。
 */
export function convert(value: number, category: UnitCategory, fromId: string, toId: string): number {
  if (!Number.isFinite(value)) return NaN
  const group = getUnitGroup(category)
  if (!group) return NaN
  const from = group.units.find((unit) => unit.id === fromId)
  const to = group.units.find((unit) => unit.id === toId)
  if (!from || !to) return NaN

  if (category === 'temperature') {
    return celsiusToTemperature(temperatureToCelsius(value, fromId), toId)
  }
  return (value * from.factor) / to.factor
}

/**
 * 把换算结果格式化成好读的字符串。
 *
 * 为什么不用 toFixed(2) 一刀切：0.000001 米这种小量会被压成 0.00，
 * 大数又会被截断。这里先保留 6 位有效数字，再去掉末尾多余的 0。
 * NaN 返回「—」，交给界面直接显示。
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  // toPrecision(6) 会给出如 "1.23400e-7" 或 "1234.00" 的形态
  const precise = Number(value.toPrecision(6))
  return String(precise)
}
