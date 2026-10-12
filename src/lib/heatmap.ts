import type { CheckInData, DateKey } from '../types'
import { addDays, parseDateKey } from './date'

/**
 * 历史签到热力图（GitHub 贡献图风格）的纯逻辑。
 *
 * 输出一个「周 × 7 天」的二维网格，每个格子带 0~4 的强度值，
 * 组件拿到后只负责渲染，颜色深浅的计算全在这里，可单测。
 */

/** 一个格子的强度，0 = 没签到，4 = 全签满 */
export type Intensity = 0 | 1 | 2 | 3 | 4

/** 一个热力图格子 */
export interface HeatmapCell {
  /** 这一天的日期 key */
  key: DateKey
  /** 0~4，颜色深浅 */
  intensity: Intensity
  /** 当天已签站点数（hover 提示用） */
  checked: number
  total: number | null
  completed: number
}

/**
 * 由「当天签到数 / 站点总数」的比例算出强度 0~4。
 *
 * 为什么用比例而不是绝对数量：
 * 站点总数会变（用户增删站点）。用绝对数的话，加了几个站点后
 * 历史格子的颜色会突然变深，观感不稳定。比例相对稳健。
 * 代价：删掉站点会让历史格子变深。要彻底解决得在记录里存「当天的站点总数」，
 * 那是以后结构升级（v3）的事，现在用比例。
 */
export function intensityOf(checked: number, total: number): Intensity {
  if (checked <= 0 || total <= 0) return 0
  const ratio = checked / total
  if (ratio >= 1) return 4
  if (ratio >= 0.75) return 3
  if (ratio >= 0.5) return 2
  return 1
}

/**
 * 生成从今天往前 N 周的格子，按「周一为每周第一天」对齐。
 *
 * 返回一维数组，顺序从旧到新。组件拿到后按 7 天一组切成列渲染。
 *
 * 为什么没有「站点总数」参数（v5 之前有过，现已删除）：
 * 强度以前按「当天已签数 / **当前**站点总数」算，于是今天加一个站，
 * 所有历史格子会一起变浅。v5 引入 targets 快照后，`summarizeDay` 直接
 * 读当天的目标，这个参数就没人用了。当时它被改名成 `_total` 占着位置，
 * 调用处还传着 `0` —— 一个签名里说不清用途、又不生效的参数，
 * 下一个人只会照着它写错。**不再生效的参数要删掉，不要留着当装饰。**
 */
export function buildHeatmap(
  data: CheckInData,
  today: DateKey,
  weeks = 26,
): HeatmapCell[] {
  // 算出起始日：今天所在周的周一，再往前 weeks-1 周
  const todayDate = parseDateKey(today)
  const dayOfWeek = (todayDate.getDay() + 6) % 7 // 周一=0 … 周日=6
  const start = addDays(today, -(dayOfWeek + (weeks - 1) * 7))

  const days = weeks * 7
  const cells: HeatmapCell[] = []

  for (let i = 0; i < days; i++) {
    const key = addDays(start, i)
    if (key > today) break // 未来的日期不渲染

    const summary = summarizeDay(data, key)
    cells.push({ key, ...summary, intensity: summary.total === null ? (summary.checked > 0 ? 1 : 0) : intensityOf(summary.completed, summary.total) })
  }

  return cells
}

export function summarizeDay(data: CheckInData, day: DateKey): Pick<HeatmapCell, 'checked' | 'total' | 'completed'> {  const checkedIds = new Set(data.records[day] ?? [])
  const targets = data.targets[day]
  return {
    checked: checkedIds.size,
    total: targets === undefined ? null : targets.length,
    completed: targets === undefined ? checkedIds.size : targets.filter((site) => checkedIds.has(site.id)).length,
  }
}

/** 把一维格子按 7 天一组切成「周」，供组件按列渲染 */
export function groupByWeek(cells: readonly HeatmapCell[]): HeatmapCell[][] {
  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7))
}

/**
 * 这一表头位置该显示什么月份标签。
 *
 * 规则：第一周永远显示，之后只在**这周跨过一个月的 1 号**时显示。
 * 只扫一遍 week（原实现先 `some` 再 `find`，把同一周扫了两次）。
 * 注意取的是 `slice(5, 7)` 再 `Number` —— 这样 `2026-10-01` 得 10，
 * `2026-01-03` 得 1，不用去管前导零。
 */
export function monthLabel(week: readonly HeatmapCell[], index: number): string {
  const first = week.find((cell) => cell.key.endsWith('-01'))
  if (first === undefined) return index === 0 ? `${Number(week[0].key.slice(5, 7))}月` : ''
  return `${Number(first.key.slice(5, 7))}月`
}

export function periodStats(cells: readonly HeatmapCell[]) {
  let activeDays = 0
  let fullDays = 0
  let checked = 0
  let expected = 0
  let knownDays = 0

  for (const cell of cells) {
    if (cell.checked > 0) activeDays++
    if (cell.total !== null) {
      knownDays++
      checked += cell.completed
      expected += cell.total
      if (cell.total > 0 && cell.completed === cell.total) fullDays++
    }
  }
  return { activeDays, fullDays, knownDays, rate: expected ? Math.round(checked / expected * 100) : null }
}
