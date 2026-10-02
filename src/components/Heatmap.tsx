import { useMemo } from 'react'

import type { CheckInData, DateKey } from '../types'
import { buildHeatmap } from '../lib/heatmap'

interface HeatmapProps {
  data: CheckInData
  today: DateKey
  /** 当前站点总数，用于算强度 */
  total: number
}

/** 周一~周日，按周对齐 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/**
 * 历史签到热力图（GitHub 贡献图风格）。
 *
 * 布局：左侧一列周几标签，右侧每个「周」是一列 7 个格子。
 * buildHeatmap 返回从某个周一开始的一维格子，这里按 7 个一组切成列。
 * 未来日期（今天之后）补成透明占位，保证「今天」在最后一列。
 */
export function Heatmap({ data, today, total }: HeatmapProps) {
  const cells = useMemo(() => buildHeatmap(data, today, total), [data, today, total])

  // 把一维格子切成周（每 7 个一列），未来格子用 null 占位
  const weeks = useMemo(() => {
    if (cells.length === 0) return []
    const result: ((typeof cells)[number] | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      const week: ((typeof cells)[number] | null)[] = cells.slice(i, i + 7)
      while (week.length < 7) week.push(null) // 补足最后一列
      result.push(week)
    }
    return result
  }, [cells])

  if (cells.length === 0) return null

  return (
    <section className="heatmap" aria-label="近 26 周签到热力图">
      <div className="heatmap__body">
        {/* 左列：周几标签 */}
        <div className="heatmap__labels" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="heatmap__weekday">
              {label}
            </span>
          ))}
        </div>

        {/* 右区：每列一周 */}
        <div
          className="heatmap__weeks"
          role="img"
          aria-label="每个格子代表一天，颜色越深当天签到越完整"
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap__week">
              {week.map((cell, di) =>
                cell === null ? (
                  <span key={di} className="heatmap__cell heatmap__cell--empty" />
                ) : (
                  <span
                    key={cell.key}
                    className="heatmap__cell"
                    data-intensity={cell.intensity}
                    title={`${cell.key}：签到 ${cell.checked}/${total}`}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
