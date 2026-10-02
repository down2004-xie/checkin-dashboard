import type { CSSProperties } from 'react'

interface ProgressHeaderProps {
  /** 今天已签到的站点数 */
  done: number
  /** 站点总数 */
  total: number
  /** 当前连续签到天数 */
  streak: number
  /** 历史最长连续天数 */
  longest: number
}

/**
 * 顶部进度区：今日进度环 + 连续天数。
 *
 * 用 conic-gradient 画进度环而不是 SVG：
 * 一个 CSS 渐变就能表达「已完成的百分比」，不需要引入 SVG 路径计算。
 * 代价是无法画复杂的圆角端点，但对进度环来说够用。
 */
export function ProgressHeader({
  done,
  total,
  streak,
  longest,
}: ProgressHeaderProps) {
  const ratio = total === 0 ? 0 : done / total
  const percent = Math.round(ratio * 100)
  const allDone = total > 0 && done === total

  return (
    <header className="header">
      <div className="header__left">
        <h1 className="header__title">签到看板</h1>
        <p className="header__subtitle">
          {allDone
            ? '今天全部签完了 🎉'
            : total === 0
              ? '先去 sites.ts 添加站点'
              : `还有 ${total - done} 个没签`}
        </p>
      </div>

      <div className="header__stats">
        <div className="stat">
          <span className="stat__value">{streak}</span>
          <span className="stat__label">连续天数</span>
        </div>
        <div className="stat">
          <span className="stat__value stat__value--muted">{longest}</span>
          <span className="stat__label">最长记录</span>
        </div>

        {/* 进度环：--ratio 由内联样式传入，CSS 里的 conic-gradient 消费它 */}
        <div
          className={`ring${allDone ? ' ring--done' : ''}`}
          style={{ '--ratio': ratio } as CSSProperties}
          role="img"
          aria-label={`今日进度 ${percent}%，已签到 ${done} 个，共 ${total} 个`}
        >
          <span className="ring__text">{percent}%</span>
        </div>
      </div>
    </header>
  )
}
