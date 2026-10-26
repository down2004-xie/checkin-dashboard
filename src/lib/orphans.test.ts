import { describe, expect, it } from 'vitest'

import type { CheckInData, Site } from '../types'
import { DATA_VERSION, DEFAULT_PREFERENCES } from '../types'
import { findOrphans, removeOrphans } from './orphans'

const SITE_A: Site = { id: 'a', name: 'A', url: 'https://a.com' }
const SITE_B: Site = { id: 'b', name: 'B', url: 'https://b.com' }
const PAUSED: Site = { id: 'paused', name: 'Paused', url: 'https://p.com', paused: true }

function makeData(records: Record<string, string[]>, sites: Site[] = [SITE_A, SITE_B, PAUSED]): CheckInData {
  return {
    version: DATA_VERSION,
    sites,
    records,
    todos: {},
    targets: {},
    preferences: { ...DEFAULT_PREFERENCES },
  }
}

describe('findOrphans', () => {
  it('没有孤儿时返回空摘要', () => {
    const data = makeData({ '2026-10-01': ['a'], '2026-10-02': ['b'] })
    expect(findOrphans(data)).toEqual({ siteIds: [], dayCount: 0, entryCount: 0 })
  })

  it('暂停的站点仍然存在，不算孤儿', () => {
    const data = makeData({ '2026-10-01': ['a', 'paused'] })
    expect(findOrphans(data)).toEqual({ siteIds: [], dayCount: 0, entryCount: 0 })
  })

  it('统计孤儿 id、涉及天数和条目总数', () => {
    const data = makeData({
      '2026-10-01': ['a', 'gone-com'],
      '2026-10-02': ['gone-com', 'also-gone'],
      '2026-10-03': ['b'],
    })
    expect(findOrphans(data)).toEqual({
      siteIds: ['also-gone', 'gone-com'],
      dayCount: 2,
      entryCount: 3,
    })
  })

  it('同一天里同一个 id 只算一条（防重复计数）', () => {
    // sanitizeRecords 会去重，这里直接构造脏数据守边界：
    // 否则一份重复数组会让「共 N 条」翻倍，用户看到的数字是假的
    const data = makeData({ '2026-10-01': ['gone', 'gone', 'gone'] })
    expect(findOrphans(data).entryCount).toBe(1)
    expect(findOrphans(data).dayCount).toBe(1)
  })

  it('站点列表为空时，所有记录都是孤儿', () => {
    const data = makeData({ '2026-10-01': ['a', 'b'] }, [])
    expect(findOrphans(data)).toEqual({ siteIds: ['a', 'b'], dayCount: 1, entryCount: 2 })
  })
})

describe('removeOrphans', () => {
  it('只删孤儿 id，保留有效 id 和天的 key', () => {
    const data = makeData({
      '2026-10-01': ['a', 'gone-com'],
      '2026-10-02': ['gone-com', 'b'],
    })
    expect(removeOrphans(data).records).toEqual({
      '2026-10-01': ['a'],
      '2026-10-02': ['b'],
    })
  })

  it('某天被清空后整个 key 消失，和取消勾选的处理一致', () => {
    const data = makeData({
      '2026-10-01': ['gone-com'],
      '2026-10-02': ['a'],
    })
    expect(removeOrphans(data).records).toEqual({ '2026-10-02': ['a'] })
  })

  it('没有孤儿时返回原对象（引用不变，React 不会白重渲染）', () => {
    const data = makeData({ '2026-10-01': ['a', 'paused'] })
    expect(removeOrphans(data)).toBe(data)
  })

  it('不碰 targets / sites / todos / preferences', () => {
    const data = makeData({ '2026-10-01': ['gone-com'] })
    data.targets['2026-10-01'] = [SITE_A]
    const next = removeOrphans(data)
    expect(next.targets).toBe(data.targets)
    expect(next.sites).toBe(data.sites)
    expect(next.todos).toBe(data.todos)
    expect(next.preferences).toBe(data.preferences)
  })

  it('清完之后再调用一次返回同一个对象（幂等）', () => {
    const once = removeOrphans(makeData({ '2026-10-01': ['a', 'gone-com'] }))
    expect(removeOrphans(once)).toBe(once)
  })
})
