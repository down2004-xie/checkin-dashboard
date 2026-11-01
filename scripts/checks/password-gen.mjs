// 密码生成器的浏览器验收。运行：node scripts/checks/password-gen.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const password = "document.querySelector('.password-gen__value').textContent"
const strength = "document.querySelector('.password-gen__strength-text')?.textContent ?? ''"
const checkbox = (label) => `[...document.querySelectorAll('.password-gen__classes label')].find(l => l.textContent.includes(${JSON.stringify(label)})).querySelector('input')`

await runToolCheck('密码生成器', async (t) => {
  const { assert } = t
  const storageBefore = await t.eval('JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))')

  // 默认：16 位、四类全选，打开即有密码
  const first = await t.eval(password)
  assert.equal(first.length, 16)
  assert.match(first, /[A-Z]/); assert.match(first, /[a-z]/); assert.match(first, /[0-9]/); assert.match(first, /[^A-Za-z0-9]/)
  assert.match(await t.eval(strength), /很强.*约 10\d 比特熵.*字符集 89 个/)
  t.pass(`默认 16 位四类齐全，强度「很强」：${await t.eval(strength)}`)

  // 重新生成得到不同密码
  await t.clickText('重新生成')
  assert.notEqual(await t.eval(password), first)
  t.pass('「重新生成」换了一个新密码')

  // 每类至少一个：最短长度 8，连生成 50 次
  await t.input('input[aria-label="密码长度"]', '8')
  for (let i = 0; i < 50; i += 1) {
    await t.eval("[...document.querySelectorAll('.tool-panel button')].find(b => b.textContent.trim() === '重新生成').click()")
    const value = await t.eval(password)
    assert.equal(value.length, 8)
    for (const re of [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/]) assert.match(value, re, `缺类别：${value}`)
  }
  t.pass('长度 8 连续生成 50 次，每次四类都至少出现一次')

  // 只选数字 + 排除易混字符
  await t.eval(`${checkbox('大写')}.click()`); await t.eval(`${checkbox('小写')}.click()`); await t.eval(`${checkbox('符号')}.click()`)
  await t.eval(`${checkbox('排除易混')}.click()`)
  await t.input('input[aria-label="密码长度"]', '128')
  const digitsOnly = await t.eval(password)
  assert.match(digitsOnly, /^[2-9]{128}$/)
  assert.match(await t.eval(strength), /字符集 8 个/)
  t.pass('只选数字 + 排除易混：128 位且只含 2-9，字符集 8 个')

  // 一类都不选 → 提示
  await t.eval(`${checkbox('数字')}.click()`)
  assert.match(await t.eval("document.querySelector('.tool-panel [role=alert]')?.textContent ?? ''"), /至少选一种/)
  assert.equal(await t.eval("document.querySelector('.password-gen__buttons .btn:not(.btn--primary)').disabled"), true)
  t.pass('一类都不选时提示「至少选一种」，复制按钮禁用')
  await t.eval(`${checkbox('小写')}.click()`)

  // 长度越界：失焦后夹回范围
  await t.input('input[aria-label="密码长度"]', '500')
  await t.eval("document.querySelector('input[aria-label=\"密码长度\"]').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))")
  await t.delay(80)
  assert.equal(await t.eval("document.querySelector('input[aria-label=\"密码长度\"]').value"), '128')
  assert.equal((await t.eval(password)).length, 128)
  t.pass('长度填 500，失焦后纠正为 128')

  // 复制
  await t.eval("window.__copied = null; navigator.clipboard.writeText = async (s) => { window.__copied = s }")
  await t.clickText('复制')
  await t.waitFor(`window.__copied === ${password}`, '复制内容和显示的不一致')
  t.pass('复制的就是当前显示的密码')

  // 不碰 localStorage
  const storageAfter = await t.eval('JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))')
  assert.equal(storageAfter, storageBefore, '密码生成器改动了 localStorage')
  t.pass('全程 localStorage 不变（不记录任何生成过的密码）')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const overflow = await t.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 0, `390px 下横向溢出 ${overflow}px`)
  await t.shot('password-gen-390.png')
  t.pass('390px 宽 128 位密码无横向溢出')
})
