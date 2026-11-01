/* 人民币金额大写 —— 纯函数，可单测。
 *
 * 关键设计：**全程按字符串处理，不经过浮点数**。
 * 金额一旦 `Number('0.29')` 再乘 100，就会碰上 0.1 + 0.2 !== 0.3 这一类二进制误差，
 * 分位可能差 1。报销单上差一分钱是大事，所以这里只拆字符串、逐位查表。
 *
 * 写法依据：中国人民银行《支付结算办法》附件一《正确填写票据和结算凭证的基本规定》
 * 里的大写规则和示例（如 ¥1,409.50 → 壹仟肆佰零玖元伍角，¥16,409.02 → 壹万陆仟肆佰零玖元零贰分，
 * ¥107,000.53 → 壹拾万柒仟元零伍角叁分）。几条具体落地方式见 integerToChinese / toRmbUppercase 的注释。
 * 注意：上面的示例是开发时按记忆整理的，当时没能联网对照原文，`rmb.test.ts` 里同名一组用例同理，
 * 改规则前先找原文核对一遍。
 */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
/** 一节（四位）内从高到低的位名：仟 佰 拾 个 */
const UNITS = ['仟', '佰', '拾', '']
/** 节名：从低到高 个节 / 万节 / 亿节 */
const SECTIONS = ['', '万', '亿']

/** 整数部分最多 12 位：上限是「万亿以内」，即最大 999,999,999,999.99 */
const MAX_INTEGER_DIGITS = 12

export type RmbResult =
  | {
      ok: true
      /** 大写，如「壹佰元整」 */
      text: string
      /** 规范化后的小写金额，如「¥1,234.50」，方便用户核对自己输入的是不是这个数 */
      normalized: string
    }
  | { ok: false; error: string }

/**
 * 把一个只含数字、首位非零（或就是 "0"）的整数字符串转成大写（不含「元」）。
 *
 * 零的规则：
 * - 一节内连续的零只写一个「零」（1001 → 壹仟零壹）。
 * - 节尾的零不写（1100 → 壹仟壹佰；10000 → 壹万）。
 * - 跨节时，只要前面已经写过非零数字、而后面的节「不满千」（高位是零，或整节都是零），
 *   就补一个「零」（100000001 → 壹亿零壹；10001 → 壹万零壹）。
 *   整节为零时不另写零，靠「后面再出现非零时补一个」统一处理，所以连续几节为零也只写一个。
 * - 「拾」在最高位时也写「壹拾」（10 → 壹拾，100000 → 壹拾万）。
 *   依据是上面那份规定的示例「壹拾万柒仟元零伍角叁分」；
 *   财务上这样写是防篡改：单写「拾」前面能被人补字。
 */
function integerToChinese(digits: string): string {
  if (digits === '0') return ''
  const padded = digits.padStart(Math.ceil(digits.length / 4) * 4, '0')
  const sectionCount = padded.length / 4
  let result = ''
  // 前面（更高位）是否已经写过非零数字。没写过的话，前导零一律不读
  let started = false
  // 是否欠着一个「零」：遇到零就记账，等后面真出现非零数字时才写出来，
  // 这样数尾的零自然就不会写；节尾的零在节结束时清账（见循环末尾）
  let pendingZero = false

  for (let s = 0; s < sectionCount; s += 1) {
    const section = padded.slice(s * 4, s * 4 + 4)
    const sectionName = SECTIONS[sectionCount - 1 - s]
    let sectionHasValue = false
    for (let i = 0; i < 4; i += 1) {
      const d = Number(section[i])
      if (d === 0) {
        if (started) pendingZero = true
        continue
      }
      if (pendingZero) result += '零'
      pendingZero = false
      result += DIGITS[d] + UNITS[i]
      started = true
      sectionHasValue = true
    }
    // 节名只挂在「本节有值」时：100000001 的万节全零，不写「万」
    if (sectionHasValue) {
      result += sectionName
      // 本节有值时，它尾巴上的零被节名「吃掉」了，不能带到下一节：
      // 107000 是「壹拾万柒仟」而不是「壹拾万零柒仟」（规定示例 ¥107,000.53）。
      // 下一节若不满千，它自己的前导零会重新记账，100010 照样得到「壹拾万零壹拾」。
      // 整节为零时不清：100001000 的万节全零，零要一路带到「壹仟」前面
      pendingZero = false
    }
  }
  return result
}

/**
 * 千分位校验：有逗号时必须是标准的三位一组（1,234,567），不接受 12,34 这种。
 * 为什么不直接把逗号全删掉：用户把小数点误打成逗号（1,5）时，删逗号会变成 15，
 * 金额被静默放大十倍。宁可报错。
 */
function isValidGrouping(integerPart: string): boolean {
  return /^\d{1,3}(,\d{3})*$/.test(integerPart)
}

/**
 * 把用户输入的金额转成人民币大写。
 *
 * 接受：前后空白、千分位逗号、全角数字和符号（先做 NFKC 归一）、开头的 ¥ / -。
 * 拒绝（返回 ok: false 和一句人话）：空、非数字、千分位位置不对、
 * 超过两位小数（不静默四舍五入：报销金额被改一分钱是大事）、达到一万亿。
 *
 * 角分规则：
 * - 没有角分 → 「元整」。
 * - 有角无分 → 「X元X角」，不加「整」（规定里「角」后面可写可不写「整」，这里统一不写）。
 * - 元位是零、后面角位非零 → 元后补「零」（10.5 → 壹拾元零伍角，示例 107000.53 → …柒仟元零伍角叁分）。
 * - 有分无角 → 元后写「零」（1.05 → 壹元零伍分）。
 * - 整数部分为零 → 不写「零元」，直接从角或分开始（0.5 → 伍角，0.05 → 伍分）。
 * - 金额为零 → 「零元整」，负零也不写「负」。
 */
export function toRmbUppercase(input: string): RmbResult {
  const text = input.normalize('NFKC').trim().replace(/^¥\s*/, '')
  if (text === '') return { ok: false, error: '请输入金额' }

  const match = /^(-)?\s*¥?\s*([\d,]+)(?:\.(\d+))?$/.exec(text)
  if (!match) return { ok: false, error: '只能输入数字、小数点、千分位逗号和负号' }

  const negativeSign = match[1] === '-'
  const rawInteger = match[2]
  const rawFraction = match[3] ?? ''

  if (rawInteger.includes(',') && !isValidGrouping(rawInteger)) {
    return { ok: false, error: '千分位逗号的位置不对（应为每三位一个，如 1,234,567）。小数点请用「.」' }
  }
  // 小数超过两位：只有多出来的位全是 0（1.500）才放行，因为它不改变金额；
  // 1.234 这种直接报错，不替用户决定四舍五入还是截断
  if (rawFraction.length > 2 && /[^0]/.test(rawFraction.slice(2))) {
    return { ok: false, error: '人民币最小单位是分，最多两位小数' }
  }

  const integer = rawInteger.replace(/,/g, '').replace(/^0+(?=\d)/, '')
  if (integer.length > MAX_INTEGER_DIGITS) {
    return { ok: false, error: '金额需小于一万亿元' }
  }
  const fraction = rawFraction.slice(0, 2).padEnd(2, '0')
  const jiao = Number(fraction[0])
  const fen = Number(fraction[1])

  const isZero = integer === '0' && jiao === 0 && fen === 0
  const negative = negativeSign && !isZero
  const normalized = `${negative ? '-' : ''}¥${integer.replace(/\B(?=(\d{3})+$)/g, ',')}.${fraction}`

  if (isZero) return { ok: true, text: '零元整', normalized }

  const yuan = integerToChinese(integer)
  let result = yuan ? `${yuan}元` : ''

  if (jiao === 0 && fen === 0) {
    result += '整'
  } else {
    const yuanDigitIsZero = integer.endsWith('0')
    if (yuan && (jiao === 0 || yuanDigitIsZero)) result += '零'
    if (jiao !== 0) result += `${DIGITS[jiao]}角`
    if (fen !== 0) result += `${DIGITS[fen]}分`
  }

  return { ok: true, text: `${negative ? '负' : ''}${result}`, normalized }
}
