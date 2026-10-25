/* 网页分享 —— 纯函数，可单测。不 import React（分层铁律：能进 lib 的逻辑不进组件）。
 *
 * 这里只做两件事：按分类分组、按关键词过滤。组件只负责渲染。
 * 分类和过滤都基于静态清单 data/share-sites.ts，不碰 localStorage。
 */

import type { ShareSite } from '../data/share-sites'

export interface ShareSiteGroup {
  category: string
  sites: ShareSite[]
}

/**
 * 按 category 分组。
 *
 * 组顺序用「首次出现顺序」而不是字典序：清单是人工排的，作者把哪类放前面
 * 就是希望页面先展示哪类，字典序会打乱这个意图。
 * 组内保持原顺序，理由同上——清单里的先后本身就是有意义的。
 *
 * 用 Map 记住「分类 -> 组」的映射，一次遍历即可：既保住首次出现顺序，
 * 又避免 O(n²) 地反复 find。
 */
export function groupByCategory(sites: ShareSite[]): ShareSiteGroup[] {
  const groups: ShareSiteGroup[] = []
  const index = new Map<string, ShareSiteGroup>()

  for (const site of sites) {
    let group = index.get(site.category)
    if (!group) {
      group = { category: site.category, sites: [] }
      index.set(site.category, group)
      groups.push(group)
    }
    group.sites.push(site)
  }

  return groups
}

/**
 * 按名称 / 描述 / 分类做模糊过滤，大小写不敏感。
 *
 * 空查询（含纯空白）返回原数组：调用方「没搜」时应看到全部，
 * 提前 return 原引用还能避免不必要的重新渲染。
 */
export function filterShareSites(sites: ShareSite[], query: string): ShareSite[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return sites

  return sites.filter(
    (site) =>
      site.name.toLowerCase().includes(keyword) ||
      site.description.toLowerCase().includes(keyword) ||
      site.category.toLowerCase().includes(keyword),
  )
}
