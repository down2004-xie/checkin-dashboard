import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { CheckInData, DateKey } from '../types'
import { addDays, isDateKey } from '../lib/date'
import { buildHeatmap, groupByWeek, monthLabel, periodStats, summarizeDay } from '../lib/heatmap'

interface HeatmapProps {
  data: CheckInData
  today: DateKey
}

export function Heatmap({ data, today }: HeatmapProps) {
  const [selected, setSelected] = useState<DateKey | null>(null)
  /**
   * 网格显示多少周。这个值**同时**决定格子数量和上方那行统计 ——
   * 以前是分开的（网格写死 26 周、统计另有一个 7/30 下拉框），
   * 结果是「近 7 天」只改文字、网格一格不动，两个控件互相打架。
   */
  const [weeks, setWeeks] = useState(26)
  const cells = useMemo(() => buildHeatmap(data, today, weeks), [data, today, weeks])
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const weekColumns = useMemo(() => groupByWeek(cells), [cells])
  const stats = useMemo(() => periodStats(cells), [cells])
  /**
   * 当前聚焦的格子。**必须用 state 而不是「读 refs 猜哪个格子 tabIndex=0」**：
   * ref 是在 commit 阶段才写入的，在 render 里读 `refs.current` 拿到的是上一帧的值，
   * 而且选中的日期一旦落在网格窗口之外，就永远没有格子拿到 tabIndex=0 ——
   * 方向键会静默失效。这里让「聚焦哪个格子」成为一个可推导的纯值：
   * 选中日在网格里就用它，否则退回今天。
   */
  const focusKey = cells.some((cell) => cell.key === selected) ? selected! : today
  const day = selected ?? today
  const summary = summarizeDay(data, day)
  const targets = data.targets[day]
  const checked = new Set(data.records[day] ?? [])
  const targetIds = new Set(targets?.map((site) => site.id))
  const extraIds = [...checked].filter((id) => !targetIds.has(id))
  const todos = data.todos[day] ?? []

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const delta: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
    if (!(event.key in delta) && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? cells[0].key : event.key === 'End' ? today : addDays(key, delta[event.key])
    // 落在窗口外（比如按 End 回到今天之外，或往未来走）就什么都不做，
    // 但焦点仍留在当前格子，不会「卡死」—— 因为 focusKey 有那个 today 兜底
    if (!cells.some((cell) => cell.key === next)) return
    setSelected(next)
    refs.current.get(next)?.focus()
  }

  return (
    <section className="history panel" aria-label="签到历史">
      <header className="section-head">
        <h2>签到足迹</h2>
        <select aria-label="统计范围" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>
          <option value={4}>近 4 周</option><option value={13}>近 13 周</option><option value={26}>近 26 周</option>
        </select>
      </header>
      <p className="muted">签到 {stats.activeDays} 天 · 满签 {stats.fullDays} 天 · 完成率 {stats.rate === null ? '暂无' : `${stats.rate}%`}</p>
      <p className="hint">满签与完成率仅统计有目标快照的 {stats.knownDays} 天。旧记录仅展示签到次数，不推测历史完成率。</p>
      <div className="heatmap-scroll">
        <div className="heatmap__body">
          <div className="heatmap__labels" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((label) => <span key={label} className="heatmap__weekday">{label}</span>)}</div>
          <div className="heatmap__weeks" role="group" aria-label={`近 ${weeks} 周签到日期，方向键选择日期`}>
            {weekColumns.map((week, index) => (
              <div className="heatmap-column" key={week[0].key}>
                <span className="heatmap-month" aria-hidden="true">{monthLabel(week, index)}</span>
                <div className="heatmap__week">{week.map((cell) => (
                  <button key={cell.key} type="button" className="heatmap__cell" data-intensity={cell.intensity}
                    ref={(node) => { if (node) refs.current.set(cell.key, node); else refs.current.delete(cell.key) }}
                    tabIndex={cell.key === focusKey ? 0 : -1}
                    aria-label={`${cell.key}：${cell.total === null ? `签到 ${cell.checked} 次，目标未知` : `完成 ${cell.completed}/${cell.total}`}`}
                    aria-pressed={cell.key === selected} title={`${cell.key}：签到 ${cell.checked} 次`}
                    onKeyDown={(event) => navigate(event, cell.key)} onClick={() => setSelected(cell.key)} />
                ))}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend" aria-label="颜色从浅到深表示完成率从低到高">
        <span>少</span>{[0, 1, 2, 3, 4].map((value) => <span key={value} className="heatmap__cell" data-intensity={value} />)}<span>多</span>
        <span>点击格子查看详情</span>
      </div>
      <details className="history-detail" open={selected !== null} onToggle={(event) => { if (!event.currentTarget.open) setSelected(null) }}>
        <summary>查看每日详情</summary>
        <div className="toolbar">
          <label>日期 <input type="date" aria-label="历史日期" value={day} max={today}
            onChange={(event) => { if (isDateKey(event.target.value) && event.target.value <= today) setSelected(event.target.value) }} /></label>
          <span>{summary.total === null ? `签到 ${summary.checked} 次 · 当日目标未知` : `完成 ${summary.completed}/${summary.total}`}</span>
        </div>
        <h3>签到站点</h3>
        <ul className="history-list">
          {targets?.map((site) => <li key={site.id}>{checked.has(site.id) ? '✓' : '○'} {site.name}</li>)}
          {extraIds.map((id) => <li key={id}>✓ {data.sites.find((site) => site.id === id)?.name ?? id}{targets ? '（不在当日目标中）' : ''}</li>)}
        </ul>
        {!targets?.length && !checked.size && <p className="muted">这天没有签到记录</p>}
        <h3>当日待办</h3>
        {todos.length ? <ul className="history-list">{todos.map((todo) => <li key={todo.id}>{todo.done ? '✓' : '○'} {todo.text}</li>)}</ul> : <p className="muted">这天没有待办</p>}
      </details>
    </section>
  )
}
