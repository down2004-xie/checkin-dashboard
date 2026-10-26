import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('..', import.meta.url))
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
assert(browser && existsSync(browser), 'Set CHROME_PATH to a Chrome/Chromium executable')
const temporaryRoot = resolve(tmpdir())
const profile = await mkdtemp(join(temporaryRoot, 'checkin-browser-'))
const artifacts = resolve(workspace, 'shots', 'regression')
await mkdir(artifacts, { recursive: true })
const delay = (duration) => new Promise((done) => setTimeout(done, duration))
const freePort = () => new Promise((done, reject) => {
  const socket = createServer()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => done(port)) })
})
const port = await freePort()
const debugPort = await freePort()
const origin = `http://127.0.0.1:${port}`
const debugOrigin = `http://127.0.0.1:${debugPort}`
const children = []
const clients = []
const failures = []
const checks = []
let processLog = ''

function launch(command, argumentsList) {
  const child = spawn(command, argumentsList, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => { processLog += chunk })
  child.stderr.on('data', (chunk) => { processLog += chunk })
  child.on('error', (error) => failures.push(error.message))
  children.push(child)
  return child
}

async function waitFor(check, message, timeout = 15000) {
  const end = Date.now() + timeout
  let lastError
  while (Date.now() < end) {
    try { if (await check()) return } catch (error) { lastError = error }
    await delay(60)
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`)
}

async function connect(address) {
  const socket = new WebSocket(address)
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') failures.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if (message.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true })
    const waiting = pending.get(message.id)
    if (!waiting) return
    clearTimeout(waiting.timer)
    pending.delete(message.id)
    if (message.error) waiting.reject(new Error(JSON.stringify(message.error)))
    else waiting.done(message.result)
  })
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    pending.set(id, { done, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const client = { send, evaluate, close: () => socket.close() }
  clients.push(client)
  await send('Runtime.enable')
  await send('Page.enable')
  return client
}

const quoted = JSON.stringify
const storeExpression = "JSON.parse(localStorage.getItem('checkin-dashboard:data'))"
const ready = (page) => waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls') && !document.querySelector('.dashboard-controls').disabled"), 'Page did not become ready')
const click = async (page, selector) => {
  await waitFor(() => page.evaluate(`!!document.querySelector(${quoted(selector)}) && !document.querySelector(${quoted(selector)}).matches(':disabled')`), `Missing or disabled: ${selector}`)
  await page.evaluate(`(() => { const element = document.querySelector(${quoted(selector)}); if (!element || element.matches(':disabled')) throw new Error('Missing or disabled: ' + ${quoted(selector)}); element.click() })()`)
  await delay(80)
}
const clickText = async (page, text) => {
  await page.evaluate(`(() => { const element = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${quoted(text)}); if (!element || element.disabled) throw new Error('Missing button: ' + ${quoted(text)}); element.click() })()`)
  await delay(80)
}
const input = async (page, selector, value) => {
  await page.evaluate(`(() => { const element = document.querySelector(${quoted(selector)}); const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${quoted(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`)
  await delay(30)
}
const waitValue = (page, expression, message) => waitFor(() => page.evaluate(expression), message)
const record = (message) => { checks.push(message); console.log(`PASS ${message}`) }
const reload = async (page) => { await page.send('Page.reload'); await delay(180); await ready(page) }
const screenshot = async (page, name) => {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(join(artifacts, name), Buffer.from(data, 'base64'))
}
const upload = async (page, text, name, selector = 'input[accept="application/json,.json"]') => {
  await page.evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${quoted(text)}], ${quoted(name)}, { type: ${quoted(name.endsWith('.html') ? 'text/html' : 'application/json')} })); const element = document.querySelector(${quoted(selector)}); element.files = transfer.files; element.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await delay(120)
}

try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  await waitFor(async () => (await fetch(origin)).ok, 'Preview server unavailable')
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${debugOrigin}/json/list`)).ok, 'Browser debugging port unavailable')
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json()
  const page = await connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: origin })
  await ready(page)
  await waitValue(page, `${storeExpression}?.version === 6 && Object.keys(${storeExpression}.targets).length > 0`, 'Initial target snapshot was not saved')
  const today = await page.evaluate(`${storeExpression} && Object.keys(${storeExpression}.targets).sort().at(-1)`)
  assert(today)
  const baseline = await page.evaluate(storeExpression)
  assert.equal(baseline.version, 6)
  assert.equal(baseline.sites.length, 6)
  assert.equal(baseline.preferences.appearance, 'dark')
  record('Fresh load migrates to v6 and creates today target snapshot')

  await input(page, 'input[type="search"]', 'github')
  assert.equal(await page.evaluate("document.querySelectorAll('.card').length"), 1)
  await clickText(page, '重置筛选')
  await input(page, 'select[aria-label="签到状态"]', 'pending')
  await click(page, '.card__toggle')
  await ready(page)
  assert.equal(await page.evaluate("document.querySelectorAll('.card').length"), 5)
  await clickText(page, '重置筛选')
  await reload(page)
  assert.equal(await page.evaluate(`${storeExpression}.records[${quoted(today)}].length`), 1)
  record('Search, pending filter, checkin and reload persistence')

  const names = baseline.sites.map((site) => site.name)
  await click(page, `button[aria-label="编辑 ${names[0]}"]`)
  assert.equal(await page.evaluate("document.querySelector('.site-form input').value"), names[0])
  await input(page, '.site-form input', 'unsaved draft')
  await click(page, `button[aria-label="编辑 ${names[1]}"]`)
  assert.equal(await page.evaluate("document.querySelector('.site-form input').value"), names[1])
  await input(page, '.site-form input', 'Renamed site')
  await page.evaluate("document.querySelector('.site-form').requestSubmit()")
  await waitValue(page, `${storeExpression}.sites[1].name === 'Renamed site'`, 'Site edit did not save')
  record('Switching edited cards resets drafts; form submit saves correct card')

  await click(page, '.card__manage summary')
  await clickText(page, '暂停签到')
  await ready(page)
  assert.equal(await page.evaluate(`${storeExpression}.targets[${quoted(today)}].length`), 5)
  assert.equal(await page.evaluate("document.querySelector('.card__toggle').disabled"), true)
  await clickText(page, '恢复签到')
  await ready(page)
  await clickText(page, '置顶')
  await ready(page)
  assert.equal(await page.evaluate(`${storeExpression}.sites[0].pinned`), true)
  record('Pause excludes site from today targets, resume and pin persist')

  await input(page, '.todo__input', 'Write regression report')
  await click(page, '.todo__form button')
  await ready(page)
  await click(page, '.todo-edit-button')
  await input(page, '[aria-label="编辑待办内容"]', 'Updated regression report')
  await page.evaluate("document.querySelector('.todo-edit').requestSubmit()")
  await waitValue(page, `${storeExpression}.todos[${quoted(today)}][0].text === 'Updated regression report'`, 'Todo edit failed')
  await click(page, '.todo__check')
  await ready(page)
  await clickText(page, '折叠已完成 (1)')
  assert.equal(await page.evaluate("document.querySelectorAll('.todo__item').length"), 0)
  await clickText(page, '显示已完成 (1)')
  await click(page, '.todo__remove')
  await ready(page)
  await clickText(page, '撤销删除')
  await ready(page)
  assert.equal(await page.evaluate(`${storeExpression}.todos[${quoted(today)}][0].done`), true)
  record('Todo add, edit, complete, collapse, delete and undo')

  const yesterday = await page.evaluate(`(() => { const date = new Date(${quoted(today)} + 'T12:00:00'); date.setDate(date.getDate() - 1); return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-') })()`)
  await page.evaluate(`(() => { const data = ${storeExpression}; data.todos[${quoted(yesterday)}] = [{ id: 'carry-task', text: 'Yesterday task', done: false }]; data.targets[${quoted(yesterday)}] = [data.sites[0]]; data.records[${quoted(yesterday)}] = [data.sites[0].id]; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)); })()`)
  await reload(page)
  await clickText(page, '带入昨天未完成的 1 项')
  await ready(page)
  assert.equal(await page.evaluate(`${storeExpression}.todos[${quoted(today)}].filter(todo => todo.id === 'carry-task').length`), 1)
  assert.equal(await page.evaluate(`${storeExpression}.todos[${quoted(yesterday)}][0].done`), false)
  record('Carryover copies unfinished tasks once without changing history')

  await click(page, `.heatmap__cell[aria-label^="${yesterday}"]`)
  assert.equal(await page.evaluate("document.querySelector('.history-detail').open"), true)
  assert((await page.evaluate("document.querySelector('.history-detail').textContent")).includes('Yesterday task'))
  await page.evaluate(`document.querySelector('.heatmap__cell[aria-label^="${yesterday}"]').focus()`)
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' })
  assert((await page.evaluate("document.activeElement.getAttribute('aria-label')")).startsWith(today))
  record('History details show snapshots and tasks; arrow-key navigation works')

  await click(page, '.settings summary')
  await input(page, '[aria-label="主题配色"]', 'dusk')
  await ready(page)
  await input(page, '[aria-label="视觉效果"]', 'static')
  await ready(page)
  await click(page, '.settings input[type="checkbox"]')
  await ready(page)
  await reload(page)
  assert.equal(await page.evaluate("document.documentElement.dataset.effects"), 'static')
  assert.equal(await page.evaluate("document.documentElement.dataset.compact"), 'true')
  assert.equal(await page.evaluate("document.querySelectorAll('.petal-layer').length"), 0)
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.sakura__canopy')).animationName"), 'none')
  record('Theme, static effects and compact layout persist after reload')

  const { targetId } = await page.send('Target.createTarget', { url: origin })
  const allTargets = await (await fetch(`${debugOrigin}/json/list`)).json()
  const second = await connect(allTargets.find((target) => target.id === targetId).webSocketDebuggerUrl)
  await ready(second)
  const toggleFor = (name) => `[aria-label="标记已签到 ${name}"]`
  await Promise.all([click(page, toggleFor('Renamed site')), click(second, toggleFor(names[2]))])
  await ready(page)
  await ready(second)
  await waitValue(page, `${storeExpression}.records[${quoted(today)}].length === 3`, 'Concurrent tabs lost a checkin')
  await waitValue(second, "document.querySelectorAll('.card--done').length === 3", 'Storage event did not synchronize second page')
  record('Concurrent tabs preserve both checkins and synchronize the UI')

  const imported = await page.evaluate(storeExpression)
  imported.todos[today].push({ id: 'import-task', text: 'Imported task', done: false })
  const backup = JSON.stringify({ app: 'checkin-dashboard', exportedAt: new Date().toISOString(), data: imported })
  await upload(page, backup, 'backup.json')
  await waitValue(page, "!!document.querySelector('.import-preview')", 'Import preview not displayed')
  assert.equal(await page.evaluate(`${storeExpression}.todos[${quoted(today)}].some(todo => todo.id === 'import-task')`), false)
  await input(second, '.todo__input', 'Written after preview')
  await click(second, '.todo__form button')
  await ready(second)
  await clickText(page, '确认合并')
  await ready(page)
  const todoTexts = await page.evaluate(`${storeExpression}.todos[${quoted(today)}].map(todo => todo.text)`)
  assert(todoTexts.includes('Imported task') && todoTexts.includes('Written after preview'))
  record('Import previews before writing and merges against the latest tab state')

  await upload(page, JSON.stringify({ app: 'checkin-dashboard', data: { version: 0, records: {} } }), 'invalid.json')
  assert((await page.evaluate("document.querySelector('.feedback').textContent")).includes('导入失败'))
  record('Invalid backup versions are rejected without changing saved data')

  const bookmarkText = await readFile(join(workspace, 'fixtures/sample-bookmarks.html'), 'utf8')
  await upload(page, bookmarkText, 'bookmarks.html', 'input[accept="text/html,.html,.htm"]')
  assert((await page.evaluate("document.body.textContent")).includes('共解析'))
  record('Bookmark HTML parser renders an import plan in a real browser')
  await page.evaluate("document.querySelectorAll('.site-form-wrap button').forEach(button => { if (button.textContent.trim() === '取消') button.click() })")

  /* ------------------------------------------------------------------ *
   * 代码审查遗留的回归场景（见 MY-ISSUES #12 / #13 和待解决表）
   *
   * 这几条的共同点：**纯视觉上看不出来**，单测也够不着（要真的渲染 + 真的
   * 读 localStorage），所以只能在这一层钉住。每条都注明它守的是哪个已修的 bug。
   * ------------------------------------------------------------------ */

  // 守 #12：`String(['auto']) === 'auto'` 曾让数组通过偏好校验，
  // 于是 `PALETTES[['auto']]` 是 undefined、`palette.bg1` 抛异常 → 整页白屏。
  // 这里直接手改 localStorage 造出那个输入，页面必须还能开、还要退回默认主题。
  await page.evaluate(`(() => { const data = ${storeExpression}; data.preferences = { theme: ['auto'], effects: ['full'], compact: false }; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)); })()`)
  await reload(page)
  assert.equal(await page.evaluate("document.querySelector('.recovery') === null"), true)
  assert.equal(await page.evaluate("document.querySelector('[aria-label=\"主题配色\"]').value"), 'auto')
  // --bg-1 是 useDaylight 在 effect 里写上去的：它能读到值就说明那个 effect 没抛异常
  assert((await page.evaluate("document.documentElement.style.getPropertyValue('--bg-1')")).trim() !== '')
  record('Array-valued preferences fall back instead of white-screening the page')

  // 守 #13：保护模式的判据必须窄。**重复**只是被去重、内容还在，页面照常可用；
  // 而**真的读不回来**（`5` 不是合法 id）才该停写保护。
  const protectedRaw = await page.evaluate("localStorage.getItem('checkin-dashboard:data')")
  await page.evaluate(`(() => { const data = ${storeExpression}; const day = Object.keys(data.records).sort().at(-1); data.records[day] = [data.records[day][0], data.records[day][0]]; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)); })()`)
  await reload(page)
  assert.equal(await page.evaluate("document.querySelector('.recovery') === null"), true)
  assert.equal(await page.evaluate("document.querySelector('.dashboard-controls').disabled"), false)
  record('Harmless duplicates no longer latch the app into read-only protection')

  await page.evaluate(`(() => { const data = ${storeExpression}; const day = Object.keys(data.records).sort().at(-1); data.records[day] = [data.records[day][0], 5]; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)); })()`)
  await page.send('Page.reload')
  await waitValue(page, "!!document.querySelector('.recovery')", 'Unreadable entry did not trigger protection')
  assert.equal(await page.evaluate("document.querySelector('.dashboard-controls').disabled"), true)
  record('Genuinely unreadable entries still trigger protection mode')
  await page.evaluate(`localStorage.setItem('checkin-dashboard:data', ${quoted(protectedRaw)})`)
  await reload(page)

  // 守「筛选下移动顺序」：以前的按钮状态是按**未筛选全集**的索引算的，
  // 于是在只有一张卡的筛选视图里，「前移」是亮的 —— 点下去改的是屏幕外
  // 那个站的顺序，屏幕上什么都不动。人工点很难发现，必须自动验。
  const crafted = { version: 5, sites: [
    { id: 'a-com', name: 'Alpha', url: 'https://a.com' },
    { id: 'b-com', name: 'Beta', url: 'https://b.com' },
    { id: 'c-com', name: 'Gamma', url: 'https://c.com', category: '专用' },
  ], records: {}, todos: {}, targets: {}, preferences: { theme: 'auto', effects: 'full', compact: false } }
  await page.evaluate(`localStorage.setItem('checkin-dashboard:data', ${quoted(JSON.stringify(crafted))})`)
  await reload(page)
  assert.equal(await page.evaluate("document.querySelectorAll('.card').length"), 3)

  await clickText(page, '专用')
  assert.equal(await page.evaluate("document.querySelectorAll('.card').length"), 1)
  await page.evaluate("document.querySelectorAll('.card__manage').forEach(node => { node.open = true })")
  // 可见列表只有一张卡，两边都不该能移；旧实现这里会亮着「前移」
  assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"前移 Gamma\"]').disabled"), true)
  assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"后移 Gamma\"]').disabled"), true)
  record('Move buttons follow the filtered visible list, not the stored order')

  await clickText(page, '重置筛选')
  await page.evaluate("document.querySelectorAll('.card__manage').forEach(node => { node.open = true })")
  await click(page, 'button[aria-label="前移 Gamma"]')
  await ready(page)
  assert.deepEqual(await page.evaluate(`${storeExpression}.sites.map(site => site.id)`), ['a-com', 'c-com', 'b-com'])
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.card__link')].map(node => node.textContent)"), ['Alpha', 'Gamma', 'Beta'])
  record('Moving swaps with the visible neighbour and the grid order follows')

  // 置顶与普通站之间不许互换：置顶的显示位置由置顶决定，换了屏幕上也不会动。
  await clickText(page, '置顶')
  await ready(page)
  await reload(page)
  await page.evaluate("document.querySelectorAll('.card__manage').forEach(node => { node.open = true })")
  assert.equal(await page.evaluate(`${storeExpression}.sites[0].pinned`), true)
  assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"后移 Alpha\"]').disabled"), true)
  assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"前移 Gamma\"]').disabled"), true)
  assert.equal(await page.evaluate("document.querySelector('button[aria-label=\"后移 Gamma\"]').disabled"), false)
  record('Pinned sites cannot be swapped across the pinned boundary')

  // 守「无 Web Locks 时连点会吞掉第二次」。关键是把 `navigator.locks` 藏掉
  // （它挂在原型上，delete 不生效，得用 defineProperty 造一个 own property 盖住），
  // 然后**在同一个 tick 里点两下** —— 分两次点的话第一次早就写完了，
  // 队列不会重叠，也就测不到这个 bug。
  await page.evaluate("Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })")
  assert.equal(await page.evaluate("typeof navigator.locks"), 'undefined')
  const beforeBurst = await page.evaluate(`(${storeExpression}.records[${quoted(today)}] ?? []).length`)
  await page.evaluate(`(() => { const toggles = [...document.querySelectorAll('.card:not(.card--done) .card__toggle')].slice(0, 2); if (toggles.length < 2) throw new Error('Need two unchecked cards'); toggles[0].click(); toggles[1].click() })()`)
  await waitValue(page, `(${storeExpression}.records[${quoted(today)}] ?? []).length === ${beforeBurst + 2}`, 'Queued clicks without Web Locks lost a checkin')
  assert.equal((await page.evaluate("document.querySelector('.feedback').textContent")).includes('其他页面更新了数据'), false)
  await page.evaluate("delete navigator.locks")
  record('Two clicks in one tick both persist when the browser has no Web Locks')

  // 守「统计范围只改文字、不改网格」：以前 `range` 只喂给 periodStats，
  // 网格永远 26 周，选「近 7 天」时上面的数字变了、格子一格没动。
  // 判据用**列数**：它同时反映网格和网格背后的那批日期。
  const columnsAt = (weeks) => page.evaluate(`(async () => { const select = document.querySelector('[aria-label="统计范围"]'); select.value = ${quoted(String(weeks))}; select.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((done) => setTimeout(done, 60)); return document.querySelectorAll('.heatmap-column').length })()`)
  const columns26 = await columnsAt(26)
  const columns4 = await columnsAt(4)
  assert.equal(columns4, 4)
  assert(columns26 > columns4)
  assert((await page.evaluate("document.querySelector('.heatmap__weeks').getAttribute('aria-label')")).includes('近 4 周'))
  assert((await page.evaluate("document.querySelector('.history .muted').textContent")).startsWith('签到'))
  await columnsAt(26)
  record('Stat range drives the grid itself, not only the summary line')

  await screenshot(page, 'desktop.png')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await delay(150)
  assert.equal(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
  await screenshot(page, 'mobile.png')
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.sakura__canopy')).animationName"), 'none')
  record('390px mobile layout has no page overflow and reduced-motion is respected')

  const validRaw = await page.evaluate("localStorage.getItem('checkin-dashboard:data')")
  await page.evaluate("localStorage.setItem('checkin-dashboard:data', '{broken')")
  await page.send('Page.reload')
  await waitValue(page, "!!document.querySelector('.recovery')", 'Protection mode missing')
  assert.equal(await page.evaluate("localStorage.getItem('checkin-dashboard:data')"), '{broken')
  assert.equal(await page.evaluate("document.querySelector('.dashboard-controls').disabled"), true)
  await upload(page, JSON.stringify({ app: 'checkin-dashboard', data: JSON.parse(validRaw) }), 'recover.json')
  await clickText(page, '确认恢复')
  await ready(page)
  assert.equal(await page.evaluate("localStorage.getItem('checkin-dashboard:recovery')"), '{broken')
  record('Corrupt storage enters read-only protection and explicit recovery archives original')

  await page.evaluate(`(() => { const data = ${storeExpression}; data.version = 999; localStorage.setItem('checkin-dashboard:data', JSON.stringify(data)); })()`)
  await page.send('Page.reload')
  await waitValue(page, "!!document.querySelector('.recovery')", 'Newer version not protected')
  assert.equal(await page.evaluate(`${storeExpression}.version`), 999)
  record('Newer-version data survives older application startup unchanged')
  assert.deepEqual(failures, [], `Browser errors: ${failures.join('\n')}`)
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ checks, browser, passed: checks.length }, null, 2))
  console.log(`\n${checks.length} browser scenarios passed. Screenshots: shots/regression/`)
} catch (error) {
  for (const [index, client] of clients.entries()) {
    try {
      const state = await client.evaluate(`({ url: location.href, saved: ${storeExpression}, disabled: document.querySelector('.dashboard-controls')?.disabled, feedback: document.querySelector('.feedback')?.textContent })`)
      await writeFile(join(artifacts, `failure-${index}.json`), JSON.stringify(state, null, 2))
      await screenshot(client, `failure-${index}.png`)
    } catch {}
  }
  console.error(processLog.slice(-3000))
  throw error
} finally {
  for (const client of clients) client.close()
  for (const child of children.reverse()) {
    child.kill()
    await Promise.race([new Promise((done) => child.once('exit', done)), delay(2000)])
  }
  const resolvedProfile = resolve(profile)
  if (resolvedProfile.startsWith(temporaryRoot + sep) && resolvedProfile.split(sep).at(-1).startsWith('checkin-browser-')) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
