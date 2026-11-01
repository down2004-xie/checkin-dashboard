// 房贷计算器的单工具验收。运行：node scripts/checks/loan-calc.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

await runToolCheck('房贷计算器', async (t) => {
  const { assert, page, delay } = t
  const rowCount = () => t.eval("document.querySelectorAll('.loan-schedule tbody tr').length")
  const cell = (row, col) => t.eval(`document.querySelector('.loan-schedule tbody tr:nth-child(${row}) td:nth-child(${col})').textContent`)
  const compare = () => t.eval("[...document.querySelectorAll('.loan-compare tbody tr')].map(tr => [...tr.children].map(c => c.textContent))")

  // 默认值（100 万 / 30 年 / 4%）直接出结果；逐月表只渲染前 12 期
  assert.ok(await t.eval("document.querySelector('.tool-panel').textContent.includes('请以银行合同上的利率为准')"))
  assert.equal(await rowCount(), 12)
  t.pass('默认参数直接出对比表，逐月表默认只渲染 12 行，提示「以银行合同为准」')

  await t.clickText('展开全部 360 期')
  assert.equal(await rowCount(), 360)
  assert.equal(await cell(360, 5), '0.00')
  t.pass('展开后 360 行，最后一期剩余本金 0.00')
  await t.clickText('收起，只看前 12 期')
  assert.equal(await rowCount(), 12)

  // 换成手算过的小例子：12 万 / 1 年 / 6%（逐期数字见 src/lib/loan.test.ts）
  await t.input('input[aria-label="贷款金额（万元）"]', '12')
  await t.input('input[aria-label="贷款年限"]', '1')
  await t.input('input[aria-label="年利率"]', '6')
  const rows = await compare()
  assert.deepEqual(rows, [
    ['首月月供', '10,327.97 元', '10,600.00 元'],
    ['末月月供', '10,327.99 元', '10,050.00 元'],
    ['总利息', '3,935.66 元', '3,900.00 元'],
    ['还款总额', '123,935.66 元', '123,900.00 元'],
  ])
  t.pass('12 万 / 1 年 / 6%：对比表与手算一致（等额本息总利息 3,935.66，等额本金 3,900.00）')

  const summary = await t.eval("document.querySelector('.loan-summary').textContent")
  assert.ok(summary.includes('35.66 元') && summary.includes('272.03 元') && summary.includes('50.00 元'), summary)
  t.pass('差额说明：少付利息 35.66 元、首月多还 272.03 元、每月减少 50.00 元')

  assert.equal(await rowCount(), 12)
  assert.equal(await t.eval("[...document.querySelectorAll('.tool-panel button')].some(b => b.textContent.startsWith('展开全部'))"), false)
  assert.equal(await cell(1, 2), '10,327.97')
  assert.equal(await cell(12, 5), '0.00')
  await t.clickText('等额本金')
  assert.equal(await cell(1, 2), '10,600.00')
  assert.equal(await cell(12, 2), '10,050.00')
  t.pass('12 期时不显示「展开」；切换等额本金后逐月表首期 10,600.00、末期 10,050.00')

  // 非法输入：报错，不出表
  await t.input('input[aria-label="贷款年限"]', '31')
  assert.ok((await t.eval("document.querySelector('.tool-panel [role=alert]')?.textContent ?? ''")).includes('1 ~ 30'))
  assert.equal(await t.eval("!!document.querySelector('.loan-schedule')"), false)
  t.pass('年限 31 报错且不出表')

  // 移动端 390px：表格自己横向滚动，整页不溢出
  await t.input('input[aria-label="贷款年限"]', '30')
  await t.input('input[aria-label="贷款金额（万元）"]', '99999')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`)
  t.pass('390px 宽、9.9999 亿元贷款下整页无横向溢出（表格在容器内滚动）')
  await t.shot('loan-390.png')
})
