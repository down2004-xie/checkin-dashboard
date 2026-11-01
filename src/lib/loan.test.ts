import { describe, expect, it } from 'vitest'

import { annuitySchedule, compareLoan, formatCents, parseLoanForm, principalSchedule, type ScheduleRow } from './loan'

/** 两条不变量：本金合计正好等于贷款额、最后剩余本金正好归零，且每期金额都自洽 */
function expectInvariants(rows: ScheduleRow[], principalCents: number) {
  expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(principalCents)
  expect(rows[rows.length - 1].balance).toBe(0)
  let balance = principalCents
  for (const row of rows) {
    expect(row.payment).toBe(row.principal + row.interest)
    expect(row.principal).toBeGreaterThan(0)
    expect(row.interest).toBeGreaterThanOrEqual(0)
    balance -= row.principal
    expect(row.balance).toBe(balance)
    expect(Number.isInteger(row.payment) && Number.isInteger(row.interest)).toBe(true)
  }
}

/*
 * 小例子：12 万元、1 年（12 期）、年利率 6%，月利率 r = 0.005。以下数字是按公式手算的：
 * 等额本息：(1.005)^12 ≈ 1.0616778，月供 = 12,000,000 分 × 0.005 × 1.0616778 / 0.0616778
 *           ≈ 1,032,797 分（10,327.97 元）。逐期：利息 = 上期剩余 × 0.005 四舍五入到分，本金 = 月供 − 利息。
 * 等额本金：每期本金 1,000,000 分，利息 = 剩余 × 0.005，从 600 元起每期少 50 元。
 */
const SMALL = { principalCents: 12_000_000, months: 12, annualRatePercent: 6 }

describe('等额本息：12 万 / 1 年 / 6%', () => {
  const rows = annuitySchedule(SMALL)

  it('逐期核对（单位：分）', () => {
    // [本金, 利息, 剩余本金]
    const expected: [number, number, number][] = [
      [972_797, 60_000, 11_027_203],
      [977_661, 55_136, 10_049_542],
      [982_549, 50_248, 9_066_993],
      [987_462, 45_335, 8_079_531],
      [992_399, 40_398, 7_087_132],
      [997_361, 35_436, 6_089_771],
      [1_002_348, 30_449, 5_087_423],
      [1_007_360, 25_437, 4_080_063],
      [1_012_397, 20_400, 3_067_666],
      [1_017_459, 15_338, 2_050_207],
      [1_022_546, 10_251, 1_027_661],
      [1_027_661, 5_138, 0],
    ]
    expect(rows.map((row) => [row.principal, row.interest, row.balance])).toEqual(expected)
  })

  it('前 11 期月供相同，最后一期吸收尾差多 2 分', () => {
    expect(rows.slice(0, 11).every((row) => row.payment === 1_032_797)).toBe(true)
    expect(rows[11].payment).toBe(1_032_799)
  })

  it('本金合计 = 贷款额，剩余本金归零', () => {
    expectInvariants(rows, SMALL.principalCents)
  })
})

describe('等额本金：12 万 / 1 年 / 6%', () => {
  const rows = principalSchedule(SMALL)

  it('逐期核对：本金固定 1 万元，利息从 600 元每期减 50 元', () => {
    rows.forEach((row, index) => {
      expect(row.principal).toBe(1_000_000)
      expect(row.interest).toBe(60_000 - index * 5_000)
      expect(row.payment).toBe(1_060_000 - index * 5_000)
      expect(row.balance).toBe(12_000_000 - (index + 1) * 1_000_000)
    })
  })

  it('本金合计 = 贷款额，剩余本金归零', () => {
    expectInvariants(rows, SMALL.principalCents)
  })
})

describe('compareLoan：12 万 / 1 年 / 6%', () => {
  const result = compareLoan(SMALL)

  it('总利息与差额', () => {
    expect(result.annuity.totalInterest).toBe(393_566)
    expect(result.principal.totalInterest).toBe(390_000)
    expect(result.interestDiff).toBe(3_566)
  })

  it('首月月供与还款总额', () => {
    expect(result.annuity.firstPayment).toBe(1_032_797)
    expect(result.principal.firstPayment).toBe(1_060_000)
    expect(result.firstPaymentDiff).toBe(27_203)
    expect(result.annuity.totalPayment).toBe(12_393_566)
    expect(result.principal.totalPayment).toBe(12_390_000)
    expect(result.principal.lastPayment).toBe(1_005_000)
  })

  it('等额本金每月递减 = 每期本金 × 月利率 = 50 元', () => {
    expect(result.principalMonthlyDecrease).toBe(5_000)
  })
})

describe('大例子：100 万 / 30 年 / 4.9%（只断言量级和不变量）', () => {
  const input = { principalCents: 100_000_000, months: 360, annualRatePercent: 4.9 }
  const result = compareLoan(input)

  it('两张表都是 360 期，不变量成立', () => {
    expect(result.annuity.rows).toHaveLength(360)
    expect(result.principal.rows).toHaveLength(360)
    expectInvariants(result.annuity.rows, input.principalCents)
    expectInvariants(result.principal.rows, input.principalCents)
  })

  it('等额本息：月供在 5000~6000 元之间，除最后一期外都相同，总利息 80~100 万元', () => {
    const { rows, firstPayment, totalInterest } = result.annuity
    expect(firstPayment).toBeGreaterThan(500_000)
    expect(firstPayment).toBeLessThan(600_000)
    expect(rows.slice(0, 359).every((row) => row.payment === firstPayment)).toBe(true)
    // 最后一期只差取整尾差。月供取整最多偏 0.5 分，这 0.5 分每月按复利滚 359 期，
    // 上界是 0.5·((1+r)^n − 1)/r ≈ 409 分（4.09 元）。这里实测约 2 元，在界内
    const r = 0.049 / 12
    const bound = (0.5 * ((1 + r) ** 360 - 1)) / r + 1
    expect(Math.abs(rows[359].payment - firstPayment)).toBeLessThan(bound)
    expect(totalInterest).toBeGreaterThan(80_000_000)
    expect(totalInterest).toBeLessThan(100_000_000)
  })

  it('等额本金：首月 = 本金/360 + 本金×月利率，月供逐月不增', () => {
    // 100 万 / 360 = 2777.78 元；100 万 × 4.9% / 12 = 4083.33 元
    expect(result.principal.firstPayment).toBe(277_778 + 408_333)
    const payments = result.principal.rows.map((row) => row.payment)
    // 最后一期吸收尾差，可能比上一期多几分钱，所以只看前 359 期
    for (let i = 1; i < 359; i += 1) expect(payments[i]).toBeLessThanOrEqual(payments[i - 1])
  })

  it('等额本金总利息 ≈ P·r·(n+1)/2，取整误差在 1 元以内', () => {
    const exact = (100_000_000 * (0.049 / 12) * 361) / 2
    expect(Math.abs(result.principal.totalInterest - exact)).toBeLessThan(100)
  })

  it('等额本息利息多于等额本金，首月却更少', () => {
    expect(result.interestDiff).toBeGreaterThan(0)
    expect(result.firstPaymentDiff).toBeGreaterThan(0)
  })
})

describe('零利率', () => {
  it('不除以零，两种方式都退化为每月还 P/n，总利息为 0', () => {
    const input = { principalCents: 10_000_000, months: 360, annualRatePercent: 0 }
    const result = compareLoan(input)
    expect(result.annuity.totalInterest).toBe(0)
    expect(result.principal.totalInterest).toBe(0)
    expectInvariants(result.annuity.rows, input.principalCents)
    expectInvariants(result.principal.rows, input.principalCents)
  })
})

describe('最小金额 1 万 × 30 年：取整尾差不会让最后一期变负', () => {
  it('不变量成立', () => {
    const input = { principalCents: 1_000_000, months: 360, annualRatePercent: 4.9 }
    expectInvariants(annuitySchedule(input), input.principalCents)
    expectInvariants(principalSchedule(input), input.principalCents)
  })
})

describe('parseLoanForm', () => {
  it('万元换算成分，年限换算成期数', () => {
    expect(parseLoanForm('100', '30', '4.9')).toEqual({
      ok: true,
      input: { principalCents: 100_000_000, months: 360, annualRatePercent: 4.9 },
    })
    expect(parseLoanForm('12.5', '1', '0')).toEqual({
      ok: true,
      input: { principalCents: 12_500_000, months: 12, annualRatePercent: 0 },
    })
  })

  it('全角数字先 NFKC', () => {
    const result = parseLoanForm('１００', '３０', '４.９')
    expect(result.ok).toBe(true)
  })

  it('非法输入给出原因', () => {
    expect(parseLoanForm('', '30', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('abc', '30', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('0.5', '30', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '0', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '31', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '2.5', '4')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '30', '')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '30', '25')).toMatchObject({ ok: false })
    expect(parseLoanForm('100', '30', '-1')).toMatchObject({ ok: false })
  })
})

describe('formatCents', () => {
  it('千分位 + 两位小数，不经过 toFixed', () => {
    expect(formatCents(0)).toBe('0.00')
    expect(formatCents(5)).toBe('0.05')
    expect(formatCents(1_032_797)).toBe('10,327.97')
    expect(formatCents(100_000_000)).toBe('1,000,000.00')
    expect(formatCents(-3_566)).toBe('-35.66')
  })
})
