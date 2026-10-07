import { describe, expect, it } from 'vitest'

import { easeOutCubic } from './tween'

describe('easeOutCubic', () => {
  it('端点精确：0 → 0，1 → 1', () => {
    // 补间的起点和终点必须钉死，否则数字会停在差一点的位置
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('输出始终在 [0, 1] 内', () => {
    for (let i = 0; i <= 100; i++) {
      const v = easeOutCubic(i / 100)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('单调递增 —— 补间不能倒退', () => {
    // 中途倒退的缓动会让进度弧来回抖
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = easeOutCubic(i / 100)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('起步比线性快（缓出的定义）', () => {
    // 前半段时间要走完超过一半的路程
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})
