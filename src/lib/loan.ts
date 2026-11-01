/* 房贷计算 —— 纯函数，可单测。
 *
 * 两种还款方式：
 * - 等额本息：每月还款额相同。月供 = P·r·(1+r)^n / ((1+r)^n − 1)
 * - 等额本金：每月还的本金相同（P/n），利息按剩余本金算，所以月供逐月递减。
 * 其中 P 是贷款本金，r 是月利率（年利率 / 12），n 是期数（月）。
 *
 * 关键设计：**逐月表里的金额一律用「分」（整数）存**。
 * 每期利息按「剩余本金 × r」算出后立刻四舍五入到分，本金 = 月供 − 利息，
 * 剩余本金只做整数减法 —— 这样 360 期下来不会有浮点误差慢慢累积。
 * 四舍五入总会留下几分钱的尾差，**统一由最后一期吸收**：
 * 最后一期的本金直接等于当时的剩余本金，于是本金合计正好等于贷款额、剩余本金正好归零。
 * 银行实际的取整方式各家不同，所以界面上要写明「结果为估算」。
 *
 * 不做：组合贷款（公积金 + 商贷）、提前还款。
 */

export type RepaymentMethod = 'annuity' | 'principal'

export interface LoanInput {
  /** 贷款本金，单位：分 */
  principalCents: number
  /** 期数（月） */
  months: number
  /** 年利率，百分数，如 4.9 表示 4.9% */
  annualRatePercent: number
}

export interface ScheduleRow {
  /** 第几期，从 1 开始 */
  period: number
  /** 当期还款额（分） */
  payment: number
  /** 其中本金（分） */
  principal: number
  /** 其中利息（分） */
  interest: number
  /** 还完这期后的剩余本金（分） */
  balance: number
}

export interface LoanSummary {
  method: RepaymentMethod
  rows: ScheduleRow[]
  /** 首月月供（分） */
  firstPayment: number
  /** 末月月供（分） */
  lastPayment: number
  /** 总利息（分） */
  totalInterest: number
  /** 还款总额 = 本金 + 总利息（分） */
  totalPayment: number
}

export interface LoanComparison {
  annuity: LoanSummary
  principal: LoanSummary
  /** 等额本息比等额本金多付的利息（分），正常情况下 ≥ 0 */
  interestDiff: number
  /** 等额本金首月比等额本息首月多还多少（分） */
  firstPaymentDiff: number
  /** 等额本金每月递减多少（分）= 第 1 期月供 − 第 2 期月供；只有 1 期时为 0 */
  principalMonthlyDecrease: number
}

/** 年限范围：1~30 年。国内商贷最长 30 年 */
export const MIN_YEARS = 1
export const MAX_YEARS = 30
/** 年利率上限 20%：再高就不是房贷了，多半是输错了小数点 */
export const MAX_RATE_PERCENT = 20
/** 贷款额上限 10 亿元（以万元计 100000），只为挡住误输入，不是业务限制 */
export const MAX_AMOUNT_WAN = 100000
/** 贷款额下限 1 万元：太小的本金分摊到 360 期，每期本金不足 1 分，取整误差会失真 */
export const MIN_AMOUNT_WAN = 1

const monthlyRate = (annualRatePercent: number): number => annualRatePercent / 100 / 12

function summarize(method: RepaymentMethod, rows: ScheduleRow[], principalCents: number): LoanSummary {
  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0)
  return {
    method,
    rows,
    firstPayment: rows[0]?.payment ?? 0,
    lastPayment: rows[rows.length - 1]?.payment ?? 0,
    totalInterest,
    totalPayment: principalCents + totalInterest,
  }
}

/**
 * 等额本息逐月表。
 * 月供按公式算出后取整到分，每期都一样；最后一期的本金 = 剩余本金（吸收尾差），
 * 所以最后一期月供可能和前面差几分钱。年利率为 0 时公式分母为 0，退化为 P/n。
 */
export function annuitySchedule({ principalCents, months, annualRatePercent }: LoanInput): ScheduleRow[] {
  const r = monthlyRate(annualRatePercent)
  const growth = (1 + r) ** months
  const payment = r === 0
    ? Math.round(principalCents / months)
    : Math.round((principalCents * r * growth) / (growth - 1))

  const rows: ScheduleRow[] = []
  let balance = principalCents
  for (let period = 1; period <= months; period += 1) {
    const interest = Math.round(balance * r)
    const principal = period === months ? balance : payment - interest
    balance -= principal
    rows.push({ period, payment: principal + interest, principal, interest, balance })
  }
  return rows
}

/**
 * 等额本金逐月表。
 * 每期本金 = P/n 取整到分，利息 = 剩余本金 × r 取整到分；
 * 最后一期本金 = 剩余本金（吸收 P/n 取整留下的尾差）。
 */
export function principalSchedule({ principalCents, months, annualRatePercent }: LoanInput): ScheduleRow[] {
  const r = monthlyRate(annualRatePercent)
  const basePrincipal = Math.round(principalCents / months)

  const rows: ScheduleRow[] = []
  let balance = principalCents
  for (let period = 1; period <= months; period += 1) {
    const interest = Math.round(balance * r)
    const principal = period === months ? balance : basePrincipal
    balance -= principal
    rows.push({ period, payment: principal + interest, principal, interest, balance })
  }
  return rows
}

/** 两种方式各算一遍，给出对比 */
export function compareLoan(input: LoanInput): LoanComparison {
  const annuity = summarize('annuity', annuitySchedule(input), input.principalCents)
  const principal = summarize('principal', principalSchedule(input), input.principalCents)
  return {
    annuity,
    principal,
    interestDiff: annuity.totalInterest - principal.totalInterest,
    firstPaymentDiff: principal.firstPayment - annuity.firstPayment,
    principalMonthlyDecrease: principal.rows.length > 1 ? principal.rows[0].payment - principal.rows[1].payment : 0,
  }
}

export type ParsedLoan = { ok: true; input: LoanInput } | { ok: false; error: string }

/** 把用户输入的数字串转成有限数；空串、非数字返回 NaN（Number('') 是 0，不能直接用） */
function toNumber(text: string): number {
  const trimmed = text.normalize('NFKC').trim()
  if (trimmed === '' || !/^\d+(\.\d+)?$/.test(trimmed)) return Number.NaN
  return Number(trimmed)
}

/**
 * 校验并换算表单输入。金额以「万元」为单位（房贷习惯这么说），
 * 换成分时 ×1,000,000 再取整：输入最多到「元」级精度（万元后 4 位小数），更细的会被四舍五入到分。
 */
export function parseLoanForm(amountWan: string, years: string, ratePercent: string): ParsedLoan {
  const amount = toNumber(amountWan)
  if (Number.isNaN(amount)) return { ok: false, error: '贷款金额请填数字（单位：万元）' }
  if (amount < MIN_AMOUNT_WAN || amount > MAX_AMOUNT_WAN) {
    return { ok: false, error: `贷款金额需在 ${MIN_AMOUNT_WAN} ~ ${MAX_AMOUNT_WAN} 万元之间` }
  }
  const yearCount = toNumber(years)
  if (!Number.isInteger(yearCount) || yearCount < MIN_YEARS || yearCount > MAX_YEARS) {
    return { ok: false, error: `贷款年限需为 ${MIN_YEARS} ~ ${MAX_YEARS} 的整数` }
  }
  const rate = toNumber(ratePercent)
  if (Number.isNaN(rate) || rate > MAX_RATE_PERCENT) {
    return { ok: false, error: `年利率请填 0 ~ ${MAX_RATE_PERCENT} 之间的数字（单位：%）` }
  }
  return {
    ok: true,
    input: { principalCents: Math.round(amount * 1_000_000), months: yearCount * 12, annualRatePercent: rate },
  }
}

/** 分 → 「1,234.56」。只做整数运算再拼小数点，避免 toFixed 的浮点舍入 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const yuan = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+$)/g, ',')
  const fen = String(abs % 100).padStart(2, '0')
  return `${sign}${yuan}.${fen}`
}
