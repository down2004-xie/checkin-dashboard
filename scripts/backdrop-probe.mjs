/**
 * 只用本机已装的 Chrome/Edge 探测：backdrop-filter 是否真的支持 url(#svgFilter)。
 *
 * 本脚本位于 scripts/，通过 `npm run probe:backdrop` 运行。
 *
 * 判断方法（不靠文档、不靠猜）：
 *   同一块区域截三次图 —— 无滤镜 / blur(8px) / url(#disp)，
 *   比较截图的字节哈希。
 *   - blur 必须让哈希变化 → 证明这套「截图比对」检测手段本身有效（正对照）
 *   - url(#disp) 若与「无滤镜」字节完全相同 → 该浏览器其实没应用这个滤镜
 *
 * 背景用黑白竖条纹：模糊或位移都会明显改变像素，比渐变更容易看出来。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)
const browser = candidates.find(existsSync)
const firefox = [
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
].find(existsSync)

if (!browser) {
  console.error('没有找到本机已装的 Chrome/Edge')
  process.exit(1)
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const profile = await mkdtemp(join(tmpdir(), 'backdrop-probe-'))
const outDir = await mkdtemp(join(tmpdir(), 'backdrop-shots-'))
const debugPort = await freePort()
const dbg = `http://127.0.0.1:${debugPort}`
const children = []

const launch = (c, a) => { const x = spawn(c, a, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(x); return x }
const waitFor = async (fn, msg, t = 20000) => { const end = Date.now() + t; let last; while (Date.now() < end) { try { if (await fn()) return } catch (e) { last = e } await delay(80) } throw new Error(msg + (last ? ': ' + last.message : '')) }

async function connect(addr) {
  const ws = new WebSocket(addr)
  await new Promise((d, r) => { ws.addEventListener('open', d, { once: true }); ws.addEventListener('error', r, { once: true }) })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    const w = pending.get(m.id)
    if (!w) return
    clearTimeout(w.t)
    pending.delete(m.id)
    m.error ? w.r(new Error(JSON.stringify(m.error))) : w.d(m.result)
  })
  const send = (method, params = {}) => new Promise((d, r) => {
    const id = ++seq
    const t = setTimeout(() => { pending.delete(id); r(new Error('timeout ' + method)) }, 20000)
    pending.set(id, { d, r, t })
    ws.send(JSON.stringify({ id, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  return { send, close: () => ws.close() }
}

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; }
  body { background: repeating-linear-gradient(90deg, #000 0 20px, #fff 20px 40px); }
  #target { position: absolute; left: 120px; top: 120px; width: 240px; height: 240px; background: transparent; }
  svg { position: absolute; }
</style></head><body>
  <svg width="0" height="0">
    <filter id="disp" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="60" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </svg>
  <div id="target"></div>
</body></html>`

try {
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${dbg}/json/list`)).ok, 'debug down')
  const targets = await (await fetch(`${dbg}/json/list`)).json()
  const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)

  const version = await page.send('Browser.getVersion')
  const evaluate = async (expr) => {
    const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }

  await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(HTML) })
  await delay(400)

  const clip = { x: 120, y: 120, width: 240, height: 240, scale: 1 }
  const save = async (name) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(outDir, name), Buffer.from(data, 'base64'))
    return createHash('sha1').update(Buffer.from(data, 'base64')).digest('hex').slice(0, 12)
  }
  const setFilter = (value) => evaluate(`document.getElementById('target').style.backdropFilter = ${JSON.stringify(value)}; document.getElementById('target').style.webkitBackdropFilter = ${JSON.stringify(value)}; 1`)
  const settle = () => delay(250)

  await setFilter('none'); await settle()
  const none = await save('01-none.png')

  await setFilter('blur(8px)'); await settle()
  const blur = await save('02-blur.png')

  await setFilter('url(#disp)'); await settle()
  const url = await save('03-url-disp.png')

  const supports = await evaluate(`({ plain: CSS.supports('backdrop-filter', 'url(#disp)'), webkit: CSS.supports('-webkit-backdrop-filter', 'url(#disp)') })`)

  console.log('browser        :', version.product)
  console.log('firefox on disk:', firefox ?? '(未安装)')
  console.log('screenshot hashes (same region):')
  console.log('  none         :', none)
  console.log('  blur(8px)    :', blur, none === blur ? '← 和 none 相同（检测手段失效）' : '← 变化了（检测手段有效）')
  console.log('  url(#disp)   :', url, none === url ? '← 和 none 相同（该浏览器未应用）' : '← 和 none 不同（生效了）')
  console.log('CSS.supports   :', supports)

  const blurWorks = none !== blur
  const urlWorks = none !== url
  console.log('\n结论：')
  if (!blurWorks) console.log('  ✗ 正对照失败：截图比对没测出 blur 的差异，这个探针不可信')
  else if (!urlWorks) console.log('  ✗ backdrop-filter: url(#svgFilter) 在本机 Chromium 上不生效（解析通过但渲染忽略）')
  else console.log('  ✓ backdrop-filter: url(#svgFilter) 在本机 Chromium 上生效')
  console.log('  注：只能代表这一个浏览器引擎；Firefox/Safari 未验。')
  console.log('screenshots    :', outDir)

  page.close()
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
