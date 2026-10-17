import { describe, expect, it } from 'vitest'

import { compressionRatio, fitDimensions, formatBytes } from './image-compress'

describe('fitDimensions', () => {
  it('长边超过上限时等比缩小', () => {
    expect(fitDimensions(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitDimensions(1000, 2000, 1000)).toEqual({ width: 500, height: 1000 })
  })

  it('不放大：长边本来就 ≤ 上限时原样返回', () => {
    expect(fitDimensions(500, 300, 1000)).toEqual({ width: 500, height: 300 })
    expect(fitDimensions(1000, 1000, 1000)).toEqual({ width: 1000, height: 1000 })
  })

  it('极端比例短边至少保留 1px（避免 canvas 尺寸为 0）', () => {
    const dims = fitDimensions(5000, 1, 1000)
    expect(dims.width).toBe(1000)
    expect(dims.height).toBeGreaterThanOrEqual(1)
  })

  it('正方形等比缩放', () => {
    expect(fitDimensions(800, 800, 400)).toEqual({ width: 400, height: 400 })
  })

  it('maxEdge 非法时原样返回', () => {
    expect(fitDimensions(2000, 1000, 0)).toEqual({ width: 2000, height: 1000 })
    expect(fitDimensions(2000, 1000, -5)).toEqual({ width: 2000, height: 1000 })
    expect(fitDimensions(2000, 1000, NaN)).toEqual({ width: 2000, height: 1000 })
  })
})

describe('formatBytes', () => {
  it('小于 1KB 用 B', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('KB / MB 换算并保留一位小数', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })

  it('整数不带 .0', () => {
    expect(formatBytes(2048)).toBe('2 KB')
  })

  it('非法输入返回破折号', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(NaN)).toBe('—')
  })
})

describe('compressionRatio', () => {
  it('压缩到一半 → 省 50%', () => {
    expect(compressionRatio(1000, 500)).toBeCloseTo(0.5, 10)
  })

  it('没变 → 0', () => {
    expect(compressionRatio(1000, 1000)).toBe(0)
  })

  it('变大 → 负数', () => {
    expect(compressionRatio(1000, 1200)).toBeCloseTo(-0.2, 10)
  })

  it('原始为 0 不除零，返回 0', () => {
    expect(compressionRatio(0, 100)).toBe(0)
  })
})
