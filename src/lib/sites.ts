import type { Site } from '../types'

export type SiteStatus = 'all' | 'pending' | 'done' | 'paused'
export type SiteSort = 'manual' | 'name' | 'pending'

export interface SiteFilters {
  query: string
  category: string | null
  status: SiteStatus
  sort: SiteSort
}

export function filterSites(sites: Site[], checked: ReadonlySet<string>, filters: SiteFilters): Site[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return sites.filter((site) => {
    if (filters.category !== null && (site.category ?? '') !== filters.category) return false
    if (query && !`${site.name} ${site.url}`.toLocaleLowerCase().includes(query)) return false
    if (filters.status === 'paused') return !!site.paused
    if (filters.status === 'pending') return !site.paused && !checked.has(site.id)
    if (filters.status === 'done') return !site.paused && checked.has(site.id)
    return true
  }).sort((first, second) => {
    const pinned = Number(!!second.pinned) - Number(!!first.pinned)
    if (pinned) return pinned
    if (filters.sort === 'name') return first.name.localeCompare(second.name, 'zh-CN')
    if (filters.sort === 'pending') return Number(!!first.paused || checked.has(first.id)) - Number(!!second.paused || checked.has(second.id))
    return 0
  })
}

/**
 * 手动排序下，某个站点能和哪个相邻站点交换位置？返回对方的 id，不能换则返回 null。
 *
 * ## 为什么必须基于**可见列表**而不是存储数组
 *
 * 页面上看到的是筛选（分类 / 状态 / 搜索）之后的结果，而 `sites` 在存储里是全集。
 * 如果拿存储索引 ±1 当邻居，用户在「只看未签到」里点「后移」，换掉的可能是
 * 屏幕外那张卡片 —— **可见列表一动不动，存储顺序却被悄悄改了**，
 * 用户会以为按钮坏了，而且他下次清掉筛选会看到一个莫名其妙的新顺序。
 *
 * 所以「谁算相邻」由这个函数按可见列表算，reducer 只负责执行这次交换。
 *
 * ## 为什么不允许跨「置顶/普通」两组交换
 *
 * `filterSites` 里置顶的永远排在前面（`pinned` 那一项先于其它排序生效），
 * 也就是说**置顶卡片的显示位置由置顶决定，不由手动顺序决定**。
 * 一个置顶站和一个普通站互换存储位置后，屏幕上两者的相对位置不变 ——
 * 又是一次「点了好像没反应」。所以跨组的方向直接返回 null，按钮置灰。
 *
 * 推论：置顶站只在置顶区里调序，普通站只在普通区里调序。这是「置顶」
 * 这个功能的必然结果，不是额外的限制。
 */
export function moveNeighbor(visible: readonly Site[], siteId: string, direction: -1 | 1): string | null {
  const index = visible.findIndex((site) => site.id === siteId)
  if (index < 0) return null

  const neighbor = visible[index + direction]
  if (neighbor === undefined) return null
  if (!!neighbor.pinned !== !!visible[index].pinned) return null

  return neighbor.id
}

/**
 * 拖拽排序：`id` 能不能落到 `targetId` 这个位置？
 *
 * ## 为什么跨「置顶/普通」直接 false
 *
 * 和 `moveNeighbor` 同一条理由：`filterSites` 里置顶卡永远排在普通卡前面，
 * 也就是**置顶卡的显示位置由置顶决定，不由手动顺序决定**。
 * 把一个置顶卡拖到普通区（或反过来），存储顺序换了，屏幕上两者的相对位置却不变 ——
 * 用户会以为拖拽失灵。所以两组之间的落点一律拒绝，让拖动只在组内生效。
 *
 * 判定用的是 `!!pinned`，把 `undefined` 和 `false` 视为同一组（普通站）。
 * 返回 false 的三种情况：同一个 id（原地）、任一 id 不在可见列表里、跨组。
 */
export function canReorder(visible: readonly Site[], id: string, targetId: string): boolean {
  if (id === targetId) return false

  const from = visible.find((site) => site.id === id)
  const to = visible.find((site) => site.id === targetId)
  if (from === undefined || to === undefined) return false

  return !!from.pinned === !!to.pinned
}
