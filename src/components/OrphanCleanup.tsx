import type { CheckInData } from '../types'
import { findOrphans } from '../lib/orphans'

interface OrphanCleanupProps {
  data: CheckInData
  busy: boolean
  /** 参数是即将被删掉的条目数，供调用方提示「已清理 N 条」 */
  onClear: (entryCount: number) => void
}

/**
 * 孤儿记录清理入口。
 *
 * 为什么单独做成一个「有才显示」的区块，而不是塞进备份条或设置里：
 * 孤儿记录是**刻意保留**的数据（删卡片不删历史，加回同域名能接回）。
 * 平时它一点不影响使用，只有当用户主动想「彻底删掉那些已删站点的历史」时才需要。
 * 常驻一个按钮反而会诱导用户误点 —— 那是不可逆的破坏性操作。
 *
 * 所以策略是：没有孤儿时整块不渲染；有孤儿时如实报数（几个站点、几天、几条），
 * 点之前再弹一次确认，并把「以后加回同域名就接不回历史了」这条代价讲清楚。
 */
export function OrphanCleanup({ data, busy, onClear }: OrphanCleanupProps) {
  const summary = findOrphans(data)
  if (summary.entryCount === 0) return null

  const preview = summary.siteIds.slice(0, 5).join('、') + (summary.siteIds.length > 5 ? ' 等' : '')

  const handleClick = () => {
    const ok = window.confirm(
      `将删除 ${summary.entryCount} 条指向已删除站点的历史记录（来自 ${summary.siteIds.length} 个站点、涉及 ${summary.dayCount} 天）。\n\n` +
      `清理后无法恢复；如果以后想把同域名的站点加回来接续历史，请先不要清理。\n\n确认清理？`,
    )
    if (ok) onClear(summary.entryCount)
  }

  return (
    <section className="orphans" aria-label="清理孤儿记录">
      <div className="orphans__text">
        <span className="orphans__title">有 {summary.entryCount} 条历史记录指向已删除的站点</span>
        <span className="orphans__hint">
          来自 {summary.siteIds.length} 个已删除站点（{preview}），涉及 {summary.dayCount} 天。
          它们不影响今日进度，但会被算进「连续签到天数」。清理后不可恢复。
        </span>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={handleClick}>
        清理孤儿记录
      </button>
    </section>
  )
}
