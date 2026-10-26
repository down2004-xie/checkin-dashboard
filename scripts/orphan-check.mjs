/**
 * 孤儿历史记录（清理区块）的自动化验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:orphan` 运行。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
const profile = await mkdtemp(join(tmpdir(), 'orphan-'))
const shots = await mkdtemp(join(tmpdir(), 'orphan-shots-'))
await mkdir(shots, { recursive: true })
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const port = await freePort(); const debugPort = await freePort()
const origin = `http://127.0.0.1:${port}`; const dbg = `http://127.0.0.1:${debugPort}`
const children = []; const failures = []
const launch = (c, a) => { const x = spawn(c, a, { cwd: workspace, windowsHide: true, stdio: ['ignore','pipe','pipe'] }); x.on('error', (e) => failures.push(e.message)); children.push(x); return x }
const waitFor = async (fn, msg, t = 20000) => { const end = Date.now()+t; let e; while (Date.now()<end) { try { if (await fn()) return } catch (x) { e = x } await delay(60) } throw new Error(msg + (e ? ': ' + e.message : '')) }
let page
async function connect(addr) {
  const ws = new WebSocket(addr)
  await new Promise((d, r) => { ws.addEventListener('open', d, { once: true }); ws.addEventListener('error', r, { once: true }) })
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    const w = pending.get(m.id); if (!w) return; clearTimeout(w.t); pending.delete(m.id)
    m.error ? w.r(new Error(JSON.stringify(m.error))) : w.d(m.result)
  })
  const send = (method, params = {}) => new Promise((d, r) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); r(new Error('timeout ' + method)) }, 20000); pending.set(id, { d, r, t }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  await send('Runtime.enable'); await send('Page.enable'); return { send, evaluate, close: () => ws.close() }
}
const shot = async (name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(shots, name), Buffer.from(data, 'base64')) }
const record = (m) => console.log('PASS ' + m)
const KEY = 'checkin-dashboard:data'

try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  await waitFor(async () => (await fetch(origin)).ok, 'preview down')
  launch(browser, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${debugPort}`,'--remote-debugging-address=127.0.0.1','about:blank'])
  await waitFor(async () => (await fetch(`${dbg}/json/list`)).ok, 'debug down')
  const targets = await (await fetch(`${dbg}/json/list`)).json()
  page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: origin })
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'app not ready')
  await delay(400)

  // 1. 干净的库：没有孤儿记录 → 整块不渲染
  assert.equal(await page.evaluate("document.querySelectorAll('.orphans').length"), 0, 'orphan block should be hidden with no orphans')
  record('没有孤儿记录时，清理区块不渲染（不诱导误点）')

  // 2. 塞一份带孤儿记录的 v6 数据：gone-com / also-gone 已不在 sites 里
  await page.evaluate(`(() => {
    const data = {
      version: 6,
      sites: [{ id: 'a', name: 'A', url: 'https://a.com' }],
      records: {
        '2026-10-20': ['a', 'gone-com'],
        '2026-10-21': ['gone-com', 'also-gone'],
        '2026-10-22': ['a'],
      },
      todos: {}, targets: {},
      preferences: { theme: 'auto', effects: 'full', compact: false, appearance: 'dark' },
    }
    localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(data))
  })()`)
  await page.send('Page.reload')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'reload failed')
  await delay(400)

  // 3. 区块出现，且数字和事实一致（3 条、2 个站点、2 天）
  await waitFor(() => page.evaluate("document.querySelectorAll('.orphans').length === 1"), 'orphan block missing')
  const title = await page.evaluate("document.querySelector('.orphans__title').textContent")
  assert.match(title, /3 条/, 'orphan entry count should be 3: ' + title)
  const hint = await page.evaluate("document.querySelector('.orphans__hint').textContent")
  assert.match(hint, /2 个已删除站点/, 'site count should be 2: ' + hint)
  assert.match(hint, /涉及 2 天/, 'day count should be 2: ' + hint)
  await shot('01-orphans.png')
  record(`孤儿区块报数正确：${title.trim()}（2 个站点 / 2 天）`)

  // 3.5 浅色外观下也要看得清（--warn 在亮色变量组里有单独覆盖，不能用深色那个亮橙）
  await page.evaluate(`document.querySelector('details.settings')?.setAttribute('open', '')`)
  await delay(100)
  await page.evaluate(`(() => { const el = document.querySelector('select[aria-label="明暗外观"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'light'); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate("document.documentElement.dataset.appearance === 'light'"), 'light mode did not switch')
  await delay(400)
  const warn = await page.evaluate("(() => { const v = getComputedStyle(document.querySelector('.orphans__title')).color; const p = v.match(/rgba?\\(([^)]+)\\)/)[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2] } })()")
  assert.ok(warn.r < 220, 'warning text should use the darker light-mode color: ' + JSON.stringify(warn))
  await shot('02-orphans-light.png')
  record(`浅色下标题用深色警示色 rgb(${warn.r},${warn.g},${warn.b})，不是浅色底上的亮橙`)
  // 切回深色，后续断言不受外观影响
  await page.evaluate(`(() => { const el = document.querySelector('select[aria-label="明暗外观"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'dark'); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate("document.documentElement.dataset.appearance === 'dark'"), 'dark mode did not switch back')
  await delay(200)

  // 4. 孤儿记录此刻确实在 localStorage 里
  const before = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).records`)
  assert.deepEqual(before['2026-10-21'], ['gone-com', 'also-gone'])
  record('清理前：孤儿记录确实留在存储里（删卡片不删历史，符合设计）')

  // 5. 点清理（headless 下 confirm 默认返回 false，先替身成 true）
  await page.evaluate("window.confirm = () => true")
  await page.evaluate("document.querySelector('.orphans .btn').click()")
  await waitFor(() => page.evaluate("document.querySelectorAll('.orphans').length === 0"), 'orphan block did not disappear')

  // 6. 落盘结果：孤儿被剔除、有效记录保留、只剩孤儿的日期整个 key 消失
  const after = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).records`)
  assert.deepEqual(after, {
    '2026-10-20': ['a'],
    '2026-10-22': ['a'],
  })
  record('清理后：孤儿全部剔除，有效记录保留，只剩孤儿的日期 key 被删除')

  // 7. 提示文案确认动作发生
  const notice = await page.evaluate("document.querySelector('.notice')?.textContent ?? ''")
  assert.match(notice, /已清理 3 条/, 'notice should report 3 entries: ' + notice)
  record('顶部提示「已清理 3 条历史残留记录」')

  // 8. 刷新后依然干净（真的写盘了，不是只改了内存）
  await page.send('Page.reload')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'reload failed')
  await delay(300)
  assert.equal(await page.evaluate("document.querySelectorAll('.orphans').length"), 0, 'orphans came back after reload')
  const persisted = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).records`)
  assert.deepEqual(persisted, { '2026-10-20': ['a'], '2026-10-22': ['a'] })
  record('刷新后仍然干净（已写入 localStorage，不是内存态）')

  // 9. 清空站点后全部记录都算孤儿（边界：点列表为空）
  await page.evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}))
    data.sites = []
    data.records = { '2026-10-20': ['a'] }
    localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(data))
  })()`)
  await page.send('Page.reload')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'reload failed')
  await delay(300)
  const emptyHint = await page.evaluate("document.querySelector('.orphans__hint')?.textContent ?? ''")
  assert.match(emptyHint, /1 个已删除站点/, 'all records should be orphans when no sites: ' + emptyHint)
  record('站点清空时所有历史都判为孤儿（不依赖「有不存在的 id」这种特殊条件）')

  // 10. 数据版本没被这次操作改动
  assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).version`), 6)
  record('清理不涉及数据结构变更，版本仍为 6')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL ORPHAN CHECKS PASSED')
  console.log('screenshots:', shots)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
