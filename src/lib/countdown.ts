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
