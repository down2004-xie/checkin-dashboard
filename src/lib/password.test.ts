import { describe, expect, it } from 'vitest'

import {
  AMBIGUOUS,
  DEFAULT_PASSWORD_OPTIONS,
  DIGITS,
  LOWERCASE,
  SYMBOLS,
  UPPERCASE,
  characterClasses,
  entropyBits,
  generatePassword,
  randomBelow,
  strengthOf,
  type PasswordOptions,
  type Uint32Source,
} from './password'

/** 按给定序列依次吐数的假随机源，并记录被调用了几次 */
function sequence(values: number[]): Uint32Source & { calls: number } {
  let index = 0
  const source = Object.assign(() => {
    source.calls += 1
    const value = values[index % values.length]
    index += 1
    return value
  }, { calls: 0 })
  return source
}

/** 简单的确定性伪随机（xorshift32），给需要「大量、看起来随机」输入的测试用 */
function xorshift(seed: number): Uint32Source {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state
  }
}

const only = (patch: Partial<PasswordOptions>): PasswordOptions => ({
  ...DEFAULT_PASSWORD_OPTIONS, upper: false, lower: false, digits: false, symbols: false, ...patch,
})

describe('randomBelow（拒绝采样）', () => {
  it('n = 3：limit = 2^32 - 1，最大值 0xFFFFFFFF 落在零头里被拒绝重抽', () => {
    const source = sequence([0xffffffff, 0xfffffffe])
    // 0xfffffffe = 4294967294 = 3 × 1431655764 + 2
    expect(randomBelow(3, source)).toBe(2)
    expect(source.calls).toBe(2)
  })

  it('limit 之下的最大值被接受', () => {
    const source = sequence([0xfffffffe])
    expect(randomBelow(3, source)).toBe(2)
    expect(source.calls).toBe(1)
  })

  it('n 是 2 的幂时没有零头，从不拒绝', () => {
    const source = sequence([0xffffffff])
    expect(randomBelow(64, source)).toBe(63)
    expect(source.calls).toBe(1)
  })

  it('n = 1 永远返回 0；非法 n 抛 RangeError', () => {
    expect(randomBelow(1, sequence([12345]))).toBe(0)
    expect(() => randomBelow(0)).toThrow(RangeError)
    expect(() => randomBelow(2.5)).toThrow(RangeError)
  })

  it('真随机源（crypto）结果都在范围内', () => {
    for (let i = 0; i < 1000; i += 1) {
      const value = randomBelow(7)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(7)
    }
  })
})

describe('generatePassword', () => {
  it('长度准确（边界 8 和 128）', () => {
    for (const length of [8, 16, 128]) {
      const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length })
      expect(result.ok && result.password.length).toBe(length)
    }
  })

  it('长度越界或非整数报错', () => {
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 7 }).ok).toBe(false)
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 129 }).ok).toBe(false)
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 10.5 }).ok).toBe(false)
  })

  it('一种类型都不选报错', () => {
    expect(generatePassword(only({})).ok).toBe(false)
  })

  it('每个选中类别至少出现一次（最短长度、大量随机种子）', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 }, xorshift(seed))
      if (!result.ok) throw new Error(result.error)
      for (const set of [UPPERCASE, LOWERCASE, DIGITS, SYMBOLS]) {
        expect([...result.password].some((c) => set.includes(c)), `seed ${seed}: ${result.password}`).toBe(true)
      }
    }
  })

  it('只用选中的类别', () => {
    const result = generatePassword(only({ digits: true, length: 64 }), xorshift(7))
    expect(result.ok && result.password).toMatch(/^[0-9]{64}$/)
  })

  it('排除易混字符后一个都不出现', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 128, excludeAmbiguous: true }, xorshift(seed))
      if (!result.ok) throw new Error(result.error)
      expect([...result.password].filter((c) => AMBIGUOUS.includes(c))).toEqual([])
    }
  })

  it('洗牌后「保底字符」不总在开头：首字符在多次生成中覆盖多个类别', () => {
    const firstClass = new Set<string>()
    for (let seed = 1; seed <= 200; seed += 1) {
      const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 }, xorshift(seed))
      if (!result.ok) throw new Error(result.error)
      const c = result.password[0]
      firstClass.add(UPPERCASE.includes(c) ? 'U' : LOWERCASE.includes(c) ? 'L' : DIGITS.includes(c) ? 'D' : 'S')
    }
    expect(firstClass.size).toBe(4)
  })

  it('返回的熵与字符集大小一致', () => {
    const result = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 16 })
    const pool = 26 + 26 + 10 + SYMBOLS.length
    expect(result.ok && result.poolSize).toBe(pool)
    expect(result.ok && result.entropyBits).toBeCloseTo(16 * Math.log2(pool), 10)
  })
})

describe('字符集与熵', () => {
  it('排除易混字符后各类大小', () => {
    const sizes = characterClasses({ ...DEFAULT_PASSWORD_OPTIONS, excludeAmbiguous: true }).map((set) => set.length)
    expect(sizes).toEqual([24, 25, 8, SYMBOLS.length]) // 去掉 O I / l / 0 1
  })

  it('符号集不含需要转义的字符', () => {
    expect(SYMBOLS).not.toMatch(/[\s'"`\\|]/)
  })

  it('熵 = 长度 × log2(字符集大小)', () => {
    expect(entropyBits(10, 2)).toBe(10)
    expect(entropyBits(8, 256)).toBe(64)
    expect(entropyBits(12, 62)).toBeCloseTo(71.45, 2)
    expect(entropyBits(0, 62)).toBe(0)
    expect(entropyBits(12, 1)).toBe(0)
  })

  it('分档边界', () => {
    expect(strengthOf(39.9).level).toBe('weak')
    expect(strengthOf(40).level).toBe('fair')
    expect(strengthOf(60).level).toBe('strong')
    expect(strengthOf(80).level).toBe('very-strong')
    // 8 位纯小写 ≈ 37.6 比特 → 弱；16 位四类全选 ≈ 100 比特 → 很强
    expect(strengthOf(entropyBits(8, 26)).level).toBe('weak')
    expect(strengthOf(entropyBits(16, 89)).level).toBe('very-strong')
  })
})
