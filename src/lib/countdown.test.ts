import { describe, expect, it } from 'vitest'

import { countdownTo, daysBetween } from './countdown'

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
