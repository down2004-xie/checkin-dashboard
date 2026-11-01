import { describe, expect, it } from 'vitest'

import { DESKTOP_LIMIT, SAFE_LIMIT, exceedsLimit, fitWithin, planCanvas } from './canvas-limits'

describe('exceedsLimit', () => {
  it('flags a single side over the limit', () => {
    // 20 张 1080×2400 截图纵向拼接的真实尺寸
    expect(exceedsLimit({ width: 1080, height: 48000 }, DESKTOP_LIMIT)).toBe(true)
  })

  it('flags area over the limit even when both sides fit', () => {
    expect(exceedsLimit({ width: 5000, height: 5000 }, SAFE_LIMIT)).toBe(true)
  })

  it('accepts a normal photo on desktop', () => {
    expect(exceedsLimit({ width: 4032, height: 3024 }, DESKTOP_LIMIT)).toBe(false)
  })
})

describe('fitWithin', () => {
  it('leaves sizes within the limit unchanged', () => {
    expect(fitWithin({ width: 800, height: 600 }, SAFE_LIMIT)).toEqual({ width: 800, height: 600 })
  })

  it('scales down by the side limit, keeping aspect ratio', () => {
    const size = fitWithin({ width: 1080, height: 48000 }, DESKTOP_LIMIT)
    expect(size.height).toBeLessThanOrEqual(32767)
    expect(size.width / size.height).toBeCloseTo(1080 / 48000, 3)
    expect(exceedsLimit(size, DESKTOP_LIMIT)).toBe(false)
  })

  it('scales down by the area limit and never lands one pixel over', () => {
    const size = fitWithin({ width: 6000, height: 4000 }, SAFE_LIMIT)
    expect(size.width * size.height).toBeLessThanOrEqual(SAFE_LIMIT.maxArea)
    expect(size.width / size.height).toBeCloseTo(1.5, 2)
  })

  it('returns 0×0 for degenerate input instead of NaN', () => {
    expect(fitWithin({ width: 0, height: 100 }, SAFE_LIMIT)).toEqual({ width: 0, height: 0 })
  })
})

describe('planCanvas', () => {
  it('uses the desktop size when the probe passes', () => {
    expect(planCanvas({ width: 1000, height: 40000 }, () => true)?.size.height).toBeLessThanOrEqual(32767)
  })

  it('falls back to the safe limit when the desktop size fails', () => {
    const probe = (size: { width: number; height: number }) => size.width * size.height <= SAFE_LIMIT.maxArea
    const plan = planCanvas({ width: 8000, height: 6000 }, probe)
    expect(plan).not.toBeNull()
    expect(plan!.size.width * plan!.size.height).toBeLessThanOrEqual(SAFE_LIMIT.maxArea)
    expect(plan!.scale).toBeLessThan(1)
  })

  it('reports scale 1 when nothing was shrunk', () => {
    expect(planCanvas({ width: 100, height: 100 }, () => true)?.scale).toBe(1)
  })

  it('returns null when both tiers fail', () => {
    expect(planCanvas({ width: 100, height: 100 }, () => false)).toBeNull()
  })
})
