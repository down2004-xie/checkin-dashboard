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
 */
export function buildHeatmap(
  data: CheckInData,
  today: DateKey,
  total: number,
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

    const checked = data.records[key]?.length ?? 0
    cells.push({ key, checked, intensity: intensityOf(checked, total) })
  }

  return cells
}
