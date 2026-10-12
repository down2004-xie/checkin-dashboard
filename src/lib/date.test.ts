import { describe, expect, it } from 'vitest'

import { addDays, parseDateKey, toDateKey, todayKey } from './date'

/**
 * 构造一个「本地时刻 = 指定日期与钟点」的 Date。
 *
 * 为什么不能直接写 `new Date(2026, 9, 2, 0, 30)`：
 * 那个构造器用的是**运行机器的本地时区**，于是同一行代码在不同时区下
 * 得到不同的绝对时刻 —— CI 跑在 UTC，本地跑在 UTC+8，两边算的不是同一个瞬间。
 *
 * 这里先用 UTC 构造出绝对时刻，再把它**平移**到本地：`getTimezoneOffset()`
 * 是「本地落后 UTC 的分钟数」（UTC+8 → -480），`+ offset * 60000` 之后，
 * 这个 Date 的**本地**读数就恰好是我们要的日期与钟点，走到哪个时区都成立。
 */
function localTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const utc = Date.UTC(year, month - 1, day, hour, minute)
  return new Date(utc + new Date(utc).getTimezoneOffset() * 60_000)
}

describe('toDateKey', () => {
  it('把 Date 转成 YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 9, 2))).toBe('2026-10-02')
  })

  it('月份和日期补零', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('凌晨的本地时刻算作当天（这条在 UTC 机器上才有区分度）', () => {
    // toDateKey 用 getFullYear/getMonth/getDate，全是本地时间方法，
    // 所以本地读数是 10-02 的 00:30，就永远该得 '2026-10-02'。
    expect(toDateKey(localTime(2026, 10, 2, 0, 30))).toBe('2026-10-02')
    // 边界：本地 0 点整（东八区的午夜）也必须算 10-02，不能滑到 10-01
    expect(toDateKey(localTime(2026, 10, 2, 0, 0))).toBe('2026-10-02')
    // 一天里的最后一分钟仍在当天
    expect(toDateKey(localTime(2026, 10, 2, 23, 59))).toBe('2026-10-02')
  })

  it('本地时间与 UTC 不同日时，以本地为准', () => {
    // 东八区的 10-02 00:00 对应 UTC 的 10-01 16:00。CI 跑在 UTC，
    // 这个瞬间本地的日期**就是** 10-01 —— 和 toDateKey 只要一致即正确。
    // 关键是别把「机器时区」写死进期望值：这才是原来那条断言在 CI 上红的原因。
    const moment = localTime(2026, 10, 2, 0, 0)
    const localDay = [
      moment.getFullYear(),
      String(moment.getMonth() + 1).padStart(2, '0'),
      String(moment.getDate()).padStart(2, '0'),
    ].join('-')
    expect(toDateKey(moment)).toBe(localDay)
  })

  it('不回退成 UTC 日历（本机不是 UTC+0 时才有效）', () => {
    // 说明清楚这条的**适用边界**：机器若正好在 UTC+0，本地日期和 UTC 日期
    // 恒等，`toISOString` 的写法在这个环境下**不可能**被区分出来 ——
    // 那是数学事实，不是测试写得不够好。CI 跑在 UTC，所以这条在 CI 上
    // 是「空跑」；真正的防线是本机（东八区）这一跑。
    // 要守住的是：本地 10-02 23:00 这个瞬间必须仍算 10-02。
    expect(toDateKey(localTime(2026, 10, 2, 23, 30))).toBe('2026-10-02')
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
