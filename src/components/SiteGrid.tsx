import type { Site } from '../types'
import { moveNeighbor } from '../lib/sites'
import { GlassCard } from './GlassCard'

interface SiteGridProps {
  /** 当前**可见**的站点（已按筛选和排序处理过） */
  sites: Site[]
  /** 今天已签到的站点 id 集合，用 Set 而不是数组，判断是 O(1) */
  checkedIds: Set<string>
  /** 站点 id -> 累计签到天数 */
  totalDaysById: Map<string, number>
  /** 站点 id -> 当前连续签到天数 */
  siteStreakById: Map<string, number>
  onToggle: (siteId: string) => void
  onEdit: (siteId: string) => void
  onRemove: (siteId: string) => void
  onUpdate: (siteId: string, patch: Partial<Site>) => void
  /** 和 targetId 换位。邻居由本组件按**可见列表**算好（见 moveNeighbor） */
  onMove: (siteId: string, targetId: string) => void
  /** 是否按手动顺序排列（其它排序下移动没有意义） */
  manualOrder: boolean
  /** 站点总数（未筛选）。用来区分「一个站都没有」和「筛选后没剩」 */
  totalCount: number
}

export function SiteGrid({
  sites,
  checkedIds,
  totalDaysById,
  siteStreakById,
  onToggle,
  onEdit,
  onRemove,
  onUpdate,
  onMove,
  manualOrder,
  totalCount,
}: SiteGridProps) {
  if (sites.length === 0) {
    return (
      <div className="empty">
        <p className="empty__text">{totalCount ? '没有符合条件的站点' : '还没有签到站点'}</p>
        <p className="empty__hint">{totalCount ? '试试清空搜索或切换筛选条件' : '点下方「添加站点」建立你的第一个站点'}</p>
      </div>
    )
  }

  return (
    <div className="grid">
      {sites.map((site) => {
        /**
         * 邻居**在渲染时就按可见列表算好**，而不是在点击时才找 ——
         * 这样按钮的禁用状态和点下去的结果永远一致。
         * 之前的写法是拿未筛选的全集比索引，按钮会亮着但点了没效果。
         */
        const up = manualOrder ? moveNeighbor(sites, site.id, -1) : null
        const down = manualOrder ? moveNeighbor(sites, site.id, 1) : null
        return (
          <GlassCard
            key={site.id}
            site={site}
            checked={checkedIds.has(site.id)}
            totalDays={totalDaysById.get(site.id) ?? 0}
            siteStreak={siteStreakById.get(site.id) ?? 0}
            onToggle={onToggle}
            onEdit={onEdit}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onMove={onMove}
            moveUpTargetId={up}
            moveDownTargetId={down}
          />
        )
      })}
    </div>
  )
}
