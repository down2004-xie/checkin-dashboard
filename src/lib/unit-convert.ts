/* 单位换算 —— 纯函数，不依赖 React，可单测。
 *
 * 设计要点：所有换算都「先转成该量纲的基准单位，再从基准单位转出」，
 * 而不是为每一对单位写一个换算率（N 个单位需要 N² 条，且必然抄错几条）。
 * 基准单位：长度米、重量千克、面积平方米。温度没有「基准单位线性缩放」
 * 这回事（有偏移量），单独处理。
 *
 * 系数来源：
 * - 英制/美制：1959 年国际码磅协议（International Yard and Pound Agreement）把
 *   1 码定义为 0.9144 米、1 磅定义为 0.45359237 千克，英寸/英尺/英里/盎司/平方英尺/英亩
 *   都由这两个定义精确推出，所以下面的系数是**定义值**，不是测量近似值。
 * - 市制：1984 年《国务院关于在我国统一实行法定计量单位的命令》附的市制换算关系
 *   （沿用 1959 年确定的市制）：1 市尺 = 1/3 米，1 市斤 = 0.5 千克（1 斤 = 10 两），
 *   1 市亩 = 60 平方丈 = 10000/15 平方米。市制是三分之一米这种分数，系数直接写成分数，
 *   不写 0.3333 这种截断小数，否则「3 尺 = 1 米」会算出 0.9999。
 */

export type UnitCategory = 'length' | 'weight' | 'area' | 'temperature'

/** 单位所属的制式，界面按它分组显示（同名「尺」「英尺」放在一起容易看错） */
export type UnitSystem = 'metric' | 'imperial' | 'chinese'

export interface UnitDef {
  id: string
  label: string
  /** 1 个该单位等于多少个基准单位（温度不用这个字段） */
  factor: number
  /** 制式；温度不分制式，不写 */
  system?: UnitSystem
}

export interface UnitGroup {
  category: UnitCategory
  label: string
  units: UnitDef[]
  /** 切到这个量纲时默认的「从 → 到」，挑最常见的一对，而不是表里的前两个 */
  defaultFrom: string
  defaultTo: string
}

export const SYSTEM_LABELS: Record<UnitSystem, string> = {
  metric: '公制',
  imperial: '英美制',
  chinese: '市制',
}

/** 英制基准：1 码 = 0.9144 米（1959 国际码定义），其余英制长度都从它推 */
const YARD = 0.9144
/** 英制基准：1 磅 = 0.45359237 千克（1959 国际磅定义） */
const POUND = 0.45359237

/**
 * 各量纲的单位表。factor 是「1 个该单位 = factor 个基准单位」。
 * 基准单位分别是：米 / 千克 / 平方米。
 */
export const UNIT_GROUPS: UnitGroup[] = [
  {
    category: 'length',
    label: '长度',
    defaultFrom: 'm',
    defaultTo: 'cm',
    units: [
      { id: 'mm', label: '毫米', factor: 0.001, system: 'metric' },
      { id: 'cm', label: '厘米', factor: 0.01, system: 'metric' },
      { id: 'm', label: '米', factor: 1, system: 'metric' },
      { id: 'km', label: '千米', factor: 1000, system: 'metric' },
      { id: 'in', label: '英寸', factor: YARD / 36, system: 'imperial' }, // = 0.0254
      { id: 'ft', label: '英尺', factor: YARD / 3, system: 'imperial' }, // = 0.3048
      { id: 'yd', label: '码', factor: YARD, system: 'imperial' },
      { id: 'mi', label: '英里', factor: YARD * 1760, system: 'imperial' }, // = 1609.344
      { id: 'li', label: '里', factor: 500, system: 'chinese' }, // 1 里 = 150 丈 = 500 米
      { id: 'zhang', label: '丈', factor: 10 / 3, system: 'chinese' }, // 1 丈 = 10 尺
      { id: 'chi', label: '尺', factor: 1 / 3, system: 'chinese' }, // 1 市尺 = 1/3 米
      { id: 'cun', label: '寸', factor: 1 / 30, system: 'chinese' }, // 1 尺 = 10 寸
    ],
  },
  {
    category: 'weight',
    label: '重量',
    defaultFrom: 'kg',
    defaultTo: 'jin',
    units: [
      { id: 'mg', label: '毫克', factor: 0.000001, system: 'metric' },
      { id: 'g', label: '克', factor: 0.001, system: 'metric' },
      { id: 'kg', label: '千克', factor: 1, system: 'metric' },
      { id: 't', label: '吨', factor: 1000, system: 'metric' },
      { id: 'oz', label: '盎司', factor: POUND / 16, system: 'imperial' }, // = 0.028349523125
      { id: 'lb', label: '磅', factor: POUND, system: 'imperial' },
      { id: 'jin', label: '斤', factor: 0.5, system: 'chinese' }, // 1 市斤 = 0.5 千克
      { id: 'liang', label: '两', factor: 0.05, system: 'chinese' }, // 1 斤 = 10 两（1959 年由 16 两改为 10 两）
    ],
  },
  {
    category: 'area',
    label: '面积',
    defaultFrom: 'm2',
    defaultTo: 'mu',
    units: [
      { id: 'cm2', label: '平方厘米', factor: 0.0001, system: 'metric' },
      { id: 'm2', label: '平方米', factor: 1, system: 'metric' },
      { id: 'ha', label: '公顷', factor: 10_000, system: 'metric' },
      { id: 'km2', label: '平方千米', factor: 1_000_000, system: 'metric' },
      { id: 'ft2', label: '平方英尺', factor: (YARD / 3) ** 2, system: 'imperial' }, // = 0.09290304
      { id: 'acre', label: '英亩', factor: 4840 * YARD ** 2, system: 'imperial' }, // 4840 平方码 = 4046.8564224 ㎡
      { id: 'mu', label: '亩', factor: 10_000 / 15, system: 'chinese' }, // 1 亩 = 60 平方丈 = 666.67 ㎡，15 亩 = 1 公顷
    ],
  },
  {
    category: 'temperature',
    label: '温度',
    defaultFrom: 'c',
    defaultTo: 'f',
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
 * 输入非法（未知分类/单位、value 不是有限数）时返回 NaN，不抛异常。
 * 物理上不合理的值（负长度、低于绝对零度）这里**不拦**，由 checkPhysical 单独判断 ——
 * 换算是纯数学，「合不合理」是另一层语义，混在一起就没法单测其中一层。
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
export type ParsedAmount = { ok: true; value: number } | { ok: false; reason: string }

/**
 * 十进制数，可带正负号、小数点、科学计数法指数。
 * 不用 `Number(text)` 直接判：`Number('')` 和 `Number('  ')` 都是 0，
 * `Number('0x10')` 是 16，`Number('Infinity')` 是无穷 —— 这些都会被静默当成合法数。
 */
const DECIMAL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

/**
 * 解析用户在输入框里敲的数值，失败时给出**原因**（界面直接显示）。
 *
 * 接受什么、为什么：
 * - 先做 NFKC 归一：中文输入法下容易敲出全角「１２．５」「－３」，归一后就是半角，
 *   这是用户真实想输的数字，不该报错。
 * - 接受科学计数法 `1e3`、`2.5e-9`：大/小量（1 微米换算成千米）本来就这么写，
 *   而且结果在极端量级下也会显示成科学计数法，输出必须能原样粘回输入框。
 * - 拒绝 `0x10` / `0b1` / `0o7`：没人用十六进制表示长度重量，`Number()` 却会把
 *   `0x10` 当成 16，用户以为算的是「10」，结果差了一截还看不出来。
 * - 拒绝千位分隔符 `1,000`：逗号在不同地区既可能是千位分隔也可能是小数点
 *   （德语 1,5 = 1.5），猜哪种都可能错一千倍，不如让用户写清楚。
 */
export function parseAmount(raw: string): ParsedAmount {
  const text = raw.normalize('NFKC').trim()
  if (text === '') return { ok: false, reason: '请输入数值' }
  if (/[,，]/.test(text)) return { ok: false, reason: '不要用千位分隔符或逗号，直接写 1000 或 1.5' }
  if (/^[+-]?0[xbo]/i.test(text)) return { ok: false, reason: '只支持十进制数，不支持 0x 十六进制这类写法' }
  if (!DECIMAL_PATTERN.test(text)) return { ok: false, reason: '不是有效的数字，例：12.5、-3、1e3' }
  const value = Number(text)
  // 正则保证了形态合法，剩下唯一的失败是指数太大溢出成 Infinity（如 1e999）
  if (!Number.isFinite(value)) return { ok: false, reason: '数值太大，超出可计算范围' }
  return { ok: true, value }
}

/**
 * 判断一个值在物理上是否成立，不成立时返回提示文案，成立返回 null。
 *
 * - 长度 / 重量 / 面积不能为负：它们是「量」，没有方向。
 * - 温度不能低于绝对零度。换成开尔文再判，三种单位共用一条规则。
 *   容差 1e-9 K：-459.67 °F 换成开尔文因为浮点误差会得到 -5.7e-14，
 *   恰好等于绝对零度的输入不能被误判成「低于」。
 */
export function checkPhysical(value: number, category: UnitCategory, fromId: string): string | null {
  if (category === 'temperature') {
    const kelvin = convert(value, 'temperature', fromId, 'k')
    if (kelvin < -1e-9) return '低于绝对零度（0 K = -273.15 °C = -459.67 °F），物理上不存在'
    return null
  }
  if (value < 0) {
    const label = getUnitGroup(category)?.label ?? '数值'
    return `${label}不能为负数`
  }
  return null
}

/** 结果保留的有效数字位数。双精度约 15~17 位，留 12 位足够吸收 0.1+0.2 这类浮点尾巴 */
const SIGNIFICANT_DIGITS = 12
/** 落在这个区间内的值用普通小数显示，区间外才用科学计数法 */
const PLAIN_MIN = 1e-12
const PLAIN_MAX = 1e15

/**
 * 把换算结果格式化成好读的字符串。
 *
 * 1. 先按 12 位有效数字取整：`(1/3) * 3` 这类运算会得到 0.9999999999999999，
 *    取整后就是 1。以前用 6 位有效数字，1 英里 = 1609344 毫米会被显示成 1609340，
 *    丢的那一位就是真实数据。12 位能放下日常换算里所有有意义的位数。
 * 2. 常见量级（1e-12 ~ 1e15）一律展开成普通小数：JS 的 String() 对小于 1e-6 的数
 *    会切成 `1e-9`，「1 毫克 = 0.000000001 吨」对普通用户更直观。
 * 3. 末尾的 0 和多余的小数点去掉。
 * 非有限数返回「—」。
 */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS))
  if (rounded === 0) return '0' // 同时吞掉 -0
  const abs = Math.abs(rounded)
  if (abs < PLAIN_MIN || abs >= PLAIN_MAX) return rounded.toExponential()
  // 需要的小数位 = 有效位数 - 1 - 数量级。abs ≥ 1e-12 时最多 23 位，在 toFixed 的 0~100 范围内
  const magnitude = Math.floor(Math.log10(abs))
  const decimals = Math.max(0, SIGNIFICANT_DIGITS - 1 - magnitude)
  const fixed = rounded.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}
