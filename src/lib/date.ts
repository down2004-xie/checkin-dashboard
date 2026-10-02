import type { DateKey } from '../types'

/**
 * 日期工具 —— 全部基于**本地时区**，不使用 UTC。
 *
 * 为什么单独一个文件：签到应用的所有「天」判断都依赖这里，
 * 集中管理能保证「今天」的定义在整个项目里只有一处。
 */

/**
 * 把 Date 转成 'YYYY-MM-DD'（本地时区）。
 *
 * ⚠️ 不要用 date.toISOString().slice(0, 10)。
 * toISOString 返回 UTC 时间：在东八区，10 月 2 日凌晨 0~8 点签到，
 * UTC 还停在 10 月 1 日，签到会被记到前一天，连续天数直接算错。
 * 必须用 getFullYear / getMonth / getDate 这些本地时间方法。
 */
export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 今天的日期 key */
export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

/**
 * 把 'YYYY-MM-DD' 解析成本地时区当天 0 点的 Date。
 *
 * ⚠️ 不要用 new Date('2026-10-02')。
 * 这种纯日期字符串按规范会被解析成 **UTC** 0 点，
 * 在东八区会变成 10 月 2 日 08:00，再做加减天数就会错位。
 * 手动拆开传给 Date 构造函数，得到的才是本地 0 点。
 */
export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * 在日期 key 上加减天数，返回新的 key。
 *
 * 用 setDate 而不是「时间戳 ± 86400000」：
 * setDate 会自动处理月份/年份进位，也能正确跨过夏令时切换
 * （夏令时那天实际只有 23 或 25 小时，按固定毫秒数加减会错一天）。
 */
export function addDays(key: DateKey, delta: number): DateKey {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + delta)
  return toDateKey(date)
}

/**
 * 判断两个 key 是否同一天。
 * 目前是字符串比较，抽成函数是为了以后改语义时只有一处要动。
 */
export function isSameDay(a: DateKey, b: DateKey): boolean {
  return a === b
}
