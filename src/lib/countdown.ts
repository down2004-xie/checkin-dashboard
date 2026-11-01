import type { DateKey } from '../types'
import { isDateKey, todayKey } from './date'

/* 倒计时 / 纪念日 —— 纯函数，可单测。
 *
 * 核心是「两个日期相差多少个自然日」。这里刻意不拿两个 Date 相减再除以
 * 86400000：夏令时切换那天只有 23 或 25 小时，除下来不是整数，round 之后
 * 会随季节偏一天。改用「把年月日折算成 UTC 的整数天序号再相减」——
 * UTC 没有夏令时，两个纯日期的天序号差就是精确的自然日差。
 */

/** 把 'YYYY-MM-DD' 折成「自 1970-01-01 起的第几天」（UTC 视角，无夏令时） */
function toDayNumber(key: DateKey): number {
  const [year, month, day] = key.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

/**
 * 计算 from → to 相差的自然日数。
 * to 在 from 之后为正，之前为负，同一天为 0。任一 key 非法返回 NaN。
 */
export function daysBetween(from: DateKey, to: DateKey): number {
  if (!isDateKey(from) || !isDateKey(to)) return NaN
  return toDayNumber(to) - toDayNumber(from)
}

export type CountdownStatus = 'future' | 'today' | 'past'

export interface CountdownResult {
  /** 距离目标还有几天：未来为正，过去为负，当天为 0 */
  days: number
  status: CountdownStatus
  /** 直接可显示的一句话 */
  label: string
}

/**
 * 从今天算到目标日。
 *
 * 文案用「绝对值天数」：未来显示「还有 N 天」，过去显示「已经过去 N 天」，
 * 当天显示「就是今天」。把正负号留在 days 里、文案只讲人话，
 * 界面上不会出现「还有 -3 天」这种别扭表达。
 */
export function countdownTo(target: DateKey, today: DateKey = todayKey()): CountdownResult {
  const days = daysBetween(today, target)
  if (!Number.isFinite(days)) return { days: NaN, status: 'future', label: '日期无效' }
  if (days > 0) return { days, status: 'future', label: `还有 ${days} 天` }
  if (days === 0) return { days, status: 'today', label: '就是今天' }
  return { days, status: 'past', label: `已经过去 ${Math.abs(days)} 天` }
}

export interface AnniversaryResult {
  /** 下一次纪念日（今天恰好是纪念日时就是今天） */
  next: DateKey
  /** 距下一次纪念日还有几天，今天是纪念日为 0 */
  daysUntil: number
  /** 下一次纪念日是第几周年（从 1 起） */
  years: number
  /** 起始日到今天已经过去多少天 */
  daysSince: number
  /** 今天就是纪念日 */
  isToday: boolean
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * 起始日在某一年的「周年日」。
 *
 * 2 月 29 日的纪念日在平年按 **2 月 28 日** 算：那一年没有 29 日，
 * 如果顺延到 3 月 1 日，纪念日就跑到另一个月了；而 2 月 28 日仍在「二月的最后一天」，
 * 这也是多数日历软件和法律上（如生日满周岁）常见的处理。
 */
function anniversaryIn(year: number, month: number, day: number): DateKey {
  const actualDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`
}

/**
 * 每年重复的纪念日：从起始日（如恋爱纪念日 2020-05-20）算出下一次纪念日。
 *
 * 规则：
 * - 今年的周年日还没到（或就是今天）→ 下一次就是今年；已经过了 → 明年。
 * - 起始日当天不算「第 0 周年」：起始日就是今天时，下一次是一年后的第 1 周年。
 * - 起始日在未来（还没开始）返回 null，交给 countdownTo 当普通倒计时处理。
 * 任一日期非法也返回 null。
 */
export function nextAnniversary(origin: DateKey, today: DateKey = todayKey()): AnniversaryResult | null {
  if (!isDateKey(origin) || !isDateKey(today)) return null
  const daysSince = daysBetween(origin, today)
  if (daysSince < 0) return null

  const [originYear, month, day] = origin.split('-').map(Number)
  const todayYear = Number(today.slice(0, 4))
  // 今年的周年日；起始年本身不是周年，所以至少从起始年 + 1 开始
  let year = Math.max(todayYear, originYear + 1)
  let next = anniversaryIn(year, month, day)
  if (daysBetween(today, next) < 0) {
    year += 1
    next = anniversaryIn(year, month, day)
  }
  const daysUntil = daysBetween(today, next)
  return { next, daysUntil, years: year - originYear, daysSince, isToday: daysUntil === 0 }
}
