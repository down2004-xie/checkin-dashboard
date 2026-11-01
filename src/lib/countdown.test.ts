import { describe, expect, it } from 'vitest'

import { countdownTo, daysBetween, nextAnniversary } from './countdown'

describe('nextAnniversary', () => {
  it('今年的纪念日还没到 → 就是今年', () => {
    expect(nextAnniversary('2020-05-20', '2026-03-01')).toEqual({
      // 2020-05-20 → 2026-05-20 共 2191 天（含 2020、2024 两个 2 月 29 日），今天早 80 天
      next: '2026-05-20', daysUntil: 80, years: 6, daysSince: 2111, isToday: false,
    })
  })

  it('今年的已经过了 → 跨年到明年', () => {
    const result = nextAnniversary('2020-05-20', '2026-12-30')
    expect(result?.next).toBe('2027-05-20')
    expect(result?.years).toBe(7)
    expect(result?.daysUntil).toBe(141)
  })

  it('年末起始日跨年：12-31 的纪念日在 1 月初看是今年年底', () => {
    const result = nextAnniversary('2025-12-31', '2026-01-02')
    expect(result?.next).toBe('2026-12-31')
    expect(result?.years).toBe(1)
  })

  it('今天恰好是纪念日：daysUntil 为 0、isToday、周年数算今年这次', () => {
    expect(nextAnniversary('2020-05-20', '2026-05-20')).toEqual({
      next: '2026-05-20', daysUntil: 0, years: 6, daysSince: 2191, isToday: true,
    })
  })

  it('起始日就是今天：不算第 0 周年，下一次是一年后', () => {
    const result = nextAnniversary('2026-10-02', '2026-10-02')
    expect(result?.next).toBe('2027-10-02')
    expect(result?.years).toBe(1)
    expect(result?.isToday).toBe(false)
    expect(result?.daysSince).toBe(0)
  })

  it('2 月 29 日的纪念日在平年按 2 月 28 日算', () => {
    const result = nextAnniversary('2024-02-29', '2026-01-10')
    expect(result?.next).toBe('2026-02-28')
    expect(result?.years).toBe(2)
  })

  it('2 月 29 日的纪念日在闰年还是 2 月 29 日', () => {
    expect(nextAnniversary('2024-02-29', '2027-06-01')?.next).toBe('2028-02-29')
  })

  it('平年 2 月 28 日就是 2-29 纪念日的当天', () => {
    expect(nextAnniversary('2024-02-29', '2025-02-28')?.isToday).toBe(true)
  })

  it('起始日在未来或非法 → null', () => {
    expect(nextAnniversary('2027-01-01', '2026-10-02')).toBeNull()
    expect(nextAnniversary('2026-02-30', '2026-10-02')).toBeNull()
  })
})

describe('daysBetween', () => {
  it('同一天相差 0 天', () => {
    expect(daysBetween('2026-10-02', '2026-10-02')).toBe(0)
  })

  it('未来为正、过去为负', () => {
    expect(daysBetween('2026-10-02', '2026-10-12')).toBe(10)
    expect(daysBetween('2026-10-12', '2026-10-02')).toBe(-10)
  })

  it('跨月正确', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
  })

  it('跨年正确', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('闰年 2 月 29 日存在（2028 是闰年）', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it('平年 2 月只有 28 天', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('非法日期返回 NaN', () => {
    expect(daysBetween('2026-13-01', '2026-10-02')).toBeNaN()
    expect(daysBetween('2026-10-02', 'not-a-date')).toBeNaN()
  })
})

describe('countdownTo', () => {
  const today = '2026-10-02'

  it('未来：还有 N 天', () => {
    const result = countdownTo('2026-10-12', today)
    expect(result.days).toBe(10)
    expect(result.status).toBe('future')
    expect(result.label).toBe('还有 10 天')
  })

  it('当天：就是今天', () => {
    const result = countdownTo('2026-10-02', today)
    expect(result.days).toBe(0)
    expect(result.status).toBe('today')
    expect(result.label).toBe('就是今天')
  })

  it('过去：已经过去 N 天（文案用绝对值，不出现负数）', () => {
    const result = countdownTo('2026-09-25', today)
    expect(result.days).toBe(-7)
    expect(result.status).toBe('past')
    expect(result.label).toBe('已经过去 7 天')
  })

  it('非法日期：给出无效文案且 days 为 NaN', () => {
    const result = countdownTo('2026-02-30', today)
    expect(result.days).toBeNaN()
    expect(result.label).toBe('日期无效')
  })
})
