import type { Site } from '../types'
import { GlassCard } from './GlassCard'

interface SiteGridProps {
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
}

export function SiteGrid({
  sites,
  checkedIds,
  totalDaysById,
  siteStreakById,
  onToggle,
  onEdit,
  onRemove,
}: SiteGridProps) {
  if (sites.length === 0) {
    return (
      <div className="empty">
        <p className="empty__text">还没有签到站点</p>
        <p className="empty__hint">点下方「添加站点」建立你的第一个站点</p>
      </div>
    )
  }

  return (
    <div className="grid">
      {sites.map((site) => (
        <GlassCard
          key={site.id}
          site={site}
          checked={checkedIds.has(site.id)}
          totalDays={totalDaysById.get(site.id) ?? 0}
          siteStreak={siteStreakById.get(site.id) ?? 0}
          onToggle={onToggle}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}
