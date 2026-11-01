import { describe, expect, it } from 'vitest'

import {
  MAX_COUNT,
  MAX_SIDES,
  flipCoins,
  parseCount,
  parseNames,
  pickOne,
  randomIndex,
  rollDice,
  shuffle,
  splitGroups,
} from './random-pick'

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
    // 不注入 random：走默认的 crypto 安全随机数路径
    const rolls = rollDice(100, 20)
    expect(rolls).toHaveLength(100)
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

  it('超过上限返回空数组（个数 100、面数 1000）', () => {
    expect(rollDice(MAX_COUNT, 6, () => 0)).toHaveLength(100)
    expect(rollDice(MAX_COUNT + 1, 6, () => 0)).toEqual([])
    expect(rollDice(1, MAX_SIDES + 1, () => 0)).toEqual([])
  })
})

describe('randomIndex（默认随机源：crypto + 拒绝采样）', () => {
  it('落在「凑不满 n 的尾巴」里的值被丢弃重抽', () => {
    // n = 3 时 2^32 % 3 = 1，limit = 2^32 - 1，只有最大值 2^32-1 落在尾巴里
    const draws = [2 ** 32 - 1, 7]
    let calls = 0
    const uint32 = () => draws[calls++]
    expect(randomIndex(3, undefined, uint32)).toBe(7 % 3)
    expect(calls).toBe(2)
  })

  it('不在尾巴里的值一次命中', () => {
    let calls = 0
    expect(randomIndex(3, undefined, () => { calls += 1; return 2 ** 32 - 2 })).toBe((2 ** 32 - 2) % 3)
    expect(calls).toBe(1)
  })

  it('n 是 2 的幂时没有尾巴，最大值也直接可用', () => {
    expect(randomIndex(2, undefined, () => 2 ** 32 - 1)).toBe(1)
  })

  it('真实随机源下结果始终在 [0, n)，且各值都出现过', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 600; i += 1) {
      const value = randomIndex(6)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
      seen.add(value)
    }
    expect(seen.size).toBe(6)
  })
})

describe('parseCount', () => {
  it('合法正整数', () => {
    expect(parseCount('3', '骰子个数', 1, 100)).toEqual({ ok: true, value: 3 })
    expect(parseCount(' １０ ', '骰子个数', 1, 100)).toEqual({ ok: true, value: 10 })
  })

  it('空、小数、负数、超上限都给出原因', () => {
    expect(parseCount('', '骰子个数', 1, 100)).toEqual({ ok: false, reason: '请填写骰子个数' })
    expect(parseCount('1.5', '骰子个数', 1, 100)).toEqual({ ok: false, reason: '骰子个数要填正整数' })
    expect(parseCount('-2', '骰子个数', 1, 100)).toEqual({ ok: false, reason: '骰子个数要填正整数' })
    expect(parseCount('0', '骰子个数', 1, 100)).toEqual({ ok: false, reason: '骰子个数至少是 1' })
    expect(parseCount('101', '骰子个数', 1, 100)).toEqual({ ok: false, reason: '骰子个数最多 100' })
  })
})

describe('flipCoins', () => {
  it('random < 0.5 是正，>= 0.5 是反', () => {
    expect(flipCoins(2, sequence([0.4, 0.6]))).toEqual(['正', '反'])
  })

  it('非法数量或超上限返回空数组', () => {
    expect(flipCoins(0, () => 0)).toEqual([])
    expect(flipCoins(MAX_COUNT + 1, () => 0)).toEqual([])
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

  it('除不尽时多出的人随机落到某几组，不再固定是第 1 组最大', () => {
    // 7 人分 3 组 = 3/2/2。旧的轮流发牌实现下，第 1 组每次都是 3 人
    const bigIndexCounts = [0, 0, 0]
    for (let run = 0; run < 300; run += 1) {
      const sizes = splitGroups([1, 2, 3, 4, 5, 6, 7], 3).map((group) => group.length)
      expect([...sizes].sort()).toEqual([2, 2, 3])
      bigIndexCounts[sizes.indexOf(3)] += 1
    }
    // 每组当「大组」的期望次数是 100，三组都至少出现过（全落在一组的概率约 3^-299）
    expect(bigIndexCounts.every((count) => count > 0)).toBe(true)
  })

  it('注入随机源时大组的位置由随机源决定（可复现）', () => {
    // 组序号洗牌 [0,1,2]：random 恒为 0 → 每步都和下标 0 交换 → [1,2,0]，第一个是 1
    const sizes = splitGroups([1, 2, 3, 4, 5, 6, 7], 3, () => 0).map((group) => group.length)
    expect(sizes).toEqual([2, 3, 2])
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

  it('支持分号（中英文）、Tab、Windows 换行', () => {
    expect(parseNames('张三;李四；王五\t赵六\r\n钱七')).toEqual(['张三', '李四', '王五', '赵六', '钱七'])
  })

  it('不按空格切：英文名中间的空格保留', () => {
    expect(parseNames('Tom Hanks, Emma Stone\n张 三')).toEqual(['Tom Hanks', 'Emma Stone', '张 三'])
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
