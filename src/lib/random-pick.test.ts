import { describe, expect, it } from 'vitest'

import { flipCoins, parseNames, pickOne, rollDice, shuffle, splitGroups } from './random-pick'

// 注入固定序列的假随机源：每次调用依次吐出数组里的值，用完循环。
// 这让「洗牌/掷骰」的结果完全可复现，才能写出确定性的断言。
function sequence(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('rollDice', () => {
  it('random 恒为 0 → 每个骰子都是 1 点', () => {
    expect(rollDice(3, 6, () => 0)).toEqual([1, 1, 1])
  })

  it('random 趋近 1 → 取到最大面', () => {
    expect(rollDice(2, 6, () => 0.999)).toEqual([6, 6])
  })

  it('点数永远落在 1..sides 之间', () => {
    const rolls = rollDice(200, 20, () => Math.random())
    for (const roll of rolls) {
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
      expect(Number.isInteger(roll)).toBe(true)
    }
  })

  it('参数非法返回空数组', () => {
    expect(rollDice(0, 6, () => 0)).toEqual([])
    expect(rollDice(1, 1, () => 0)).toEqual([])
    expect(rollDice(1.5, 6, () => 0)).toEqual([])
  })
})

describe('flipCoins', () => {
  it('random < 0.5 是正，>= 0.5 是反', () => {
    expect(flipCoins(2, sequence([0.4, 0.6]))).toEqual(['正', '反'])
  })

  it('非法数量返回空数组', () => {
    expect(flipCoins(0, () => 0)).toEqual([])
  })
})

describe('pickOne', () => {
  it('按 random 命中的索引取元素', () => {
    expect(pickOne(['a', 'b', 'c'], () => 0)).toBe('a')
    expect(pickOne(['a', 'b', 'c'], () => 0.5)).toBe('b')
    expect(pickOne(['a', 'b', 'c'], () => 0.99)).toBe('c')
  })

  it('空列表返回 null', () => {
    expect(pickOne([], () => 0)).toBeNull()
  })
})

describe('shuffle', () => {
  it('返回的是原数组的一个排列（元素不增不减）', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffle(input, () => Math.random())
    expect([...output].sort((a, b) => a - b)).toEqual(input)
  })

  it('不改动原数组', () => {
    const input = [1, 2, 3]
    shuffle(input, () => Math.random())
    expect(input).toEqual([1, 2, 3])
  })

  it('相同随机序列得到相同结果（可复现）', () => {
    const a = shuffle([1, 2, 3, 4, 5], sequence([0.1, 0.9, 0.4, 0.7]))
    const b = shuffle([1, 2, 3, 4, 5], sequence([0.1, 0.9, 0.4, 0.7]))
    expect(a).toEqual(b)
  })
})

describe('splitGroups', () => {
  it('分成 2 组，人数差不超过 1', () => {
    const groups = splitGroups([1, 2, 3, 4, 5], 2, () => Math.random())
    const sizes = groups.map((group) => group.length).sort((a, b) => a - b)
    expect(sizes[1] - sizes[0]).toBeLessThanOrEqual(1)
  })

  it('所有人都在结果里，没有遗漏或重复', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const groups = splitGroups(input, 3, () => Math.random())
    const flat = groups.flat().sort()
    expect(flat).toEqual([...input].sort())
  })

  it('组数超过人数时，组数被压到人数（不产生空组）', () => {
    const groups = splitGroups([1, 2], 5, () => Math.random())
    expect(groups.length).toBe(2)
    expect(groups.every((group) => group.length === 1)).toBe(true)
  })

  it('空名单或非法组数返回空数组', () => {
    expect(splitGroups([], 3, () => 0)).toEqual([])
    expect(splitGroups([1, 2], 0, () => 0)).toEqual([])
  })
})

describe('parseNames', () => {
  it('按换行、逗号、中文逗号、顿号切分', () => {
    expect(parseNames('张三\n李四,王五，赵六、钱七')).toEqual(['张三', '李四', '王五', '赵六', '钱七'])
  })

  it('去掉空白和空行', () => {
    expect(parseNames('  张三 \n\n  李四  ')).toEqual(['张三', '李四'])
  })

  it('去重且保留首次出现顺序', () => {
    expect(parseNames('张三\n李四\n张三')).toEqual(['张三', '李四'])
  })

  it('全空白返回空数组', () => {
    expect(parseNames('   \n  ')).toEqual([])
  })
})
