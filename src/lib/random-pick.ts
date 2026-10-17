/* 随机抽签 —— 纯函数，可单测。
 *
 * 关键设计：所有随机函数都接受一个 `random: () => number` 参数（默认 Math.random）。
 * 为什么不用直接用 Math.random：这样测试可以注入「固定序列」的假随机源，
 * 让洗牌/掷骰的结果可复现、可断言。组件里传默认值即可，生产行为不变。
 * 这和 sakura.ts「固定种子保证确定性」是同一个动机，只是这里把随机源外置了。
 */

/** 随机源类型：返回 [0, 1) 的数 */
export type Random = () => number

const defaultRandom: Random = () => Math.random()

/**
 * 掷骰子。sides 是面数（默认 6），count 是骰子个数（默认 1）。
 * 返回每个骰子的点数（1..sides 的整数）。参数非法时返回空数组。
 */
export function rollDice(count = 1, sides = 6, random: Random = defaultRandom): number[] {
  if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || sides < 2) return []
  const results: number[] = []
  for (let i = 0; i < count; i += 1) {
    results.push(1 + Math.floor(random() * sides))
  }
  return results
}

/**
 * 抛硬币。count 枚，返回 '正' / '反'。
 * 用 random() < 0.5 判正，边界清晰、好测。
 */
export function flipCoins(count = 1, random: Random = defaultRandom): ('正' | '反')[] {
  if (!Number.isInteger(count) || count < 1) return []
  const results: ('正' | '反')[] = []
  for (let i = 0; i < count; i += 1) {
    results.push(random() < 0.5 ? '正' : '反')
  }
  return results
}

/**
 * 从列表里随机抽一个。空列表返回 null。
 * 返回的是元素本身（不是索引），调用方不用再回查。
 */
export function pickOne<T>(items: readonly T[], random: Random = defaultRandom): T | null {
  if (items.length === 0) return null
  return items[Math.floor(random() * items.length)] ?? null
}

/**
 * Fisher-Yates 洗牌，返回**新数组**，不改原数组。
 *
 * 为什么用 Fisher-Yates 而不是 `sort(() => random() - 0.5)`：
 * 后者是错的 —— 比较函数不满足传递性，各浏览器实现下分布都不均匀，
 * 而且结果高度依赖引擎的排序算法。Fisher-Yates 是唯一正确的等概率洗牌。
 */
export function shuffle<T>(items: readonly T[], random: Random = defaultRandom): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * 把名单随机分成 groups 组，尽量均分。
 * 先洗牌，再轮流发牌（round-robin）——比「按块切」更均匀：
 * 按块切时最后一块可能只剩 1 个人，轮流发牌能把人数摊平到 ±1。
 * groups < 1 或名单为空时返回空数组。
 */
export function splitGroups<T>(items: readonly T[], groups: number, random: Random = defaultRandom): T[][] {
  if (items.length === 0 || !Number.isInteger(groups) || groups < 1) return []
  const count = Math.min(groups, items.length)
  const buckets: T[][] = Array.from({ length: count }, () => [])
  shuffle(items, random).forEach((item, index) => {
    buckets[index % count].push(item)
  })
  return buckets
}

/**
 * 解析用户输入的名单：按换行或逗号切分，去空白、丢空行、去重。
 * 去重是刻意的 —— 同一个名字出现两次，抽签/分组会把它当两个人，
 * 结果里出现两个「张三」很困惑。保留首次出现顺序。
 */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(/[\n,，、]/)) {
    const name = raw.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}
