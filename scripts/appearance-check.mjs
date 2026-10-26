/**
 * 明暗外观（appearance）的自动化验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:appearance` 运行。
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
const profile = await mkdtemp(join(tmpdir(), 'appearance-'))
const shots = await mkdtemp(join(tmpdir(), 'appearance-shots-'))
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
const q = JSON.stringify
const shot = async (name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(shots, name), Buffer.from(data, 'base64')) }
const record = (m) => console.log('PASS ' + m)

// 读某个元素的实际背景/文字颜色（computed）
const rgb = async (sel, prop) => page.evaluate(`(() => { const el = document.querySelector(${q(sel)}); if (!el) return null; const v = getComputedStyle(el).${prop}; const m = v.match(/rgba?\\(([^)]+)\\)/); if (!m) return v; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } })()`)

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

  // 1. 默认是深色
  assert.equal(await page.evaluate("document.documentElement.dataset.appearance"), 'dark')
  const darkText = await rgb('body', 'color')
  assert.ok(darkText && darkText.r > 200, 'dark text should be light: ' + JSON.stringify(darkText))
  await shot('01-dark.png')
  record('默认 appearance=dark，正文为浅色文字')

  // 2. 切到浅色（通过设置面板的真实 select）
  await page.evaluate(`document.querySelector('details.settings')?.setAttribute('open', '')`)
  await delay(100)
  await page.evaluate(`(() => { const el = document.querySelector('select[aria-label="明暗外观"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'light'); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate("document.documentElement.dataset.appearance === 'light'"), 'appearance did not switch')
  await delay(500) // 等背景过渡

  // 3. 浅色下：文字应变深
  const lightText = await rgb('body', 'color')
  assert.ok(lightText && lightText.r < 80, 'light text should be dark: ' + JSON.stringify(lightText))
  // 4. 背景应变浅
  const bg1 = await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg-1').trim()")
  const lum = (hex) => { const v = hex.replace('#','').trim(); const r = parseInt(v.slice(0,2),16), g = parseInt(v.slice(2,4),16), b = parseInt(v.slice(4,6),16); return 0.299*r + 0.587*g + 0.114*b }
  assert.ok(lum(bg1) > 200, 'light bg should be bright: ' + bg1)
  // 5. 卡片玻璃在浅色下应是白色半透明
  const cardBg = await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--glass-bg').trim()")
  assert.match(cardBg, /^rgba\(255,\s*255,\s*255/, 'light glass-bg should be white-based: ' + cardBg)
  await shot('02-light.png')
  record(`切换浅色：文字 rgb(${lightText.r},${lightText.g},${lightText.b})、--bg-1=${bg1}、玻璃底为白色系`)

  // 6. 工具箱在浅色下也正常（切到工具箱视图）
  await page.evaluate(`[...document.querySelectorAll('.view-switch__btn')].find(b => b.textContent.trim() === '工具箱').click()`)
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'toolbox not shown')
  const toolText = await rgb('.tool-card__name', 'color')
  assert.ok(toolText && toolText.r < 80, 'toolbox text should be dark in light mode: ' + JSON.stringify(toolText))
  await shot('03-light-toolbox.png')
  record('浅色下工具箱文字同样为深色（无白字白底）')

  // 7. 刷新后浅色仍保留（持久化）
  await page.send('Page.reload')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'reload failed')
  await delay(300)
  assert.equal(await page.evaluate("document.documentElement.dataset.appearance"), 'light', 'appearance not persisted')
  record('刷新后浅色外观保持（写入 preferences 并持久化）')

  // 8. 切回深色再确认
  await page.evaluate(`document.querySelector('details.settings')?.setAttribute('open', '')`)
  await delay(100)
  await page.evaluate(`(() => { const el = document.querySelector('select[aria-label="明暗外观"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'dark'); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate("document.documentElement.dataset.appearance === 'dark'"), 'switch back failed')
  await delay(400)
  const backText = await rgb('body', 'color')
  assert.ok(backText && backText.r > 200, 'switch back to dark failed')
  record('切回深色正常')

  // 9. 数据版本是 6
  const ver = await page.evaluate("JSON.parse(localStorage.getItem('checkin-dashboard:data')).version")
  assert.equal(ver, 6)
  record('数据契约版本为 6（appearance 已入库）')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL APPEARANCE CHECKS PASSED')
  console.log('screenshots:', shots)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
