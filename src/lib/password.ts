/* 密码生成 —— 纯函数，可单测。随机源可注入（和 random-pick.ts 同一个思路）。
 *
 * 和 random-pick.ts 的区别：那边用 Math.random 就够了（抽签不涉及安全），
 * 密码必须用密码学安全的随机数 crypto.getRandomValues。Math.random 的内部状态
 * 可以从若干输出反推出来，攻击者拿到几个你生成的密码就可能猜出下一个。
 */

/** 随机源：每次返回一个 [0, 2^32) 的均匀随机整数 */
export type Uint32Source = () => number

export const cryptoSource: Uint32Source = () => crypto.getRandomValues(new Uint32Array(1))[0]

const UINT32_RANGE = 2 ** 32

/**
 * 均匀地取 [0, n) 的整数（拒绝采样）。
 *
 * 为什么不能直接 x % n：2^32 一般不是 n 的整数倍，余数靠前的值会多出一次机会。
 * 例如 n = 3：2^32 = 3 × 1431655765 + 1，多出来的那 1 个值（0xFFFFFFFF）% 3 = 0，
 * 于是 0 比 1、2 多一次出现机会。n 越大、偏差越明显（这就是「取模偏差」）。
 * 做法：只接受落在 n 的最大整数倍以内的 x（x < limit），落到「零头」里就扔掉重抽。
 * 被扔掉的概率 < n / 2^32，对几十个字符的字符集几乎从不发生，不影响速度。
 */
export function randomBelow(n: number, source: Uint32Source = cryptoSource): number {
  if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) throw new RangeError(`randomBelow: n 必须是 1..2^32 的整数，收到 ${n}`)
  const limit = UINT32_RANGE - (UINT32_RANGE % n)
  for (;;) {
    const x = source()
    if (x < limit) return x % n
  }
}

export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
export const DIGITS = '0123456789'
/**
 * 符号集刻意不含空格、引号 ' " `、反斜杠 \ 和 |：
 * 它们在命令行、JSON、配置文件里需要转义，粘贴时容易出错。
 */
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>/?~'
/** 易混字符：0 和 O、1 和 l 和 I，手抄或读给别人时容易认错 */
export const AMBIGUOUS = '0O1lI'

export const MIN_LENGTH = 8
export const MAX_LENGTH = 128

export interface PasswordOptions {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 16, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false,
}

/** 按选项得到各个字符类别（已去掉易混字符）。各类之间不重叠，所以字符集大小 = 各类长度之和 */
export function characterClasses(options: PasswordOptions): string[] {
  const drop = (chars: string) => (options.excludeAmbiguous ? [...chars].filter((c) => !AMBIGUOUS.includes(c)).join('') : chars)
  const classes: string[] = []
  if (options.upper) classes.push(drop(UPPERCASE))
  if (options.lower) classes.push(drop(LOWERCASE))
  if (options.digits) classes.push(drop(DIGITS))
  if (options.symbols) classes.push(drop(SYMBOLS))
  return classes
}

/**
 * 熵（比特）= 长度 × log2(字符集大小)：攻击者在知道「长度和字符集」的前提下，
 * 平均要试 2^(熵-1) 次才能猜中。这是理想上限 —— 「每类至少一个」的约束会让可能的密码略少一点，
 * 但对 8 位以上的密码差距不到 1 比特，界面上忽略。
 */
export function entropyBits(length: number, poolSize: number): number {
  if (length <= 0 || poolSize <= 1) return 0
  return length * Math.log2(poolSize)
}

export type StrengthLevel = 'weak' | 'fair' | 'strong' | 'very-strong'

export interface Strength {
  level: StrengthLevel
  label: string
}

/**
 * 分档阈值是经验值（没有统一标准，和 KeePass 等密码管理器的分档相近）。
 * 参照：离线暴力破解按每秒 100 亿次算，60 比特试完全部要约 3.7 年，80 比特约 380 万年。
 */
export function strengthOf(bits: number): Strength {
  if (bits < 40) return { level: 'weak', label: '弱' }
  if (bits < 60) return { level: 'fair', label: '一般' }
  if (bits < 80) return { level: 'strong', label: '强' }
  return { level: 'very-strong', label: '很强' }
}

export type PasswordResult =
  | { ok: true; password: string; entropyBits: number; poolSize: number }
  | { ok: false; error: string }

/**
 * 生成密码。保证每个选中的类别至少出现一次：先从每类各抽一个，剩下的从总字符集里抽，
 * 最后整体洗牌（Fisher-Yates）。不洗牌的话，前几位永远是「大写、小写、数字、符号」的固定顺序，
 * 攻击者知道这条规律就能少试很多次。
 */
export function generatePassword(options: PasswordOptions, source: Uint32Source = cryptoSource): PasswordResult {
  const { length } = options
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return { ok: false, error: `长度要在 ${MIN_LENGTH} 到 ${MAX_LENGTH} 之间` }
  }
  const classes = characterClasses(options)
  if (classes.length === 0) return { ok: false, error: '至少选一种字符类型' }
  const pool = classes.join('')

  const chars = classes.map((set) => set[randomBelow(set.length, source)])
  while (chars.length < length) chars.push(pool[randomBelow(pool.length, source)])
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1, source)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return { ok: true, password: chars.join(''), entropyBits: entropyBits(length, pool.length), poolSize: pool.length }
}
