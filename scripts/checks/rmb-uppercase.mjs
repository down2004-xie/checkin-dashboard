// 人民币大写的单工具验收。运行：node scripts/checks/rmb-uppercase.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

await runToolCheck('人民币大写', async (t) => {
  const { assert, page, delay } = t
  const sel = 'input[aria-label="金额"]'
  const text = () => t.eval("document.querySelector('.rmb-result__text')?.textContent ?? null")
  const error = () => t.eval("document.querySelector('.rmb-error')?.textContent ?? null")

  // 空输入：既没结果也没报错（还没开始输就标红很烦人）
  assert.equal(await text(), null)
  assert.equal(await error(), null)
  t.pass('空输入不显示结果也不报错')

  const cases = [
    ['100', '壹佰元整'],
    ['1.05', '壹元零伍分'],
    ['100000001', '壹亿零壹元整'],
    ['107000.53', '壹拾万柒仟元零伍角叁分'],
    ['１，２３４．５', '壹仟贰佰叁拾肆元伍角'],
    ['-12.3', '负壹拾贰元叁角'],
  ]
  for (const [input, expected] of cases) {
    await t.input(sel, input)
    assert.equal(await text(), expected, `${input}`)
  }
  t.pass(`输入即转换，${cases.length} 个例子逐字一致（含全角、千分位、负数、跨节补零）`)

  await t.input(sel, '１，２３４．５')
  assert.equal(await t.eval("document.querySelector('.rmb-result__normalized').textContent"), '小写：¥1,234.50')
  t.pass('全角输入显示规范化小写「¥1,234.50」供核对')

  await t.input(sel, '1.234')
  assert.equal(await text(), null)
  assert.ok((await error()).includes('两位小数'))
  await t.input(sel, '1000000000000')
  assert.ok((await error()).includes('一万亿'))
  await t.input(sel, '12a')
  assert.ok((await error()) !== null)
  t.pass('三位小数、超上限、非法字符都报错，不出结果')

  await t.clickText('16409.02')
  assert.equal(await t.eval(`document.querySelector(${JSON.stringify(sel)}).value`), '16409.02')
  assert.equal(await text(), '壹万陆仟肆佰零玖元零贰分')
  t.pass('点示例芯片填入金额并转换')

  // 复制：headless 下剪贴板可能被拒，两种结果都可以，但必须给出明确反馈、不能抛异常
  await t.clickText('复制大写')
  await t.waitFor("[...document.querySelectorAll('.rmb-result__actions .hint')].some(el => /已复制|复制失败/.test(el.textContent))", 'no copy feedback')
  const feedback = await t.eval("document.querySelector('.rmb-result__actions .hint').textContent")
  t.pass(`复制按钮给出反馈：「${feedback}」`)

  // 移动端 390px：最长的大写也不横向溢出
  await t.input(sel, '999999999999.99')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`)
  t.pass('390px 宽下最长金额（玖仟玖佰…玖分）无横向溢出')
  await t.shot('rmb-390.png')
})
