/**
 * 「一键打开未签到」的浏览器验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:open` 运行。
 *
 * 为什么把 window.open 换成桩：真实弹窗会被浏览器拦截策略左右（一次点击通常只放行一个），
 * 结果取决于浏览器和设置，没法稳定断言。这里验的是**组件自己的逻辑**：
 * 开哪些站、按什么顺序、有没有断开 opener、被拦时提示对不对。
 *
 * 覆盖：
 *   1. 按钮数字 = 未签到且未暂停的站点数（已签、已暂停都不算）
 *   2. 点击后按网格顺序逐个 window.open，且每个新窗口的 opener 被置 null
 *   3. 不受当前筛选影响（筛到某个分类，数字和打开的站点不变）
 *   4. 部分被拦截（open 返回 null）→ 提示「已打开 X 个，Y 个被浏览器拦截」
 *   5. 超过 10 个时先 confirm，取消则一个都不开
 *   6. 全部签完 → 按钮消失
 *
 * 前置：`dist/` 已经构建（本脚本只跑 `vite preview`，不负责 build）。
 * 用法：node scripts/open-pending-check.mjs        （可用 CHROME_PATH 指定浏览器）
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
assert(browser && existsSync(browser), 'Set CHROME_PATH to a Chrome/Chromium executable')

const profile = await mkdtemp(join(tmpdir(), 'open-pending-verify-'))
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const port = await freePort(); const debugPort = await freePort()
const origin = `http://127.0.0.1:${port}`; const dbg = `http://127.0.0.1:${debugPort}`
const children = []; const failures = []

const launch = (c, a) => { const x = spawn(c, a, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); x.on('error', (e) => failures.push(e.message)); children.push(x); return x }
const waitFor = async (fn, msg, t = 20000) => { const end = Date.now() + t; let e; while (Date.now() < end) { try { if (await fn()) return } catch (x) { e = x } await delay(60) } throw new Error(msg + (e ? ': ' + e.message : '')) }

let page
async function connect(addr) {
  const ws = new WebSocket(addr)
  await new Promise((d, r) => { ws.addEventListener('open', d, { once: true }); ws.addEventListener('error', r, { once: true }) })
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true })
    const w = pending.get(m.id); if (!w) return; clearTimeout(w.t); pending.delete(m.id)
    m.error ? w.r(new Error(JSON.stringify(m.error))) : w.d(m.result)
  })
  const send = (method, params = {}) => new Promise((d, r) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); r(new Error('timeout ' + method)) }, 20000); pending.set(id, { d, r, t }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  await send('Runtime.enable'); await send('Page.enable')
  return { send, evaluate, close: () => ws.close() }
}

const KEY = 'checkin-dashboard:data'
const store = `JSON.parse(localStorage.getItem('${KEY}'))`
const todayExpr = "(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })()"
const ready = () => waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls') && !document.querySelector('.dashboard-controls').disabled"), 'page not ready')
const record = (m) => console.log('PASS ' + m)
const findButton = "[...document.querySelectorAll('.open-pending button')].find((b) => b.textContent.startsWith('一键打开未签到'))"
const buttonText = () => page.evaluate(`${findButton}?.textContent ?? null`)

/** 改存储再刷新：模拟「用户之前已签了某些站 / 暂停了某些站」 */
const seed = async (mutate) => {
  await page.evaluate(`(() => { const data = ${store}; const today = ${todayExpr}; (${mutate})(data, today); localStorage.setItem('${KEY}', JSON.stringify(data)) })()`)
  await page.send('Page.reload')
  await delay(300)
}

/** 把 window.open 换成桩：前 allow 次返回假窗口对象，之后返回 null（模拟被拦截） */
const stubOpen = (allow) => page.evaluate(`(() => {
  window.__opened = []
  window.open = (url, target, features) => {
    const tab = { opener: 'parent' }
    window.__opened.push({ url, target, features: features ?? null, tab })
    return window.__opened.length <= ${allow} ? tab : null
  }
})()`)
const opened = () => page.evaluate('window.__opened.map((o) => ({ url: o.url, target: o.target, features: o.features, openerCleared: o.tab.opener === null }))')
const click = () => page.evaluate(`${findButton}.click()`)
const noticeText = () => page.evaluate("document.querySelector('.open-pending .notice')?.textContent ?? null")

try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  await waitFor(async () => (await fetch(origin)).ok, 'preview down (did you build dist/?)')
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${dbg}/json/list`)).ok, 'debug down')
  const targets = await (await fetch(`${dbg}/json/list`)).json()
  page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1200, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: origin })
  await ready()
  await waitFor(() => page.evaluate(`${store}?.sites?.length === 6`), 'initial seed not saved')

  /* ---------- 1. 计数：已签 jd、暂停 taobao → 6 - 2 = 4 ---------- */
  await seed(`(data, today) => {
    data.records[today] = ['jd-com']
    data.sites.find((s) => s.id === 'taobao-com').paused = true
  }`)
  await ready()
  assert.equal(await buttonText(), '一键打开未签到（4）')
  record('按钮数字排除已签到和已暂停：一键打开未签到（4）')

  /* ---------- 2. 打开顺序 + opener 断开 + 全部放行时无提示 ---------- */
  await stubOpen(99)
  await click()
  await delay(100)
  const all = await opened()
  assert.deepEqual(all.map((o) => o.url), ['https://www.bilibili.com', 'https://music.163.com', 'https://www.smzdm.com', 'https://github.com'])
  assert.ok(all.every((o) => o.target === '_blank' && o.features === null), 'should open in _blank without features: ' + JSON.stringify(all))
  assert.ok(all.every((o) => o.openerCleared), 'every opened tab must have opener cleared')
  assert.equal(await noticeText(), null, 'no blocked notice when all tabs opened')
  record('按网格顺序打开 4 个站，每个新窗口的 opener 都被置 null，全部放行时无提示')

  const stored = await page.evaluate(`${store}.records[${todayExpr}]`)
  assert.deepEqual(stored, ['jd-com'], 'opening must not check anything in: ' + JSON.stringify(stored))
  record('只打开不打勾：今天的签到记录仍只有 jd-com')

  /* ---------- 3. 不受筛选影响 ---------- */
  await page.evaluate(`[...document.querySelectorAll('.filter .chip')].find((b) => b.textContent === '开发').click()`)
  await delay(150)
  assert.equal(await page.evaluate("document.querySelectorAll('[data-site-id]').length"), 1, 'filter should leave 1 card visible')
  assert.equal(await buttonText(), '一键打开未签到（4）')
  await stubOpen(99)
  await click()
  await delay(100)
  assert.equal((await opened()).length, 4, 'filtered view should still open all pending sites')
  record('筛到「开发」只剩 1 张卡时，按钮仍是 4 且打开全部 4 个')

  /* ---------- 4. 部分被拦截 → 提示 ---------- */
  await stubOpen(1)
  await click()
  await delay(150)
  const blockedNotice = await noticeText()
  assert.ok(blockedNotice?.includes('已打开 1 个，3 个被浏览器拦截'), 'blocked notice: ' + blockedNotice)
  record(`部分被拦截时提示：「${blockedNotice.replace('×', '').trim()}」`)

  /* ---------- 5. 超过 10 个 → confirm，取消则不开 ---------- */
  await seed(`(data, today) => {
    data.records[today] = []
    for (let i = 1; i <= 6; i += 1) data.sites.push({ id: 's' + i + '-example-com', name: 'S' + i, url: 'https://s' + i + '.example.com', category: '测试' })
    data.sites.forEach((s) => { s.paused = false })
  }`)
  await ready()
  assert.equal(await buttonText(), '一键打开未签到（12）')
  await stubOpen(99)
  await page.evaluate('window.__confirms = []; window.confirm = (msg) => { window.__confirms.push(msg); return false }')
  await click()
  await delay(100)
  assert.deepEqual(await page.evaluate('window.__confirms'), ['将打开 12 个标签页，确定吗？'])
  assert.equal((await opened()).length, 0, 'cancelled confirm must open nothing')
  await page.evaluate('window.confirm = () => true')
  await click()
  await delay(100)
  assert.equal((await opened()).length, 12)
  record('12 个站点时先确认：取消 → 0 个，确认 → 12 个')

  /* ---------- 6. 全部签完 → 按钮消失 ---------- */
  await seed(`(data, today) => { data.records[today] = data.sites.map((s) => s.id) }`)
  await ready()
  assert.equal(await page.evaluate("document.querySelector('.open-pending')"), null, 'button must disappear when everything is checked')
  record('全部签完后按钮不渲染')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL OPEN-PENDING CHECKS PASSED')
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
