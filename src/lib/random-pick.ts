/* 随机抽签 —— 纯函数，可单测。
 *
 * 随机源：所有随机函数都接受一个可选的 `random: () => number` 参数（返回 [0, 1)）。
 * - 生产环境**不传**，走 `crypto.getRandomValues` + 拒绝采样（见 randomIndex）。
 * - 测试注入「固定序列」的假随机源，让洗牌/掷骰的结果可复现、可断言。
 *
 * 为什么默认不用 Math.random：抽签、分组的结果涉及公平性（谁值日、谁先发言、谁分到哪组）。
 * Math.random 是普通伪随机数生成器，规范不保证质量，内部状态可以从输出反推、预测后续结果；
 * crypto.getRandomValues 是密码学安全随机数，不可预测。「用的是浏览器的安全随机数」
 * 也是用户被抽中时能接受结果的理由。
 *
 * 为什么要拒绝采样：32 位随机整数有 2^32 种取值，直接 `% n` 时，除非 n 是 2 的幂，
 * 总有一部分余数多出现一次（偏差很小，但不为零）。把落在「最后一段凑不满 n 的尾巴」
 * 里的值丢掉重抽，剩下的取值数恰好是 n 的整数倍，每个结果的概率严格相等。
 */

/** 随机源类型：返回 [0, 1) 的数 */
export type Random = () => number

const UINT32_RANGE = 2 ** 32

/** 一次取一个 32 位无符号随机整数（密码学安全） */
function randomUint32(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0]
}

/**
 * 均匀地取 [0, n) 的整数。
 * random 有注入时用 floor(random() * n)（测试要的是可预测，不是安全）；
 * 没有注入时用安全随机数 + 拒绝采样。uint32 是注入点，供单测验证「尾巴里的值会被丢弃」。
 */
export function randomIndex(n: number, random?: Random, uint32: () => number = randomUint32): number {
  if (random) return Math.floor(random() * n)
  // 小于 limit 的取值共 limit 个，limit 是 n 的整数倍，取模后每个余数出现次数相同
  const limit = UINT32_RANGE - (UINT32_RANGE % n)
  for (;;) {
    const value = uint32()
    if (value < limit) return value % n
  }
}

/** 骰子、硬币个数上限：再多界面摆不下，也没有实际用途 */
export const MAX_COUNT = 100
/** 骰子面数上限：常见桌游骰最多 100 面（D100），留一点余量 */
export const MAX_SIDES = 1000
/** 分组数上限 */
export const MAX_GROUPS = 100

export type ParsedCount = { ok: true; value: number } | { ok: false; reason: string }

/**
 * 解析「个数 / 面数 / 组数」这类输入框，失败时给出原因。
 * 以前非法输入（0、1.5、空、200）时按钮点了静默无反应，用户不知道哪里错了。
 * 全角数字先 NFKC 归一（中文输入法下常见）。
 */
export function parseCount(raw: string, name: string, min: number, max: number): ParsedCount {
  const text = raw.normalize('NFKC').trim()
  if (text === '') return { ok: false, reason: `请填写${name}` }
  if (!/^\d+$/.test(text)) return { ok: false, reason: `${name}要填正整数` }
  const value = Number(text)
  if (value < min) return { ok: false, reason: `${name}至少是 ${min}` }
  if (value > max) return { ok: false, reason: `${name}最多 ${max}` }
  return { ok: true, value }
}

/**
 * 掷骰子。sides 是面数（默认 6），count 是骰子个数（默认 1）。
 * 返回每个骰子的点数（1..sides 的整数）。参数非法或超上限时返回空数组。
 */
export function rollDice(count = 1, sides = 6, random?: Random): number[] {
  if (!Number.isInteger(count) || !Number.isInteger(sides)) return []
  if (count < 1 || count > MAX_COUNT || sides < 2 || sides > MAX_SIDES) return []
  return Array.from({ length: count }, () => 1 + randomIndex(sides, random))
}

/** 抛硬币。count 枚，返回 '正' / '反'。参数非法或超上限时返回空数组 */
export function flipCoins(count = 1, random?: Random): ('正' | '反')[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return []
  return Array.from({ length: count }, () => (randomIndex(2, random) === 0 ? '正' : '反'))
}

/**
 * 从列表里随机抽一个。空列表返回 null。
 * 返回的是元素本身（不是索引），调用方不用再回查。
 */
export function pickOne<T>(items: readonly T[], random?: Random): T | null {
  if (items.length === 0) return null
  return items[randomIndex(items.length, random)] ?? null
}

/**
 * Fisher-Yates 洗牌，返回**新数组**，不改原数组。
 *
 * 为什么用 Fisher-Yates 而不是 `sort(() => random() - 0.5)`：
 * 后者是错的 —— 比较函数不满足传递性，各浏览器实现下分布都不均匀，
 * 而且结果高度依赖引擎的排序算法。Fisher-Yates 是唯一正确的等概率洗牌。
 */
export function shuffle<T>(items: readonly T[], random?: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, random)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
/**
 * 把名单随机分成 groups 组，尽量均分（各组人数差不超过 1）。
 *
 * 做法：先洗牌，再按「每组人数」顺序切块。每组人数 = floor(n / 组数)，
 * 除不尽的余数人**随机挑几组**各多分 1 人。
 * 以前用轮流发牌（第 i 人进第 i % 组数 组），余数人永远落在第 1、2… 组，
 * 7 人分 3 组时第 1 组每次都是 3 人 —— 人是随机的，但「哪组人多」是固定的，
 * 如果多一人意味着多干活或多一票，这就不公平。
 *
 * 组数超过人数时压到人数（不产生空组）。groups < 1 或名单为空时返回空数组。
 */
export function splitGroups<T>(items: readonly T[], groups: number, random?: Random): T[][] {
  if (items.length === 0 || !Number.isInteger(groups) || groups < 1) return []
  const count = Math.min(groups, items.length)
  const base = Math.floor(items.length / count)
  const extra = items.length % count
  // 随机挑出拿「多 1 人」的那几组
  const biggerGroups = new Set(shuffle(Array.from({ length: count }, (_, index) => index), random).slice(0, extra))
  const shuffled = shuffle(items, random)
  const buckets: T[][] = []
  let start = 0
  for (let index = 0; index < count; index += 1) {
    const size = base + (biggerGroups.has(index) ? 1 : 0)
    buckets.push(shuffled.slice(start, start + size))
    start += size
  }
  return buckets
}

/**
 * 名单分隔符：换行（含 Windows 的 \r）、中英文逗号、顿号、中英文分号、Tab。
 * **刻意不按空格切**：英文名「Tom Hanks」中间有空格，按空格切会变成两个人。
 * Tab 要切，是因为从 Excel 复制一行名字粘贴进来，单元格之间就是 Tab。
 */
const NAME_SEPARATORS = /[\r\n,，、;；\t]/

/**
 * 解析用户输入的名单：按分隔符切分，去首尾空白、丢空项、去重。
 * 去重是刻意的 —— 同一个名字出现两次，抽签/分组会把它当两个人，
 * 结果里出现两个「张三」很困惑。保留首次出现顺序。
 */
export function parseNames(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(NAME_SEPARATORS)) {
    const name = raw.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}
