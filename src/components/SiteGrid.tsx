import { useEffect, useRef, useState } from 'react'

import type { Site } from '../types'
import { canReorder, moveNeighbor } from '../lib/sites'
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
  /** 拖拽落点：把 siteId 移动到 targetId 的位置。可见性/跨组判断在组件内用 canReorder 兜住 */
  onReorder: (siteId: string, targetId: string) => void
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
  onReorder,
  manualOrder,
  totalCount,
}: SiteGridProps) {
  /**
   * 拖拽状态放在这里而不是每张卡里：
   * 「谁在被拖」和「当前落点是谁」是跨卡片的信息，只有父级同时看得见所有卡片。
   * 卡片自己只负责渲染 dragging / dropTarget 两个布尔。
   */
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  /**
   * overId 另存一份 ref：pointerup 的回调是在 window 上监听的，
   * 闭包里的 `overId` 是「注册监听那一刻」的值。虽然把 overId 放进了依赖数组
   * 能在每次落点变化后重挂监听，但同一轮事件里 move → up 连续到达时
   * 可能还来不及重渲染。ref 保证 up 读到的永远是最后一次 move 算出的落点。
   */
  const overIdRef = useRef<string | null>(null)
  const startPoint = useRef<{ x: number; y: number } | null>(null)

  /**
   * 拖拽靠 window 上的 pointermove/pointerup 驱动，而不是卡片的 onPointerMove。
   *
   * 原因：拖动时指针会离开起始卡片、扫过别的卡片，若只在起始卡上监听就收不到后续事件。
   * 又因为把手在 pointerdown 时 setPointerCapture 了，window 层能收到完整的事件流
   * （真实浏览器里 PointerEvent 会冒泡到 window；这也是为什么验证脚本必须用 CDP
   * 真实鼠标事件而不是合成 PointerEvent —— 合成的不会触发 pointer capture）。
   *
   * 只有按住（draggedId 非空）时才挂监听，松开立刻清空，避免常驻监听。
   */
  useEffect(() => {
    if (draggedId === null) return

    const onPointerMove = (event: PointerEvent) => {
      const start = startPoint.current
      if (start === null) return
      // 移动不超过 4px 不算拖动：防止「想点一下把手」被误判成拖拽。
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 4) return

      const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-site-id]')
      const targetId = card?.dataset.siteId ?? null
      // 落点为空、是自身、或跨置顶分组（canReorder 为 false）时不高亮
      const next = targetId !== null && targetId !== draggedId && canReorder(sites, draggedId, targetId) ? targetId : null
      overIdRef.current = next
      setOverId((current) => (current === next ? current : next))
    }

    const clear = () => {
      setDraggedId(null)
      setOverId(null)
      overIdRef.current = null
      startPoint.current = null
    }

    const onPointerUp = () => {
      if (overIdRef.current !== null) onReorder(draggedId, overIdRef.current)
      clear()
    }

    const onPointerCancel = clear

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [draggedId, sites, onReorder])

  const handleDragStart = (siteId: string, point: { x: number; y: number }) => {
    startPoint.current = point
    overIdRef.current = null
    setDraggedId(siteId)
    setOverId(null)
  }

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
            manualOrder={manualOrder}
            dragging={draggedId === site.id}
            dropTarget={overId === site.id}
            onDragStart={handleDragStart}
          />
        )
      })}
    </div>
  )
}
