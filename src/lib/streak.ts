import type { CheckInData, DateKey } from '../types'
import { addDays, todayKey } from './date'

/**
 * 连续签到天数（streak）计算 —— 纯函数，不依赖 React，可直接单测。
 *
 * 「连续」的定义（必须明确定义，否则实现会各说各话）：
 * 从某天往前数，每天都必须「有签到记录」，直到断掉为止。
 *
 * 这里有关键决策：**当天还没签到时，streak 不算断**。
 * 例：昨天签了、今天还没签 → streak 显示 1（昨天的），而不是 0。
 * 否则每天早上一睁眼打开页面就看到「连续 0 天」，会让人以为记录丢了。
 * 当天是否签到由「今日进度」单独展示，两件事不混在一起。
 */

/** 某天是否有签到记录（至少一个站点） */
export function hasCheckedIn(data: CheckInData, day: DateKey): boolean {
  const ids = data.records[day]
  return Array.isArray(ids) && ids.length > 0
}

/**
 * calcStreak 的谓词化版本。
 *
 * 为什么抽出来：「某天是否签了」的判断方式不止一种 ——
 * 全局看「当天有没有任意记录」，单站看「当天有没有这个站的记录」。
 * 循环逻辑只有一份，差异全在调用方传入的 checked 谓词里。
 */
export function calcStreakBy(
  checked: (day: DateKey) => boolean,
  today: DateKey,
  maxLookback = 3650,
): number {
  let cursor = checked(today) ? today : addDays(today, -1)
  let streak = 0

  // maxLookback 是保险丝：数据被污染或日期算出怪值时，避免无限循环卡死页面
  for (let i = 0; i < maxLookback; i++) {
    if (!checked(cursor)) break
    streak++
    cursor = addDays(cursor, -1)
  }

  return streak
}

/** 计算连续签到天数。算法见 calcStreakBy。 */
export function calcStreak(
  data: CheckInData,
  today: DateKey = todayKey(),
  maxLookback = 3650,
): number {
  return calcStreakBy((day) => hasCheckedIn(data, day), today, maxLookback)
}

/** 计算某个站点的连续签到天数。 */
export function calcSiteStreak(
  data: CheckInData,
  siteId: string,
  today: DateKey = todayKey(),
  maxLookback = 3650,
): number {
  return calcStreakBy(
    (day) => data.records[day]?.includes(siteId) ?? false,
    today,
    maxLookback,
  )
}

/**
 * calcLongestStreak 的谓词化版本。
 * 参数化的理由同 calcStreakBy：全局和单站只是「当天算不算签了」不同。
 *
 * 为什么要外部传入候选日期（days）而不是自己从 data 里取：
 * 这个函数拿到的只有一个「这天算不算签到」的谓词，
 * 它无从知道有哪些日期值得考察。候选集合是调用方的知识，
 * 所以由调用方传进来，函数本身只负责「从候选里挑出签到的、再算最长连续段」。
 */
export function calcLongestStreakBy(
  days: DateKey[],
  checked: (day: DateKey) => boolean,
): number {
  const signed = days.filter((day) => checked(day)).sort() // 字典序 == 时间序

  if (signed.length === 0) return 0

  let longest = 1
  let current = 1

  for (let i = 1; i < signed.length; i++) {
    // 前一天的 key +1 天，如果正好等于今天，说明是连续的
    if (addDays(signed[i - 1], 1) === signed[i]) {
      current++
    } else {
      current = 1
    }
    if (current > longest) longest = current
  }

  return longest
}

/** 统计某天已签到的站点数量 */
export function countChecked(data: CheckInData, day: DateKey): number {
  return data.records[day]?.length ?? 0
}

/**
 * 统计某天已签到、且 id 仍在 validIds 集合内的站点数量。
 *
 * 为什么需要：站点可删除后，records 里会留下已删站点的「孤儿记录」。
 * 今日进度（done）若还用 countChecked，会出现「签了已删的站 → done 虚高」
 * 甚至 done > total、进度环超过 100% 的 bug。
 * 这里把统计范围限制在「当前仍存在的站点」内。
 * 历史热力图不调它 —— 那儿的孤儿记录是真实签到，应该保留展示。
 */
export function countCheckedValid(
  data: CheckInData,
  day: DateKey,
  validIds: ReadonlySet<string>,
): number {
  return (data.records[day] ?? []).filter((id) => validIds.has(id)).length
}

/**
 * 计算历史最长连续天数。
 *
 * 为什么需要：只有「当前连续」的话，一旦断签数字归零，
 * 之前的努力就完全看不到了，容易让人直接放弃。
 * 最长记录是给用户的「沉没成本」锚点。
 */
export function calcLongestStreak(data: CheckInData): number {
  return calcLongestStreakBy(Object.keys(data.records), (day) => hasCheckedIn(data, day))
}
