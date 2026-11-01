import { describe, expect, it } from 'vitest'

import type { Site } from '../types'
import { canReorder, filterSites, nextBatch, pendingSites } from './sites'

const NORMAL_A: Site = { id: 'a', name: 'A', url: 'https://a' }
const NORMAL_B: Site = { id: 'b', name: 'B', url: 'https://b' }
const NORMAL_C: Site = { id: 'c', name: 'C', url: 'https://c' }
const PINNED_X: Site = { id: 'x', name: 'X', url: 'https://x', pinned: true }
const PINNED_Y: Site = { id: 'y', name: 'Y', url: 'https://y', pinned: true }

const VISIBLE: Site[] = [PINNED_X, PINNED_Y, NORMAL_A, NORMAL_B, NORMAL_C]

describe('canReorder', () => {
  it('同一个 id → false（原地不是有效落点）', () => {
    expect(canReorder(VISIBLE, 'a', 'a')).toBe(false)
  })

  it('拖动的 id 不在可见列表里 → false', () => {
    expect(canReorder(VISIBLE, 'ghost', 'a')).toBe(false)
  })

  it('目标 id 不在可见列表里 → false', () => {
    expect(canReorder(VISIBLE, 'a', 'ghost')).toBe(false)
  })

  it('普通站 → 置顶站：false（不许跨置顶边界）', () => {
    expect(canReorder(VISIBLE, 'a', 'x')).toBe(false)
  })

  it('置顶站 → 普通站：false（反方向同样不许跨）', () => {
    expect(canReorder(VISIBLE, 'x', 'a')).toBe(false)
  })

  it('两个置顶站之间 → true', () => {
    expect(canReorder(VISIBLE, 'x', 'y')).toBe(true)
  })

  it('两个普通站之间 → true', () => {
    expect(canReorder(VISIBLE, 'a', 'c')).toBe(true)
  })

  it('只在筛选后的可见子集里判断：被筛掉的站不算落点', () => {
    // 模拟「只看已签到」把 c 过滤掉：可见列表里没有 c，拖到 c 应被拒
    const visible = filterSites(VISIBLE, new Set(['a', 'b']), {
      query: '',
      category: null,
      status: 'done',
      sort: 'manual',
    })
    expect(visible.map((site) => site.id)).toEqual(['a', 'b'])
    expect(canReorder(visible, 'a', 'b')).toBe(true)
    expect(canReorder(visible, 'a', 'c')).toBe(false) // c 不在可见列表里
  })
})

describe('pendingSites', () => {
  const PAUSED: Site = { id: 'p', name: 'P', url: 'https://p', paused: true }
  const ALL: Site[] = [NORMAL_A, PAUSED, NORMAL_B, PINNED_X, NORMAL_C]

  it('排除已签到和已暂停的站点', () => {
    expect(pendingSites(ALL, new Set(['b'])).map((site) => site.id)).toEqual(['x', 'a', 'c'])
  })

  it('置顶在前，其余保持存储顺序（和不筛选时的网格一致）', () => {
    expect(pendingSites(ALL, new Set()).map((site) => site.id)).toEqual(['x', 'a', 'b', 'c'])
  })

  it('已暂停的站点即使今天有记录也不打开', () => {
    expect(pendingSites([PAUSED], new Set(['p']))).toEqual([])
    expect(pendingSites([PAUSED], new Set())).toEqual([])
  })

  it('全部签完 → 空数组', () => {
    expect(pendingSites(ALL, new Set(['a', 'b', 'c', 'x']))).toEqual([])
  })

  it('不受孤儿记录影响（checked 里有已删站点的 id）', () => {
    expect(pendingSites([NORMAL_A], new Set(['ghost'])).map((site) => site.id)).toEqual(['a'])
  })
})

describe('nextBatch', () => {
  const site = (n: number): Site => ({ id: 's' + n, name: 'S' + n, url: 'https://s' + n })
  const TWELVE = Array.from({ length: 12 }, (_, i) => site(i + 1))
  const ids = (list: Site[]) => list.map((s) => s.id)

  it('第一批：按顺序取前 size 个', () => {
    expect(nextBatch(TWELVE, new Set(), 5)).toEqual({ batch: TWELVE.slice(0, 5), restart: false })
  })

  it('跳过已打开的，接着往后取', () => {
    expect(ids(nextBatch(TWELVE, new Set(ids(TWELVE.slice(0, 5))), 5).batch)).toEqual(['s6', 's7', 's8', 's9', 's10'])
  })

  it('最后一批不足 size 个时只给剩下的', () => {
    expect(ids(nextBatch(TWELVE, new Set(ids(TWELVE.slice(0, 10))), 5).batch)).toEqual(['s11', 's12'])
  })

  it('被拦截的没记进 opened → 下一次从它开始（不跳过）', () => {
    // 第一批只有 s1 真打开了，s2..s5 被拦截
    expect(ids(nextBatch(TWELVE, new Set(['s1']), 5).batch)).toEqual(['s2', 's3', 's4', 's5', 's6'])
  })

  it('全部开过一轮 → restart，从头再取', () => {
    expect(nextBatch(TWELVE, new Set(ids(TWELVE)), 5)).toEqual({ batch: TWELVE.slice(0, 5), restart: true })
  })

  it('opened 里有已签掉（不在 pending 里）的 id 不影响结果', () => {
    expect(ids(nextBatch(TWELVE.slice(2), new Set(['s1', 's2', 's3']), 5).batch)).toEqual(['s4', 's5', 's6', 's7', 's8'])
  })

  it('pending 为空 → 空批次', () => {
    expect(nextBatch([], new Set(), 5).batch).toEqual([])
  })
})
