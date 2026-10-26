/**
 * 人工验收项的自动化替身（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:acceptance` 运行。
 *
 * 覆盖 PROGRESS.md「下一步 → 剩下的人工验收」里那批脚本够不着、只能手点的场景：
 *   1. 删掉一张卡片、再用同样网址加回来 → 历史能接回（站点身份不变量）
 *   2. 表单三条判重（同域名不同路径 / 只改分类 / 改网址到别的域名）
 *   3. 点卡片跳转：<a> 的 target / rel / href
 *   4. 悬停卡片时高光跟随指针（写 --mx/--my）
 *   5. v1 老备份导入 → 旧 id 被重写成域名形态，历史不丢
 *
 * 这些以前在 PROGRESS 里标着「必须人手点一次」。它们守的都是核心数据路径
 * （尤其第 1、5 条），所以值得进自动化。
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
assert(browser && existsSync(browser), 'Set CHROME_PATH to a Chrome/Chromium executable')

const profile = await mkdtemp(join(tmpdir(), 'acceptance-'))
const shots = await mkdtemp(join(tmpdir(), 'acceptance-shots-'))
await mkdir(shots, { recursive: true })
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
const reload = async () => { await page.send('Page.reload'); await delay(200); await ready() }
const click = async (selector) => {
  await waitFor(() => page.evaluate(`!!document.querySelector(${q(selector)}) && !document.querySelector(${q(selector)}).matches(':disabled')`), `missing/disabled: ${selector}`)
  await page.evaluate(`document.querySelector(${q(selector)}).click()`); await delay(90)
}
const clickText = async (text) => {
  await page.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${q(text)}); if (!el || el.disabled) throw new Error('missing button: ' + ${q(text)}); el.click() })()`); await delay(90)
}
const setFormField = async (idx, value) => page.evaluate(`(() => { const el = document.querySelectorAll('.site-form input')[${idx}]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const formError = () => page.evaluate("document.querySelector('.site-form__error')?.textContent ?? ''")
const submitForm = async () => { await page.evaluate("document.querySelector('.site-form').requestSubmit()"); await delay(150) }
const record = (m) => console.log('PASS ' + m)
const shot = async (name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(shots, name), Buffer.from(data, 'base64')) }

try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  await waitFor(async () => (await fetch(origin)).ok, 'preview down')
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${dbg}/json/list`)).ok, 'debug down')
  const targets = await (await fetch(`${dbg}/json/list`)).json()
  page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: origin })
  await ready()
  await waitFor(() => page.evaluate(`${store}?.version === 6 && Object.keys(${store}.targets).length > 0`), 'initial target snapshot not saved')
  const today = await page.evaluate(`${store} && Object.keys(${store}.targets).sort().at(-1)`)
  assert(today, 'no today key')

  /* ---------- 3. 点卡片跳转：<a> 的属性 ---------- */
  const link = await page.evaluate(`(() => { const a = document.querySelector('.card__link'); return { target: a.getAttribute('target'), rel: a.getAttribute('rel'), href: a.getAttribute('href') } })()`)
  assert.equal(link.target, '_blank', 'card link should open in a new tab: ' + JSON.stringify(link))
  assert.match(link.rel || '', /noopener/, 'card link should carry rel=noopener')
  assert.match(link.href || '', /^https?:\/\//, 'card link href should be an absolute http(s) url')
  record(`点卡片跳转：target=_blank、rel 含 noopener、href=${link.href}`)

  /* ---------- 4. 悬停高光跟随指针 ---------- */
  await page.evaluate("window.scrollTo(0, 0)")
  const box = await page.evaluate(`(() => { const r = document.querySelector('.card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(box.x + box.w / 2), y: Math.round(box.y + box.h / 2), button: 'none' })
  await delay(120) // 等一帧 rAF
  const highlight = await page.evaluate(`(() => { const c = document.querySelector('.card'); return { mx: c.style.getPropertyValue('--mx'), my: c.style.getPropertyValue('--my'), px: document.documentElement.style.getPropertyValue('--pointer-x') } })()`)
  assert.ok(highlight.mx !== '' && highlight.my !== '', 'card highlight --mx/--my should be written on pointermove: ' + JSON.stringify(highlight))
  assert.ok(highlight.px !== '', 'page pointer light --pointer-x should be written on pointermove')
  record(`悬停高光跟随：卡片写入 --mx=${highlight.mx} --my=${highlight.my}，页面光源 --pointer-x=${highlight.px}`)
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' })
  await delay(80)

  /* ---------- 1. 删掉再加能接回历史（站点身份不变量，最核心） ---------- */
  // 先给 bilibili-com 造 3 天连续历史（今天 / 昨天 / 前天）
  await page.evaluate(`(() => {
    const data = ${store}
    const d = (offset) => { const t = new Date(${q(today)} + 'T12:00:00'); t.setDate(t.getDate() + offset); return [t.getFullYear(), String(t.getMonth()+1).padStart(2,'0'), String(t.getDate()).padStart(2,'0')].join('-') }
    data.records[d(0)] = ['bilibili-com']
    data.records[d(-1)] = ['bilibili-com']
    data.records[d(-2)] = ['bilibili-com']
    localStorage.setItem('checkin-dashboard:data', JSON.stringify(data))
  })()`)
  await reload()
  await waitFor(() => page.evaluate("[...document.querySelectorAll('.card')].some(c => c.querySelector('.card__link').textContent === '哔哩哔哩')"), 'bilibili card missing')
  const streakBefore = await page.evaluate(`(() => { const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card__link').textContent === '哔哩哔哩'); return card.querySelector('.card__stat--streak')?.textContent ?? '' })()`)
  assert.match(streakBefore, /连续 3 天/, 'expected 3-day streak before delete: ' + streakBefore)

  // 删除 bilibili（confirm 由 CDP 自动确认）
  await click('button[aria-label="删除 哔哩哔哩"]')
  await waitFor(() => page.evaluate(`!${store}.sites.some(s => s.id === 'bilibili-com')`), 'site not removed')
  const afterDelete = await page.evaluate(`({ sites: ${store}.sites.length, rec: ${store}.records[${q(today)}] ?? [] })`)
  assert.ok(afterDelete.rec.includes('bilibili-com'), 'record must survive deletion (orphan, not auto-removed)')
  record('删除卡片后历史记录仍保留（孤儿记录，不自动删）')

  // 用同样网址加回来
  await clickText('＋ 添加站点')
  await setFormField(0, '哔哩哔哩')
  await setFormField(1, 'https://www.bilibili.com')
  await submitForm()
  await waitFor(() => page.evaluate(`${store}.sites.some(s => s.id === 'bilibili-com')`), 're-add failed to restore id')
  const reAdded = await page.evaluate(`(() => { const s = ${store}.sites.find(x => x.id === 'bilibili-com'); const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card__link').textContent === '哔哩哔哩'); return { url: s?.url, done: card?.classList.contains('card--done'), streak: card?.querySelector('.card__stat--streak')?.textContent ?? '', total: card?.querySelector('.card__stat:not(.card__stat--streak)')?.textContent ?? '' } })()`)
  assert.equal(reAdded.url, 'https://www.bilibili.com/') // normalizeUrl 会补结尾斜杠
  assert.equal(reAdded.done, true, 'today checkin should reconnect after re-adding')
  assert.match(reAdded.streak, /连续 3 天/, 'streak should reconnect to history after re-adding: ' + reAdded.streak)
  assert.match(reAdded.total, /累计 3 天/, 'total days should reconnect to history after re-adding: ' + reAdded.total)
  record(`删掉再加：id 恢复为 bilibili-com，今日已签接回、连续「连续 3 天」、累计「累计 3 天」`)
  await shot('01-readded.png')

  /* ---------- 2. 表单三条判重 ---------- */
  // (a) 同域名不同路径 → 提示「已经有 bilibili.com 的卡片了」
  await clickText('＋ 添加站点')
  await setFormField(0, 'B站动画区')
  await setFormField(1, 'https://www.bilibili.com/anime')
  await submitForm()
  const dupErr = await formError()
  assert.match(dupErr, /已经有「bilibili\.com」的卡片了/, 'same-host duplicate should be blocked: ' + dupErr)
  record(`表单判重 a：同域名不同路径被拦下 —— 「${dupErr}」`)
  await clickText('取消')

  // (b) 编辑只改分类不改网址 → 保存成功
  await click('button[aria-label="编辑 京东"]')
  await setFormField(2, '日常购物')
  await submitForm()
  await waitFor(() => page.evaluate(`(${store}.sites.find(s => s.id === 'jd-com')?.category) === '日常购物'`), 'category-only edit failed to save')
  assert.equal(await page.evaluate("document.querySelector('.site-form') === null"), true, 'form should close after successful save')
  record('表单判重 b：编辑只改分类、不改网址 → 保存成功（不被自己域名判成重复）')

  // (c) 编辑把网址改成另一张卡的域名 → 提示「更换网站请新建站点」
  await click('button[aria-label="编辑 京东"]')
  await setFormField(1, 'https://www.taobao.com')
  await submitForm()
  const swapErr = await formError()
  assert.match(swapErr, /更换网站请新建站点/, 'changing domain on edit should be blocked: ' + swapErr)
  record(`表单判重 c：编辑时改到别的域名被拦下 —— 「${swapErr}」`)
  await clickText('取消')

  /* ---------- 5. v1 老备份导入 → 旧 id 重写成域名形态 ---------- */
  // 造一份 v1 备份：只有 records，id 是「名字派生的旧 slug」（bilibili / jd）
  const yesterday = await page.evaluate(`(() => { const t = new Date(${q(today)} + 'T12:00:00'); t.setDate(t.getDate() - 1); return [t.getFullYear(), String(t.getMonth()+1).padStart(2,'0'), String(t.getDate()).padStart(2,'0')].join('-') })()`)
  const v1backup = JSON.stringify({ app: 'checkin-dashboard', exportedAt: new Date().toISOString(), data: { version: 1, records: { [yesterday]: ['bilibili', 'jd'] } } })
  // 先把昨天那天的记录清掉，确保读到的结果是导入带来的
  await page.evaluate(`(() => { const data = ${store}; delete data.records[${q(yesterday)}]; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)) })()`)
  await reload()
  await page.evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${q(v1backup)}], 'v1-backup.json', { type: 'application/json' })); const el = document.querySelector('input[accept="application/json,.json"]'); el.files = transfer.files; el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.import-preview')"), 'import preview not shown for v1 backup')
  await clickText('确认合并')
  await ready()
  const imported = await page.evaluate(`(() => { const rec = ${store}.records[${q(yesterday)}] ?? []; return { rec: [...rec].sort(), hasLegacy: rec.includes('bilibili') || rec.includes('jd'), hasDomain: rec.includes('bilibili-com') && rec.includes('jd-com') } })()`)
  assert.equal(imported.hasDomain, true, 'v1 legacy ids should be rekeyed to domain ids: ' + JSON.stringify(imported))
  assert.equal(imported.hasLegacy, false, 'no raw legacy id should survive migration: ' + JSON.stringify(imported))
  record(`v1 老备份导入：旧 id 被重写成域名形态，历史落在 ${JSON.stringify(imported.rec)}`)

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL ACCEPTANCE CHECKS PASSED')
  console.log('screenshots:', shots)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
