import { describe, expect, it } from 'vitest'

import { ANSWERS } from '../data/answers'
import { holdProgress, pickAnswer, type Random } from './answer-book'

/** 按给定序列依次返回的假随机源，用完后循环 */
function sequence(values: number[]): Random {
  let i = 0
  return () => {
    const value = values[i % values.length]
    i += 1
    return value
  }
}

const FIVE = ['a', 'b', 'c', 'd', 'e']

describe('pickAnswer', () => {
  it('没有上一条时在全部 n 条里抽', () => {
    expect(pickAnswer(FIVE, -1, () => 0)).toBe(0)
    expect(pickAnswer(FIVE, -1, () => 0.5)).toBe(2)
    expect(pickAnswer(FIVE, -1, () => 0.999)).toBe(4)
  })

  it('有上一条时跳过它：落在它及之后的整体后移一位', () => {
    // 上一条是 2，可选池是 [0, 1, 3, 4]
    expect(pickAnswer(FIVE, 2, () => 0)).toBe(0)
    expect(pickAnswer(FIVE, 2, () => 0.3)).toBe(1)
    expect(pickAnswer(FIVE, 2, () => 0.5)).toBe(3)
    expect(pickAnswer(FIVE, 2, () => 0.99)).toBe(4)
  })

  it('注入固定序列，连续抽 200 次从不连续重复', () => {
    const random = sequence([0, 0.1, 0.25, 0.25, 0.5, 0.75, 0.999, 0, 0])
    let previous = -1
    for (let i = 0; i < 200; i += 1) {
      const next = pickAnswer(FIVE, previous, random)
      expect(next).not.toBe(previous)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(FIVE.length)
      previous = next
    }
  })

  it('跳过上一条后，剩下每条都抽得到（概率均等的前提）', () => {
    const hits = new Set<number>()
    for (const value of [0, 0.25, 0.5, 0.75]) hits.add(pickAnswer(FIVE, 4, () => value))
    expect([...hits].sort()).toEqual([0, 1, 2, 3])
  })

  it('空清单返回 -1', () => {
    expect(pickAnswer([], -1, () => 0.5)).toBe(-1)
    expect(pickAnswer([], 3, () => 0.5)).toBe(-1)
  })

  it('只有一条时只能返回它', () => {
    expect(pickAnswer(['only'], 0, () => 0.7)).toBe(0)
  })

  it('越界的 previousIndex 当作没有上一条', () => {
    expect(pickAnswer(FIVE, 99, () => 0.999)).toBe(4)
    expect(pickAnswer(FIVE, Number.NaN, () => 0)).toBe(0)
  })

  it('假随机源返回 1 也不越界', () => {
    expect(pickAnswer(FIVE, -1, () => 1)).toBe(4)
    expect(pickAnswer(FIVE, 4, () => 1)).toBe(3)
  })
})

describe('holdProgress', () => {
  it('按住时长换算成 0~1 的进度', () => {
    expect(holdProgress(0)).toBe(0)
    expect(holdProgress(750, 1500)).toBe(0.5)
    expect(holdProgress(1500, 1500)).toBe(1)
    expect(holdProgress(5000, 1500)).toBe(1)
    expect(holdProgress(-10, 1500)).toBe(0)
    expect(holdProgress(Number.NaN, 1500)).toBe(0)
  })
})

describe('ANSWERS 清单', () => {
  it('数量在 150 条左右，且没有重复、没有空串', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(140)
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length)
    for (const answer of ANSWERS) expect(answer.trim()).toBe(answer)
    for (const answer of ANSWERS) expect(answer.length).toBeGreaterThan(0)
  })

  it('够短，一张卡片里放得下', () => {
    for (const answer of ANSWERS) expect([...answer].length).toBeLessThanOrEqual(24)
  })

  it('不碰健康、生死、钱、官司这类话题（娱乐工具，不能被当成建议）', () => {
    const banned = ['死', '病', '医', '药', '癌', '手术', '自杀', '钱', '投资', '股', '基金', '借贷', '贷款', '律师', '法律', '起诉', '官司', '离婚']
    const hits = ANSWERS.filter((answer) => banned.some((word) => answer.includes(word)))
    expect(hits).toEqual([])
  })
})
