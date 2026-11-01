// 单位换算的单工具验收。运行：node scripts/checks/unit-convert.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const RESULT = "document.querySelector('.unit-result strong')?.textContent.trim() ?? null"
const ERROR = "document.querySelector('.unit-result--error')?.textContent.trim() ?? null"
const ECHO = "document.querySelector('.unit-result')?.textContent.trim() ?? ''"

await runToolCheck('单位换算', async (t) => {
  const { assert } = t
  assert.equal(await t.eval(RESULT), '100')
  t.pass('默认 1 米 = 100 厘米')

  // 旧 bug：toPrecision(6) 把 1609344 显示成 1609340，回显也被改写
  await t.input('select[aria-label="原单位"]', 'mi')
  await t.input('select[aria-label="目标单位"]', 'mm')
  assert.equal(await t.eval(RESULT), '1609344')
  await t.input('input[aria-label="要换算的数值"]', '1234567')
  assert.match(await t.eval(ECHO), /^1234567 英里 = /)
  t.pass('1 英里 = 1609344 毫米；输入 1234567 原样回显')

  // 市制单位在「市制」分组里
  const groups = await t.eval("[...document.querySelectorAll('select[aria-label=\"原单位\"] optgroup')].map(g => g.label + ':' + [...g.children].map(o => o.textContent).join('/'))")
  assert.ok(groups.includes('市制:里/丈/尺/寸'), JSON.stringify(groups))
  await t.input('input[aria-label="要换算的数值"]', '3')
  await t.input('select[aria-label="原单位"]', 'chi')
  await t.input('select[aria-label="目标单位"]', 'm')
  assert.equal(await t.eval(RESULT), '1')
  t.pass(`单位按制式分组（${groups.join('；')}），3 尺 = 1 米`)

  // 切量纲不重置输入
  await t.clickText('重量')
  assert.equal(await t.eval("document.querySelector('input[aria-label=\"要换算的数值\"]').value"), '3')
  assert.equal(await t.eval(RESULT), '6') // 默认 千克 → 斤
  await t.input('input[aria-label="要换算的数值"]', '1')
  await t.input('select[aria-label="原单位"]', 'mg')
  await t.input('select[aria-label="目标单位"]', 't')
  assert.equal(await t.eval(RESULT), '0.000000001')
  t.pass('切到重量后输入保持 3，3 千克 = 6 斤；1 毫克 = 0.000000001 吨')

  await t.clickText('面积')
  await t.input('select[aria-label="原单位"]', 'acre')
  await t.input('select[aria-label="目标单位"]', 'm2')
  assert.equal(await t.eval(RESULT), '4046.8564224')
  t.pass('1 英亩 = 4046.8564224 平方米')

  // 非法输入给出原因
  for (const [raw, expected] of [['1,000', /千位分隔符/], ['', /请输入数值/], ['0x10', /十进制/], ['abc', /不是有效的数字/], ['-2', /面积不能为负数/]]) {
    await t.input('input[aria-label="要换算的数值"]', raw)
    assert.match((await t.eval(ERROR)) ?? '', expected, `input ${JSON.stringify(raw)}`)
    assert.equal(await t.eval(RESULT), null)
  }
  await t.input('input[aria-label="要换算的数值"]', '1e3')
  assert.equal(await t.eval(RESULT), '4046856.4224') // 当前是 英亩 → 平方米，1e3 英亩
  t.pass('1,000 / 空 / 0x10 / abc / 负面积 都给出原因；1e3 按 1000 算')

  await t.clickText('温度')
  await t.input('input[aria-label="要换算的数值"]', '100')
  assert.equal(await t.eval(RESULT), '212')
  await t.input('input[aria-label="要换算的数值"]', '-300')
  assert.match((await t.eval(ERROR)) ?? '', /绝对零度/)
  await t.input('input[aria-label="要换算的数值"]', '-273.15')
  assert.equal(await t.eval(RESULT), '-459.67')
  t.pass('100 °C = 212 °F；-300 °C 提示低于绝对零度；-273.15 °C 正常换算')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const scrollWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(scrollWidth <= 390, `horizontal overflow at 390px: ${scrollWidth}`)
  t.pass(`390px 宽无横向溢出（scrollWidth ${scrollWidth}）`)
})
