import { describe, expect, it } from 'vitest'

import type { Site } from '../types'
import { canReorder, filterSites } from './sites'

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
