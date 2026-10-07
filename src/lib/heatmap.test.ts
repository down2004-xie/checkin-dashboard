import { describe, expect, it } from 'vitest'

import type { CheckInData } from '../types'
import { DATA_VERSION } from '../types'
import { buildHeatmap, intensityOf } from './heatmap'

function makeData(records: Record<string, string[]>): CheckInData {
  return { version: DATA_VERSION, records, sites: [], todos: {} }
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
    const cells = buildHeatmap(makeData({}), today, 6, 1)
    expect(cells.length).toBe(5) // 周一~周五
    expect(cells[0].key).toBe('2026-09-28')
    expect(cells[4].key).toBe('2026-10-02')
  })

  it('未来日期不渲染', () => {
    const cells = buildHeatmap(makeData({}), today, 6, 1)
    expect(cells.some((c) => c.key > today)).toBe(false)
  })

  it('按记录算出每个格子的强度', () => {
    const data = makeData({ '2026-10-02': ['a', 'b', 'c', 'd', 'e', 'f'] })
    const cells = buildHeatmap(data, today, 6, 1)
    const todayCell = cells[cells.length - 1]
    expect(todayCell.checked).toBe(6)
    expect(todayCell.intensity).toBe(4)
  })
})
