import { describe, expect, it } from 'vitest'

import type { CheckInData } from '../types'
import { DATA_VERSION, DEFAULT_PREFERENCES } from '../types'
import { buildHeatmap, groupByWeek, intensityOf, monthLabel, periodStats, summarizeDay } from './heatmap'

function makeData(records: Record<string, string[]>): CheckInData {
  return { version: DATA_VERSION, records, sites: [], todos: {}, targets: {}, preferences: { ...DEFAULT_PREFERENCES } }
}

describe('intensityOf', () => {
  it('没签到 → 0', () => {
    expect(intensityOf(0, 6)).toBe(0)
  })

  it('total 为 0 → 0（防除零）', () => {
    expect(intensityOf(3, 0)).toBe(0)
  })

  it('签满 → 4', () => {
    expect(intensityOf(6, 6)).toBe(4)
  })

  it('75% 以上 → 3', () => {
    expect(intensityOf(5, 6)).toBe(3)
  })

  it('50% 以上 → 2', () => {
    expect(intensityOf(3, 6)).toBe(2)
  })

  it('低于 50% → 1', () => {
    expect(intensityOf(1, 6)).toBe(1)
  })
})

describe('buildHeatmap', () => {
  // 2026-10-02 是周五
  const today = '2026-10-02'

  it('起始日对齐到周一', () => {
    // 只看 1 周：应包含 09-28(周一) 到 10-02(周五)，未来两天不出现
    const cells = buildHeatmap(makeData({}), today, 1)
    expect(cells.length).toBe(5) // 周一~周五
    expect(cells[0].key).toBe('2026-09-28')
    expect(cells[4].key).toBe('2026-10-02')
  })

  it('未来日期不渲染', () => {
    const cells = buildHeatmap(makeData({}), today, 1)
    expect(cells.some((c) => c.key > today)).toBe(false)
  })

  it('按记录算出每个格子的强度', () => {
    const data = makeData({ '2026-10-02': ['a', 'b', 'c', 'd', 'e', 'f'] })
    data.targets[today] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id, url: `https://${id}.com` }))
    const cells = buildHeatmap(data, today, 1)
    const todayCell = cells[cells.length - 1]
    expect(todayCell.checked).toBe(6)
    expect(todayCell.intensity).toBe(4)
  })
})

describe('daily target snapshots', () => {
  it('does not invent completion rates for legacy records', () => {
    const data = makeData({ '2026-10-02': ['a', 'a', 'b'] })
    expect(summarizeDay(data, '2026-10-02')).toEqual({ checked: 2, completed: 2, total: null })
    expect(buildHeatmap(data, '2026-10-02', 1).at(-1)?.intensity).toBe(1)
  })

  it('retains history after the live site list changes', () => {
    const data = makeData({ '2026-10-02': ['a'] })
    data.targets['2026-10-02'] = [{ id: 'a', name: 'A', url: 'https://a.com' }]
    data.sites = [{ id: 'b', name: 'B', url: 'https://b.com' }]
    expect(buildHeatmap(data, '2026-10-03', 1).find((cell) => cell.key === '2026-10-02')?.intensity).toBe(4)
  })

  it('counts only target members toward completion', () => {
    const data = makeData({ '2026-10-02': ['deleted'] })
    data.targets['2026-10-02'] = [{ id: 'a', name: 'A', url: 'https://a.com' }]
    expect(summarizeDay(data, '2026-10-02')).toEqual({ checked: 1, completed: 0, total: 1 })
    // periodStats 直接吃格子：统计范围和网格必须是同一批日期，
    // 否则「选近 7 天」会只改文字、不改网格（v5 之前就是这个样子）
    expect(periodStats(buildHeatmap(data, '2026-10-02', 1))).toEqual({ activeDays: 1, fullDays: 0, knownDays: 1, rate: 0 })
  })
})

describe('groupByWeek', () => {
  const today = '2026-10-02'

  it('每 7 个一组，最后不足 7 个也成一组', () => {
    const weeks = groupByWeek(buildHeatmap(makeData({}), today, 2))
    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toHaveLength(7) // 09-21 ~ 09-27
    expect(weeks[1].at(-1)?.key).toBe(today) // 第二周只到周五，未来两天不渲染
    expect(weeks[1]).toHaveLength(5)
  })

  it('周数变了，统计跟着走（守「统计范围只改文字不改网格」那个坑）', () => {
    const data = makeData({ '2026-09-24': ['a'] }) // 落在更早的那一周里
    const four = periodStats(buildHeatmap(data, today, 4))
    const thirteen = periodStats(buildHeatmap(data, today, 13))
    expect(four.activeDays).toBe(1)
    expect(thirteen.activeDays).toBe(1)
    // 选更短的窗口时，窗口外的日期不该再被算进去
    const one = periodStats(buildHeatmap(data, today, 1))
    expect(one.activeDays).toBe(0)
  })
})

describe('monthLabel', () => {
  const today = '2026-10-02'

  it('第一周永远显示月份，之后只在跨月那一周显示', () => {
    // today = 2026-10-02（周五），往前 6 周 → 起点 2026-08-24，所以第一周的标签是 8月
    const weeks = groupByWeek(buildHeatmap(makeData({}), today, 6))
    expect(weeks[0][0].key).toBe('2026-08-24')
    expect(monthLabel(weeks[0], 0)).toBe('8月')
    // 跨月（含 09-01）那一周显示 9月
    const september = weeks.findIndex((week) => week.some((cell) => cell.key === '2026-09-01'))
    expect(monthLabel(weeks[september], september)).toBe('9月')
    // 没跨月的普通周不显示
    const plain = weeks.findIndex((week) => !week.some((cell) => cell.key.endsWith('-01')) && week.some((cell) => cell.key === '2026-09-15'))
    expect(weekLabelAt(weeks[plain], plain)).toBe('')
  })
})

/** 只给测试用的小包装，避免上面那行断言读起来太绕 */
function weekLabelAt(week: ReturnType<typeof groupByWeek>[number], index: number): string {
  return monthLabel(week, index)
}
