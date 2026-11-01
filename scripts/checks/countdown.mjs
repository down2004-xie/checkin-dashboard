// 倒计时与纪念日的单工具验收。运行：node scripts/checks/countdown.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

/** 在 YYYY-MM-DD 上加减年 / 天（node 侧算，按 UTC 拆字段，不受本机时区影响） */
function shift(key, { years = 0, days = 0 }) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y + years, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

await runToolCheck('倒计时与纪念日', async (t) => {
  const { assert } = t
  const hint = await t.eval("[...document.querySelectorAll('.tool-panel .hint')].map(p => p.textContent).join('|')")
  const today = hint.match(/今天：(\d{4}-\d{2}-\d{2})/)?.[1]
  assert.ok(today, 'today not shown: ' + hint)
  assert.ok(!hint.includes('存在本机'), 'hint still mentions 存在本机')
  const storageKeys = await t.eval('Object.keys(localStorage).sort()')

  await t.input('input[aria-label="目标日期"]', today)
  assert.equal(await t.eval("document.querySelector('.countdown-result__label').textContent.trim()"), '就是今天')
  await t.input('input[aria-label="目标日期"]', shift(today, { days: 10 }))
  assert.equal(await t.eval("document.querySelector('.countdown-result__label').textContent.trim()"), '还有 10 天')
  t.pass(`倒计时：今天(${today}) = 就是今天，+10 天 = 还有 10 天`)

  await t.clickText('每年纪念日')
  // 起始日 = 「今天 + 10 天」那一天的 3 年前 → 下一次是第 3 周年，还有 10 天。
  // 先加天再减年，纪念日恰好落在 today+10（唯一例外是 today+10 为 2 月 29 日，概率 1/1461）
  const origin = shift(shift(today, { days: 10 }), { years: -3 })
  await t.input('input[aria-label="纪念日起始日期"]', origin)
  const yearly = await t.eval("({ label: document.querySelector('.countdown-anniversary .countdown-result__label')?.textContent.trim(), days: document.querySelector('.countdown-anniversary .countdown-result__days')?.textContent.trim(), detail: document.querySelector('.countdown-anniversary__detail')?.textContent.trim() })")
  assert.equal(yearly.label, '距第 3 周年还有')
  assert.equal(yearly.days, '10 天')
  assert.match(yearly.detail, /^下一次是 \d{4}-\d{2}-\d{2}。从 .+ 起已经过去 \d+ 天。$/)
  t.pass(`每年纪念日：起始 ${origin} → ${yearly.label} ${yearly.days}；${yearly.detail}`)

  // 今天恰好是纪念日
  await t.input('input[aria-label="纪念日起始日期"]', shift(today, { years: -2 }))
  const todayLabel = await t.eval("document.querySelector('.countdown-anniversary.countdown-result--today .countdown-result__days')?.textContent.trim() ?? null")
  if (today.endsWith('-02-29')) {
    t.pass('今天是 2 月 29 日，两年前没有这天，跳过「今天就是纪念日」断言')
  } else {
    assert.equal(todayLabel, '第 2 周年')
    t.pass('起始日 = 两年前的今天 → 今天就是 第 2 周年（高亮样式）')
  }

  // 起始日在未来
  await t.input('input[aria-label="纪念日起始日期"]', shift(today, { days: 5 }))
  assert.match(await t.eval("document.querySelector('.tool-panel [role=alert]')?.textContent ?? ''"), /这一天还没到/)
  t.pass('起始日在未来：提示改用倒计时')

  // 切回倒计时，原来填的目标日期还在
  await t.clickText('倒计时')
  assert.equal(await t.eval("document.querySelector('.countdown-result__label').textContent.trim()"), '还有 10 天')
  t.pass('两个模式的日期各存一份，切换不丢')

  assert.deepEqual(await t.eval('Object.keys(localStorage).sort()'), storageKeys)
  t.pass('操作前后 localStorage 键不变（工具不写本地存储）')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.clickText('每年纪念日')
  await t.input('input[aria-label="纪念日起始日期"]', origin)
  await t.delay(200)
  const scrollWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(scrollWidth <= 390, `horizontal overflow at 390px: ${scrollWidth}`)
  t.pass(`390px 宽无横向溢出（scrollWidth ${scrollWidth}）`)
})
