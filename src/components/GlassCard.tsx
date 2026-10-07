import { useEffect, useRef, useState } from 'react'

import type { Site } from '../types'
import { useCardHighlight } from '../hooks/useCardHighlight'

interface GlassCardProps {
  site: Site
  /** 今天是否已签到 */
  checked: boolean
  /** 该站的累计签到天数，作为「沉没成本」提示 */
  totalDays: number
  /** 该站当前连续签到天数 */
  siteStreak: number
  onToggle: (siteId: string) => void
  /** 请求编辑该站（由 App 打开表单） */
  onEdit: (siteId: string) => void
  /** 请求删除该站 */
  onRemove: (siteId: string) => void
}

/**
 * 液态玻璃卡片。
 *
 * 结构上的一个关键决策（无障碍相关）：
 * 卡片整体是一个 div，里面放一个 <a> 和几个 <button>。
 * 不能把按钮嵌在链接里 —— 那是非法 HTML，屏幕阅读器和键盘导航会乱。
 *
 * 那怎么做到「点卡片任意位置都跳转」？
 * 用「拉伸链接」模式：<a> 通过 ::after 铺满整张卡片，
 * 按钮再用 position: relative + z-index 抬到链接之上。
 * 这样点击卡片空白处走链接，点击按钮走按钮，互不干扰。
 */
export function GlassCard({
  site,
  checked,
  totalDays,
  siteStreak,
  onToggle,
  onEdit,
  onRemove,
}: GlassCardProps) {
  const { handlePointerMove, handlePointerLeave } = useCardHighlight()

  /**
   * 勾选瞬间的弹性动画。
   *
   * 不能用「checked 为 true 就挂 pop 类」的写法 —— 那样页面加载时
   * 所有已签到的卡片会满屏重播动画。所以用 ref 记住上一次的勾选状态，
   * 只在 false → true 的**跳变沿**触发；取消勾选不播（回退不该有奖励感）。
   *
   * 动画播完由 animationend 摘类，而不是 setTimeout：
   * 动画时长改了这里不用跟着改，也不会出现「定时器比动画先到」的闪动。
   */
  const prevChecked = useRef(checked)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (checked && !prevChecked.current) setPopping(true)
    prevChecked.current = checked
  }, [checked])

  return (
    <div
      className={`card${checked ? ' card--done' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="card__row">
        <a
          className="card__link"
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {site.name}
        </a>

        <div className="card__actions">
          <button
            type="button"
            className="card__icon"
            onClick={() => onEdit(site.id)}
            aria-label={`编辑 ${site.name}`}
            title="编辑"
          >
            ✎
          </button>

          <button
            type="button"
            className="card__icon"
            onClick={() => onRemove(site.id)}
            aria-label={`删除 ${site.name}`}
            title="删除"
          >
            ×
          </button>

          <button
            type="button"
            className={`card__toggle${popping ? ' card__toggle--pop' : ''}`}
            onClick={() => onToggle(site.id)}
            aria-pressed={checked}
            aria-label={checked ? `取消签到 ${site.name}` : `标记已签到 ${site.name}`}
            onAnimationEnd={() => setPopping(false)}
          >
            {checked ? '✓' : ''}
          </button>
        </div>
      </div>

      <div className="card__meta">
        {site.category && <span className="card__tag">{site.category}</span>}
        {siteStreak > 0 && (
          <span className="card__stat card__stat--streak">连续 {siteStreak} 天</span>
        )}
        {totalDays > 0 && (
          <span className="card__stat">累计 {totalDays} 天</span>
        )}
      </div>
    </div>
  )
}
