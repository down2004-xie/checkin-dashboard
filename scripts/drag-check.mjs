/**
 * 拖拽排序（pointer-based drag-to-reorder）的自动化验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:drag` 运行。
 *
 * 为什么必须用 CDP 的 Input.dispatchMouseEvent 而不是 `element.dispatchEvent(new PointerEvent(...))`：
 * 卡片把手在 pointerdown 时调用了 `setPointerCapture`，而**合成 PointerEvent 不会触发
 * 指针捕获**，后续的 pointermove / pointerup 不会按真实事件流走 —— 项目里已经踩过这个坑。
 * 真实鼠标事件会经过浏览器的命中测试与 pointer capture，才和用户手指/鼠标等价。
 *
 * 覆盖：
 *   1. 手动顺序下把 bilibili 拖到 taobao 的位置 → 存储顺序变成目标位置
 *   2. 先把 github 置顶，再把普通站拖到置顶卡上 → 存储顺序完全不变（跨置顶边界拒绝）
 *
 * 前置：`dist/` 已经构建（本脚本只跑 `vite preview`，不负责 build）。
 * 用法：node scripts/drag-check.mjs        （可用 CHROME_PATH 指定浏览器）
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

const profile = await mkdtemp(join(tmpdir(), 'drag-verify-'))
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

const q = JSON.stringify
const store = "JSON.parse(localStorage.getItem('checkin-dashboard:data'))"
const ready = () => waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls') && !document.querySelector('.dashboard-controls').disabled"), 'page not ready')
const record = (m) => console.log('PASS ' + m)
const siteIds = () => page.evaluate(`${store}.sites.map(s => s.id)`)

/**
 * 真实鼠标拖拽：按住 fromSelector 的中心 → 分步移动 → 在 toSelector 的中心松开。
 * 分步是必须的：pointermove 至少要有一帧超过 4px 阈值，否则组件判定为「误触」不启动拖拽。
 */
const drag = async (fromSelector, toSelector) => {
  const points = await page.evaluate(`(() => {
    const from = document.querySelector(${q(fromSelector)})
    const to = document.querySelector(${q(toSelector)})
    if (!from || !to) return null
    const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect()
    return { x1: a.x + a.width / 2, y1: a.y + a.height / 2, x2: b.x + b.width / 2, y2: b.y + b.height / 2 }
  })()`)
  assert.ok(points, 'drag endpoints missing: ' + fromSelector + ' -> ' + toSelector)
  const x1 = Math.round(points.x1), y1 = Math.round(points.y1)
  const x2 = Math.round(points.x2), y2 = Math.round(points.y2)

  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 })
  await delay(60)

  const steps = 8
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(x1 + (x2 - x1) * t),
      y: Math.round(y1 + (y2 - y1) * t),
      button: 'left',
      buttons: 1,
    })
    await delay(40)
  }

  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 })
  await delay(200)
}

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
  await waitFor(() => page.evaluate(`${store}?.version === 6`), 'initial data not saved')

  /* ---------- 0. 切到手动顺序，确认每张卡都有拖拽把手 ---------- */
  await page.evaluate(`(() => {
    const select = document.querySelector('select[aria-label="站点排序"]')
    if (!select) throw new Error('sort select missing')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'manual')
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await delay(150)
  const handles = await page.evaluate("document.querySelectorAll('.card__handle').length")
  assert.equal(handles, 6, 'manual order should render one drag handle per card, got ' + handles)
  record('手动顺序下每张卡片都渲染拖拽把手（6 个）')

  const initial = await siteIds()
  assert.deepEqual(initial, ['bilibili-com', 'jd-com', 'taobao-com', 'music-163-com', 'smzdm-com', 'github-com'], 'unexpected seed order: ' + JSON.stringify(initial))

  /* ---------- 1. 把 bilibili 拖到 taobao 的位置 ---------- */
  await drag('[data-site-id="bilibili-com"] .card__handle', '[data-site-id="taobao-com"]')
  // reducer 语义：向下拖时目标被抽走后上移一格，所以插入点是 to - 1，
  // 结果是「被拖项占据目标原来的格子，目标顺延一位」。
  const expectedAfterDrag = ['jd-com', 'bilibili-com', 'taobao-com', 'music-163-com', 'smzdm-com', 'github-com']
  await waitFor(async () => JSON.stringify(await siteIds()) === JSON.stringify(expectedAfterDrag), 'drag reorder not saved: ' + JSON.stringify(await siteIds()))
  record(`向下拖拽：bilibili 落到 taobao 的位置，顺序变为 ${expectedAfterDrag.join(' / ')}`)

  /* ---------- 2. 负向：跨置顶边界的落点必须被拒绝 ---------- */
  await page.evaluate(`(() => {
    const card = document.querySelector('[data-site-id="github-com"]')
    if (!card) throw new Error('github card missing')
    card.querySelector('details.card__manage > summary').click()
  })()`)
  await delay(80)
  await page.evaluate(`(() => {
    const card = document.querySelector('[data-site-id="github-com"]')
    const button = [...card.querySelectorAll('button')].find((b) => b.textContent.trim() === '置顶')
    if (!button) throw new Error('pin button missing')
    button.click()
  })()`)
  await waitFor(() => page.evaluate(`(${store}.sites.find(s => s.id === 'github-com')?.pinned) === true`), 'pin failed')
  record('通过管理面板把 github 置顶成功')

  const beforeCross = await siteIds()
  // 普通站 jd 拖到置顶卡 github 上：canReorder 返回 false，overId 保持 null，松手不产生写入
  await drag('[data-site-id="jd-com"] .card__handle', '[data-site-id="github-com"]')
  await delay(200)
  const afterCross = await siteIds()
  assert.deepEqual(afterCross, beforeCross, 'cross-pinned drag must not change storage order: ' + JSON.stringify({ beforeCross, afterCross }))
  record('跨置顶边界拖拽被拒绝：存储顺序与拖拽前完全一致')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL DRAG CHECKS PASSED')
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
