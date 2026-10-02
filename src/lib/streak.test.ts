import { describe, expect, it } from 'vitest'

import type { CheckInData } from '../types'
import { DATA_VERSION } from '../types'
import {
  calcLongestStreak,
  calcStreak,
  countChecked,
  countCheckedValid,
  hasCheckedIn,
} from './streak'

/** 造测试数据的小工具：传日期列表，生成对应的 records */
function makeData(days: Record<string, string[]>): CheckInData {
  return { version: DATA_VERSION, records: days, sites: [] }
}

describe('hasCheckedIn', () => {
  it('有记录返回 true', () => {
    expect(hasCheckedIn(makeData({ '2026-10-02': ['a'] }), '2026-10-02')).toBe(true)
  })

  it('无记录返回 false', () => {
    expect(hasCheckedIn(makeData({}), '2026-10-02')).toBe(false)
  })

  it('空数组算没签到', () => {
    expect(hasCheckedIn(makeData({ '2026-10-02': [] }), '2026-10-02')).toBe(false)
  })
})

describe('countChecked', () => {
  it('统计当天已签数量', () => {
    expect(countChecked(makeData({ '2026-10-02': ['a', 'b', 'c'] }), '2026-10-02')).toBe(3)
  })

  it('没有记录时返回 0', () => {
    expect(countChecked(makeData({}), '2026-10-02')).toBe(0)
  })
})

describe('countCheckedValid', () => {
  it('只统计仍在 validIds 内的站点', () => {
    const data = makeData({ '2026-10-02': ['a', 'b', 'c'] })
    expect(countCheckedValid(data, '2026-10-02', new Set(['a', 'b']))).toBe(2)
  })

  it('孤儿记录（已删站点）不计入', () => {
    // 场景：今天签了 a，然后把 a 删了。进度不应再把 a 算进去
    const data = makeData({ '2026-10-02': ['a'] })
    expect(countCheckedValid(data, '2026-10-02', new Set())).toBe(0)
  })

  it('没有记录时返回 0', () => {
    expect(countCheckedValid(makeData({}), '2026-10-02', new Set(['a']))).toBe(0)
  })
})

describe('calcStreak', () => {
  const today = '2026-10-02'

  it('完全没有记录时为 0', () => {
    expect(calcStreak(makeData({}), today)).toBe(0)
  })

  it('只有今天签了 → 1', () => {
    expect(calcStreak(makeData({ '2026-10-02': ['a'] }), today)).toBe(1)
  })

  it('今天和昨天都签了 → 2', () => {
    const data = makeData({ '2026-10-02': ['a'], '2026-10-01': ['a'] })
    expect(calcStreak(data, today)).toBe(2)
  })

  it('连续 5 天 → 5', () => {
    const data = makeData({
      '2026-10-02': ['a'],
      '2026-10-01': ['a'],
      '2026-09-30': ['a'],
      '2026-09-29': ['a'],
      '2026-09-28': ['a'],
    })
    expect(calcStreak(data, today)).toBe(5)
  })

  it('中间断了一天 → 只数到断点', () => {
    const data = makeData({
      '2026-10-02': ['a'],
      '2026-10-01': ['a'],
      // 09-30 缺失
      '2026-09-29': ['a'],
      '2026-09-28': ['a'],
    })
    expect(calcStreak(data, today)).toBe(2)
  })

  it('今天还没签，但昨天签了 → 不算断，返回昨天的连续数', () => {
    // 这是刻意的设计：早上打开页面不该看到「连续 0 天」
    const data = makeData({
      '2026-10-01': ['a'],
      '2026-09-30': ['a'],
      '2026-09-29': ['a'],
    })
    expect(calcStreak(data, today)).toBe(3)
  })

  it('今天和昨天都没签 → 0', () => {
    const data = makeData({ '2026-09-30': ['a'], '2026-09-29': ['a'] })
    expect(calcStreak(data, today)).toBe(0)
  })

  it('跨月连续正确', () => {
    const data = makeData({
      '2026-10-02': ['a'],
      '2026-10-01': ['a'],
      '2026-09-30': ['a'],
      '2026-09-29': ['a'],
    })
    expect(calcStreak(data, today)).toBe(4)
  })

  it('跨年连续正确', () => {
    const data = makeData({
      '2026-01-01': ['a'],
      '2025-12-31': ['a'],
      '2025-12-30': ['a'],
    })
    expect(calcStreak(data, '2026-01-01')).toBe(3)
  })
})

describe('calcLongestStreak', () => {
  it('没有记录 → 0', () => {
    expect(calcLongestStreak(makeData({}))).toBe(0)
  })

  it('单天 → 1', () => {
    expect(calcLongestStreak(makeData({ '2026-10-02': ['a'] }))).toBe(1)
  })

  it('返回历史最长而不是当前连续', () => {
    const data = makeData({
      // 一段 4 天的历史
      '2026-09-01': ['a'],
      '2026-09-02': ['a'],
      '2026-09-03': ['a'],
      '2026-09-04': ['a'],
      // 断掉后只有 2 天
      '2026-10-01': ['a'],
      '2026-10-02': ['a'],
    })
    expect(calcLongestStreak(data)).toBe(4)
  })

  it('乱序插入也能算对', () => {
    const data = makeData({
      '2026-09-03': ['a'],
      '2026-09-01': ['a'],
      '2026-09-02': ['a'],
    })
    expect(calcLongestStreak(data)).toBe(3)
  })

  it('跨月连续算作一段', () => {
    const data = makeData({
      '2026-09-29': ['a'],
      '2026-09-30': ['a'],
      '2026-10-01': ['a'],
    })
    expect(calcLongestStreak(data)).toBe(3)
  })

  it('空数组的日子不计入', () => {
    const data = makeData({
      '2026-09-01': ['a'],
      '2026-09-02': [],
      '2026-09-03': ['a'],
    })
    expect(calcLongestStreak(data)).toBe(1)
  })
})
