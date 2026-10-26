import type { CheckInData, DateKey } from '../types'

/**
 * 孤儿记录（orphan records）：`records` 里指向「当前已不存在的站点 id」的签到条目。
 *
 * 这些记录是**刻意保留**的（见 CLAUDE.md 的站点身份一节）：
 * 用户删掉一张卡片后，历史不会跟着消失；哪天把同一个域名加回来，
 * id 相同，历史就自动接上了。所以清理必须是**用户显式点击**的破坏性操作，
 * 绝不能顺手在读取或迁移时自动做掉。
 *
 * 另一个必须记住的副作用：`calcStreak`（全局连续天数）只判断
 * 「那天有没有记录」，孤儿记录也算数。于是删光一张卡后，只靠孤儿记录
 * 撑起来的那一天仍会被算进连续天数 —— 这正是「清理」要解决的问题之一。
 * 验「单站历史有没有断」必须用 `calcSiteStreak`，不能用 `calcStreak`。
 */

export interface OrphanSummary {
  /** 哪些已删站点的 id 还留着记录（按字典序，保证展示稳定） */
  siteIds: string[]
  /** 含孤儿记录的天数 */
  dayCount: number
  /** 孤儿记录条目总数（同一天里同一 id 只算一条） */
  entryCount: number
}

/** 站点是否仍存在。暂停的站点**仍然存在**，不算孤儿。 */
function existingIds(data: CheckInData): Set<string> {
  return new Set(data.sites.map((site) => site.id))
}

export function findOrphans(data: CheckInData): OrphanSummary {
  const kept = existingIds(data)
  const siteIds = new Set<string>()
  let dayCount = 0
  let entryCount = 0

  for (const ids of Object.values(data.records)) {
    let dayHasOrphan = false
    for (const id of new Set(ids)) {
      if (kept.has(id)) continue
      siteIds.add(id)
      entryCount++
      dayHasOrphan = true
    }
    if (dayHasOrphan) dayCount++
  }

  return { siteIds: [...siteIds].sort(), dayCount, entryCount }
}

/**
 * 返回一份「剔除全部孤儿记录」的新数据。
 *
 * - 某天被清空就删掉这一天的 key，和 `handleToggle` / `handleTodoRemoved`
 *   的处理一致，不在存储里留 `{ '2026-10-02': [] }` 这种空壳。
 * - 没有任何孤儿时**返回原对象**（引用不变），调用方和 React 都能靠引用判断「没变」。
 * - 只动 `records`。`targets` 是「那一天的目标快照」，它记录的是当时确实存在的站点，
 *   站点后来被删不该改写历史快照；`sites` / `todos` / `preferences` 同理无关。
 */
export function removeOrphans(data: CheckInData): CheckInData {
  const kept = existingIds(data)
  const records: Record<DateKey, string[]> = {}
  let changed = false

  for (const [day, ids] of Object.entries(data.records)) {
    const next = ids.filter((id) => kept.has(id))
    if (next.length !== ids.length) changed = true
    if (next.length > 0) records[day] = next
  }

  if (!changed) return data
  return { ...data, records }
}
