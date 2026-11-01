import { describe, expect, it } from 'vitest'

import { toRmbUppercase } from './rmb'

/** 取大写文本；转换失败时让测试直接挂，免得把 error 当文本比 */
function upper(input: string): string {
  const result = toRmbUppercase(input)
  if (!result.ok) throw new Error(`expected ok for ${input}, got: ${result.error}`)
  return result.text
}

function errorOf(input: string): string {
  const result = toRmbUppercase(input)
  if (result.ok) throw new Error(`expected error for ${input}, got: ${result.text}`)
  return result.error
}

describe('toRmbUppercase：基本写法', () => {
  it.each([
    ['0', '零元整'],
    ['0.00', '零元整'],
    ['0.5', '伍角'],
    ['0.05', '伍分'],
    ['0.55', '伍角伍分'],
    ['1', '壹元整'],
    ['1.05', '壹元零伍分'],
    ['10', '壹拾元整'],
    ['10.5', '壹拾元零伍角'],
    ['10.05', '壹拾元零伍分'],
    ['100', '壹佰元整'],
    ['101', '壹佰零壹元整'],
    ['110', '壹佰壹拾元整'],
    ['1010', '壹仟零壹拾元整'],
    ['10001', '壹万零壹元整'],
    ['100000', '壹拾万元整'],
    ['100010', '壹拾万零壹拾元整'],
    // 万节尾巴上的零不跨节：下一节满千时不补零
    ['101000', '壹拾万壹仟元整'],
    ['10100000', '壹仟零壹拾万元整'],
    ['1000000001', '壹拾亿零壹元整'],
    ['1000001', '壹佰万零壹元整'],
    ['1000100', '壹佰万零壹佰元整'],
    ['1100000', '壹佰壹拾万元整'],
    ['20000000', '贰仟万元整'],
    ['100000001', '壹亿零壹元整'],
    ['100001000', '壹亿零壹仟元整'],
    ['1000000000', '壹拾亿元整'],
    ['123456789.12', '壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元壹角贰分'],
    ['999999999999.99', '玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分'],
  ])('%s → %s', (input, expected) => {
    expect(upper(input)).toBe(expected)
  })
})

describe('toRmbUppercase：《正确填写票据和结算凭证的基本规定》里的示例', () => {
  it.each([
    ['1409.50', '壹仟肆佰零玖元伍角'],
    ['6007.14', '陆仟零柒元壹角肆分'],
    ['16409.02', '壹万陆仟肆佰零玖元零贰分'],
    ['107000.53', '壹拾万柒仟元零伍角叁分'],
    ['325.04', '叁佰贰拾伍元零肆分'],
  ])('%s → %s', (input, expected) => {
    expect(upper(input)).toBe(expected)
  })
})

describe('toRmbUppercase：输入容错', () => {
  it('负数前加「负」', () => {
    expect(upper('-12.3')).toBe('负壹拾贰元叁角')
  })

  it('负零不写「负」', () => {
    expect(upper('-0')).toBe('零元整')
    expect(upper('-0.00')).toBe('零元整')
  })

  it('千分位逗号', () => {
    expect(upper('1,234.56')).toBe('壹仟贰佰叁拾肆元伍角陆分')
    expect(upper('12,345,678')).toBe('壹仟贰佰叁拾肆万伍仟陆佰柒拾捌元整')
  })

  it('前后空白、全角数字、全角逗号和小数点（NFKC）', () => {
    expect(upper('  １２３  ')).toBe('壹佰贰拾叁元整')
    expect(upper('１，２３４．５')).toBe('壹仟贰佰叁拾肆元伍角')
  })

  it('人民币符号（半角 ¥ 和全角 ￥）', () => {
    expect(upper('¥100')).toBe('壹佰元整')
    expect(upper('￥100')).toBe('壹佰元整')
  })

  it('前导零忽略', () => {
    expect(upper('0012')).toBe('壹拾贰元整')
  })

  it('多出的小数位全是 0 时不改变金额，放行', () => {
    expect(upper('1.500')).toBe('壹元伍角')
  })

  it('normalized 给出规范的小写金额，方便核对', () => {
    const result = toRmbUppercase('１２３４５.6')
    expect(result.ok && result.normalized).toBe('¥12,345.60')
    const negative = toRmbUppercase('-1000')
    expect(negative.ok && negative.normalized).toBe('-¥1,000.00')
  })
})

describe('toRmbUppercase：报错而不是猜', () => {
  it('超过两位小数不四舍五入，直接报错', () => {
    expect(errorOf('1.234')).toContain('两位小数')
    expect(errorOf('0.001')).toContain('两位小数')
  })

  it('达到一万亿报错', () => {
    expect(errorOf('1000000000000')).toContain('一万亿')
  })

  it('空输入', () => {
    expect(errorOf('')).toContain('请输入')
    expect(errorOf('   ')).toContain('请输入')
  })

  it('非数字', () => {
    errorOf('abc')
    errorOf('12a')
    errorOf('1.2.3')
    errorOf('1e5')
    errorOf('.5')
  })

  it('千分位位置不对（含小数点误打成逗号）', () => {
    expect(errorOf('12,34')).toContain('千分位')
    expect(errorOf('1,5')).toContain('千分位')
  })
})
