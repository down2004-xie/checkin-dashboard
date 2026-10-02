import { describe, expect, it } from 'vitest'

import { addDays, parseDateKey, toDateKey, todayKey } from './date'

describe('toDateKey', () => {
  it('把 Date 转成 YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 9, 2))).toBe('2026-10-02')
  })

  it('月份和日期补零', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('用本地时区而不是 UTC —— 凌晨 0 点必须算作当天', () => {
    // 这是最容易踩的坑：toISOString() 在东八区会把凌晨算成前一天
    const midnight = new Date(2026, 9, 2, 0, 30) // 10月2日 00:30 本地时间
    expect(toDateKey(midnight)).toBe('2026-10-02')
    // 对照：toISOString 在 UTC+8 会给出前一天
    expect(midnight.toISOString().slice(0, 10)).toBe('2026-10-01')
  })
})

describe('parseDateKey', () => {
  it('解析成当地 0 点', () => {
    const date = parseDateKey('2026-10-02')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(9)
    expect(date.getDate()).toBe(2)
    expect(date.getHours()).toBe(0)
  })
})

describe('addDays', () => {
  it('跨月正确进位', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('跨年正确进位', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('往前减天数', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('闰年 2 月 28 日 +1 天得到 29 日', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('平年 2 月 28 日 +1 天得到 3 月 1 日', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('加减 0 天返回原值', () => {
    expect(addDays('2026-10-02', 0)).toBe('2026-10-02')
  })
})

describe('todayKey', () => {
  it('与 toDateKey(new Date()) 一致', () => {
    expect(todayKey()).toBe(toDateKey(new Date()))
  })
})
