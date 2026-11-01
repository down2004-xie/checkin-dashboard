// 随机抽签的单工具验收。运行：node scripts/checks/random-pick.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const PRIMARY = '.tool-panel .btn--primary'
const ALERT = "document.querySelector('.tool-panel [role=alert]')?.textContent.trim() ?? null"
const DISABLED = `document.querySelector(${JSON.stringify(PRIMARY)}).disabled`

await runToolCheck('随机抽签', async (t) => {
  const { assert } = t

  await t.input('input[aria-label="骰子个数"]', '3')
  await t.click(PRIMARY)
  const dice = await t.eval("[...document.querySelectorAll('.random-die')].map(e => Number(e.textContent))")
  assert.equal(dice.length, 3)
  assert.ok(dice.every((v) => Number.isInteger(v) && v >= 1 && v <= 6), 'dice out of range: ' + dice)
  t.pass(`3 个 6 面骰：${dice.join(', ')}`)

  // 超限 / 非法输入：按钮禁用 + 明确原因（以前是按钮能点但静默无反应）
  for (const [field, raw, expected] of [
    ['骰子个数', '101', '骰子个数最多 100'],
    ['骰子个数', '1.5', '骰子个数要填正整数'],
    ['骰子个数', '', '请填写骰子个数'],
  ]) {
    await t.input(`input[aria-label="${field}"]`, raw)
    assert.equal(await t.eval(ALERT), expected)
    assert.equal(await t.eval(DISABLED), true)
  }
  await t.input('input[aria-label="骰子个数"]', '2')
  await t.input('input[aria-label="骰子面数"]', '1')
  assert.equal(await t.eval(ALERT), '面数至少是 2')
  await t.input('input[aria-label="骰子面数"]', '6')
  assert.equal(await t.eval(ALERT), null)
  assert.equal(await t.eval(DISABLED), false)
  t.pass('骰子 101 个 / 1.5 / 空 / 1 面：按钮禁用并写明原因；改回合法值后恢复')

  await t.clickText('抛硬币')
  await t.input('input[aria-label="硬币个数"]', '0')
  assert.equal(await t.eval(ALERT), '硬币个数至少是 1')
  await t.input('input[aria-label="硬币个数"]', '100')
  await t.click(PRIMARY)
  const coins = await t.eval("[...document.querySelectorAll('.random-coin')].map(e => e.textContent.trim())")
  assert.equal(coins.length, 100)
  assert.ok(coins.every((c) => c === '正' || c === '反'))
  t.pass(`硬币 0 个给提示；100 个硬币：正 ${coins.filter((c) => c === '正').length} / 反 ${coins.filter((c) => c === '反').length}`)

  // 名单分隔符：分号（中英）、Tab、顿号；空格不切
  await t.clickText('抽签')
  await t.input('textarea[aria-label="名单"]', 'Tom Hanks;张三；李四\t王五、赵六')
  assert.match(await t.eval("document.querySelector('.random-names .hint').textContent"), /已识别 5 人/)
  await t.click(PRIMARY)
  const picked = await t.eval("document.querySelector('.random-result--pick').textContent.trim()")
  assert.ok(['Tom Hanks', '张三', '李四', '王五', '赵六'].includes(picked), 'picked: ' + picked)
  // 名单改动后旧结果清掉
  await t.input('textarea[aria-label="名单"]', '甲\n乙\n丙\n丁\n戊\n己\n庚')
  assert.equal(await t.eval("document.querySelector('.random-result--pick')"), null)
  t.pass(`分号/Tab/顿号切分、英文名空格保留（识别 5 人，抽中 ${picked}）；改名单后旧结果清空`)

  await t.clickText('随机分组')
  await t.input('input[aria-label="分组数"]', '1')
  assert.equal(await t.eval(ALERT), '组数至少是 2')
  await t.input('input[aria-label="分组数"]', '3')
  // 7 人分 3 组：多出的 1 人应随机落在不同组，不再固定第 1 组
  const bigIndexes = new Set()
  for (let run = 0; run < 30; run += 1) {
    await t.click(PRIMARY)
    const sizes = await t.eval("[...document.querySelectorAll('.random-group__names')].map(e => e.textContent.split('、').length)")
    assert.deepEqual([...sizes].sort(), [2, 2, 3])
    bigIndexes.add(sizes.indexOf(3))
  }
  assert.ok(bigIndexes.size > 1, 'the 3-person group was always group ' + [...bigIndexes])
  const title = await t.eval("document.querySelector('.random-group__title').textContent.trim()")
  assert.match(title, /^第 1 组（[23] 人）$/)
  await t.input('textarea[aria-label="名单"]', '甲\n乙')
  assert.equal(await t.eval("document.querySelectorAll('.random-group').length"), 0)
  t.pass(`7 人分 3 组跑 30 次，3 人组出现在第 ${[...bigIndexes].map((i) => i + 1).sort().join('/')} 组；改名单后分组清空`)

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.clickText('抛硬币')
  await t.click(PRIMARY)
  await t.delay(200)
  const scrollWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(scrollWidth <= 390, `horizontal overflow at 390px: ${scrollWidth}`)
  t.pass(`390px 宽、100 枚硬币结果下无横向溢出（scrollWidth ${scrollWidth}）`)
})
