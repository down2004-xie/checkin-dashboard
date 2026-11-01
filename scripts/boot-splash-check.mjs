/**
 * 启动画面（index.html 内联的 .boot-splash）的浏览器验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:boot` 运行。
 *
 * 为什么逐帧采样：启动画面只存在几百毫秒，用 CDP 轮询来不及看清。
 * 这里用 addScriptToEvaluateOnNewDocument 在页面最早期注入一个 requestAnimationFrame 采样器，
 * 每一帧记下「启动画面在不在、内容透明度、五片花瓣各自的透明度和动画名」，挂载完成后停止。
 * rAF 只在真正渲染的帧上触发，采到的就是用户看得到的画面。
 *
 * 覆盖：
 *   1. 正常网速：React 挂载后启动画面被清空、不和页面同时出现；报告挂载耗时和期间最大透明度
 *   2. 慢网（CDP 限速）：第一帧内容透明（延迟期）→ 淡入到 1；五片花瓣轮流亮
 *      （同一帧里亮度有明显差，且「最亮的那片」在变），挂载后启动画面消失
 *   3. 慢网 + prefers-reduced-motion：花瓣不动画、全亮（静止的花），文字照常淡入
 *
 * 截图存到 shots/boot-splash/（已 gitignore），用来人工看效果。
 * 前置：`dist/` 已经构建（本脚本只跑 `vite preview`，不负责 build）；可用 PREVIEW_OUT_DIR 指定别的构建目录。
 * 用法：node scripts/boot-splash-check.mjs        （可用 CHROME_PATH 指定浏览器）
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
assert(browser && existsSync(browser), 'Set CHROME_PATH to a Chrome/Chromium executable')

const profile = await mkdtemp(join(tmpdir(), 'boot-splash-verify-'))
const artifacts = resolve(workspace, 'shots', 'boot-splash')
await mkdir(artifacts, { recursive: true })
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const port = await freePort(); const debugPort = await freePort()
const origin = `http://127.0.0.1:${port}`; const dbg = `http://127.0.0.1:${debugPort}`
const children = []; const failures = []

const launch = (c, a) => { const x = spawn(c, a, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); x.on('error', (e) => failures.push(e.message)); children.push(x); return x }
const waitFor = async (fn, msg, t = 20000) => { const end = Date.now() + t; let e; while (Date.now() < end) { try { if (await fn()) return } catch (x) { e = x } await delay(30) } throw new Error(msg + (e ? ': ' + e.message : '')) }

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
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  return { send, evaluate, close: () => ws.close() }
}

/** 每个渲染帧采一次样；页面挂载（.dashboard-controls 出现且启动画面已不在）后停 */
const SAMPLER = `(() => {
  window.__boot = { frames: [], overlap: false, mountedAt: null }
  const tick = () => {
    const splash = document.querySelector('.boot-splash')
    const app = document.querySelector('.dashboard-controls')
    if (splash && app) window.__boot.overlap = true
    if (splash) {
      const content = getComputedStyle(splash.querySelector('.boot-splash__content'))
      const flower = getComputedStyle(splash.querySelector('.boot-splash__flower'))
      const petals = [...splash.querySelectorAll('.boot-splash__petals use')].map((p) => getComputedStyle(p))
      window.__boot.frames.push({
        t: Math.round(performance.now()),
        opacity: Number(content.opacity),
        flowerDisplay: flower.display,
        petalOpacity: petals.map((p) => Number(p.opacity)),
        petalAnimation: petals.map((p) => p.animationName),
      })
    }
    if (app && !splash) { window.__boot.mountedAt = Math.round(performance.now()); return }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const record = (m) => console.log('PASS ' + m)
/** zoom：只截 .boot-splash__content 周围一圈并放大 2 倍，看得清花瓣细节 */
const shoot = async (name, zoom = false) => {
  const rect = zoom && await page.evaluate("(() => { const r = document.querySelector('.boot-splash__content')?.getBoundingClientRect(); return r && { x: r.left, y: r.top, width: r.width, height: r.height } })()")
  const clip = rect ? { x: rect.x - 80, y: rect.y - 50, width: rect.width + 160, height: rect.height + 100, scale: 2 } : undefined
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip && { clip }) })
  await writeFile(join(artifacts, name), Buffer.from(data, 'base64'))
}
// 慢网参数：带宽够低，启动画面才能停留到淡入完成（300 ms 延迟 + 400 ms 淡入）之后
const SLOW = { offline: false, latency: 300, downloadThroughput: 64 * 1024, uploadThroughput: 64 * 1024 }
const FAST = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }

let runId = 0
/** 每次导航带不同的 ?run=N，避免读到上一次页面里的 __boot */
async function boot({ network, reducedMotion, screenshot, zoom }) {
  const run = `?run=${++runId}`
  await page.send('Network.emulateNetworkConditions', network)
  await page.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] })
  await page.send('Page.navigate', { url: origin + '/' + run })
  const thisRun = `location.search === '${run}'`
  if (screenshot) {
    await waitFor(() => page.evaluate(`${thisRun} && Number(getComputedStyle(document.querySelector('.boot-splash__content')).opacity) === 1`), 'splash never fully faded in before mount (throttle too fast?)', 30000)
    await shoot(screenshot, zoom)
  }
  await waitFor(() => page.evaluate(`${thisRun} && window.__boot?.mountedAt != null`), 'app never mounted (splash stuck?)', 30000)
  const result = await page.evaluate(`({ ...window.__boot, firstPaint: Math.round(performance.getEntriesByName('first-paint')[0]?.startTime ?? -1), splashLeft: !!document.querySelector('.boot-splash') })`)
  const opacities = result.frames.map((f) => f.opacity)
  const fadedAt = result.frames.find((f) => f.opacity === 1)?.t ?? null
  console.log(`  [${run}] 首次绘制 ${result.firstPaint} ms · 启动画面 ${result.frames.length} 帧（${result.frames[0]?.t ?? '-'} → ${result.frames.at(-1)?.t ?? '-'} ms）· 淡入完成 ${fadedAt ?? '未完成'} · 挂载 ${result.mountedAt} ms · 最大透明度 ${opacities.length ? Math.max(...opacities) : 0}`)
  return { ...result, opacities }
}

try {
  const preview = ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  if (process.env.PREVIEW_OUT_DIR) preview.push('--outDir', process.env.PREVIEW_OUT_DIR)
  launch(process.execPath, preview)
  await waitFor(async () => (await fetch(origin)).ok, 'preview down (did you build dist/?)')
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${dbg}/json/list`)).ok, 'debug down')
  const targets = await (await fetch(`${dbg}/json/list`)).json()
  page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SAMPLER })

  /* ---------- 1. 正常网速 ---------- */
  const fast = await boot({ network: FAST })
  assert.equal(fast.overlap, false, 'splash and app must never be on screen together')
  assert.equal(fast.splashLeft, false, 'React mount must clear the splash')
  record(`正常网速：挂载后启动画面被清空，期间最大透明度 ${Math.max(0, ...fast.opacities)}（0 = 用户看不到樱花）`)

  /* ---------- 2. 慢网：延迟 → 淡入 → 花瓣轮流亮 → 挂载后消失 ---------- */
  const slow = await boot({ network: SLOW, screenshot: 'slow-network.png', zoom: true })
  assert.ok(slow.frames.length > 0, 'splash should be rendered on a slow network')
  assert.equal(slow.opacities[0], 0, 'first visible frame should still be in the 300 ms delay (opacity 0), got ' + slow.opacities[0])
  assert.ok(slow.opacities.every((o, i) => i === 0 || o >= slow.opacities[i - 1]), 'opacity must only fade in, never flicker: ' + slow.opacities.join(','))
  assert.equal(Math.max(...slow.opacities), 1, 'content should fully fade in while waiting')
  assert.ok(slow.frames.every((f) => f.flowerDisplay !== 'none' && f.petalAnimation.length === 5 && f.petalAnimation.every((a) => a === 'boot-splash-glow')), 'all 5 petals must be visible and animating')
  // 「轮流亮」而不是「一起闪」：同一帧里最亮和最暗的花瓣要有明显差距，且最亮的那片会换
  const shown = slow.frames.filter((f) => f.opacity === 1)
  const spread = Math.max(...shown.map((f) => Math.max(...f.petalOpacity) - Math.min(...f.petalOpacity)))
  const brightest = new Set(shown.map((f) => f.petalOpacity.indexOf(Math.max(...f.petalOpacity))))
  assert.ok(spread > 0.5, 'petals should light up one by one, max spread in a frame was ' + spread.toFixed(2))
  assert.ok(brightest.size >= 2, 'the brightest petal should move around, saw only petal(s) ' + [...brightest])
  assert.equal(slow.overlap, false, 'splash and app must never be on screen together')
  assert.equal(slow.splashLeft, false, 'React mount must clear the splash')
  record(`慢网：第一帧透明（延迟期）→ 平滑淡入到 1；花瓣轮流亮（同帧亮度差最大 ${spread.toFixed(2)}，最亮的依次是第 ${[...brightest].map((i) => i + 1).join('→')} 片），挂载后消失`)

  /* ---------- 3. 慢网 + 减少动效 ---------- */
  const reduced = await boot({ network: SLOW, reducedMotion: true, screenshot: 'reduced-motion.png' })
  assert.ok(reduced.frames.length > 0, 'splash should be rendered')
  assert.ok(reduced.frames.every((f) => f.flowerDisplay !== 'none'), 'flower should still be shown under prefers-reduced-motion')
  assert.ok(reduced.frames.every((f) => f.petalAnimation.every((a) => a === 'none') && f.petalOpacity.every((o) => o === 1)), 'petals must be static and fully lit under prefers-reduced-motion')
  assert.equal(Math.max(...reduced.opacities), 1, 'text should still fade in')
  assert.equal(reduced.splashLeft, false, 'React mount must clear the splash')
  record('减少动效：花瓣不轮流亮，显示一朵全亮的静止樱花，挂载后照样消失')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log(`\n截图：${artifacts}`)
  console.log('ALL BOOT-SPLASH CHECKS PASSED')
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
