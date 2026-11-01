/**
 * 电子日记（v7）的自动化验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 通过 `npm run test:diary` 运行。和其他 scripts/*-check.mjs 一样走 `vite preview`，
 * 服务的是现有的 dist/ —— **先 `npx vite build` 再跑**，否则测的是旧产物。
 *
 * 覆盖：v6 → v7 升级不进保护模式、写入/刷新持久化、Ctrl+Enter、防抖自动保存（只写一次盘）、
 * 窗口 focus 刷新不顶掉草稿、搜索跳转、删除撤销回原位、补写过去的日子、禁止未来日期、
 * 亮色外观、移动端不溢出、保护模式只读。
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
const profile = await mkdtemp(join(tmpdir(), 'diary-'))
const shots = await mkdtemp(join(tmpdir(), 'diary-shots-'))
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
    // 浏览器原生对话框弹出时记一笔，并立刻替用户点按钮。默认点「取消」留在原处（模拟看到提醒后反悔）；
    // 把 acceptDialogs 设成 true 就点「确定」。不处理的话页面会一直卡在对话框上，后面所有命令都超时。
    // 关页提醒的类型是 'beforeunload'，切视图确认（window.confirm）的类型是 'confirm'
    if (m.method === 'Page.javascriptDialogOpening') {
      dialogs.push(m.params.type)
      dialogMessages.push(m.params.message)
      send('Page.handleJavaScriptDialog', { accept: acceptDialogs }).catch(() => {})
    }
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

const KEY = 'checkin-dashboard:data'
const store = `JSON.parse(localStorage.getItem(${q(KEY)}) ?? 'null')`
const readStore = () => page.evaluate(store)
const clickText = (text) => page.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${q(text)}); if (!el) throw new Error('missing button ' + ${q(text)}); if (el.disabled) throw new Error('disabled button ' + ${q(text)}); el.click() })()`)
const click = (sel) => page.evaluate(`(() => { const el = document.querySelector(${q(sel)}); if (!el) throw new Error('missing ' + ${q(sel)}); if (el.disabled) throw new Error('disabled ' + ${q(sel)}); el.click() })()`)
// React 受控输入框：直接改 value 不会触发 onChange，要走原型上的 setter 再派发 input 事件
const setValue = (sel, value) => page.evaluate(`(() => { const el = document.querySelector(${q(sel)}); if (!el) throw new Error('missing ' + ${q(sel)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const text = (sel) => page.evaluate(`document.querySelector(${q(sel)})?.textContent ?? null`)
const panelTitle = () => text('.diary__panel-title')
const openDiary = async () => { await clickText('日记'); await waitFor(() => page.evaluate("!!document.querySelector('.diary')"), 'diary view not shown'); await delay(100) }
/** 弹出过的对话框类型，按顺序记录。关页提醒的类型是 'beforeunload'，切视图确认是 'confirm' */
const dialogs = []
const dialogMessages = []
/** 对话框弹出时替用户点「确定」（true）还是「取消」（false） */
let acceptDialogs = false
// 正常刷新：断言**没有**弹关页提醒。脚本里每一次 reload 都顺带守着「正常关页不打扰」
const reload = async () => {
  const before = dialogs.length
  await page.send('Page.reload')
  await waitFor(() => page.evaluate("!!document.querySelector('.view-switch')"), 'reload failed')
  await delay(400)
  assert.equal(dialogs.length, before, `unexpected leave prompt on reload: ${JSON.stringify(dialogs.slice(before))}`)
}
// 有未保存内容时刷新：断言**弹了**关页提醒，且用户点「取消」后页面没刷新（DOM 还是原来那份）
const reloadExpectPrompt = async () => {
  const before = dialogs.length
  await page.evaluate('window.__samePage = true')
  const pending = page.send('Page.reload').catch((error) => error)
  await waitFor(() => dialogs.length > before, 'no leave prompt although there is unsaved content', 5000)
  await Promise.race([pending, delay(3000)])
  await delay(200)
  assert.equal(await page.evaluate('window.__samePage === true'), true, 'page reloaded although the leave prompt was cancelled')
  return dialogs[dialogs.length - 1]
}
const setAppearance = async (value) => {
  await page.evaluate(`document.querySelector('details.settings')?.setAttribute('open', '')`)
  await delay(100)
  await page.evaluate(`(() => { const el = document.querySelector('select[aria-label="明暗外观"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await waitFor(() => page.evaluate(`document.documentElement.dataset.appearance === ${q(value)}`), 'appearance did not switch')
  await delay(400)
}
const dayKey = (offset) => page.evaluate(`(() => { const d = new Date(); d.setDate(d.getDate() + ${offset}); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })()`)

try {
  assert.ok(browser, 'no Chrome/Edge found; set CHROME_PATH')
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

  const today = await dayKey(0)
  const yesterday = await dayKey(-1)
  const tomorrow = await dayKey(1)

  // 1. 预置一份 v6 数据（没有 diary 字段），刷新后应升级成 v7，且不进保护模式
  const v6 = {
    version: 6,
    sites: [{ id: 'a-com', name: 'A', url: 'https://a.com' }],
    records: { [yesterday]: ['a-com'] },
    todos: { [yesterday]: [{ id: 't1', text: '旧待办', done: false }] },
    targets: {},
    preferences: { theme: 'auto', effects: 'full', compact: false, appearance: 'dark' },
  }
  await page.evaluate(`localStorage.setItem(${q(KEY)}, ${q(JSON.stringify(v6))})`)
  await reload()
  assert.equal(await page.evaluate("document.querySelectorAll('.recovery').length"), 0, 'v6 data must not trigger protection mode')
  await waitFor(async () => (await readStore())?.version === 7, 'storage was not upgraded to version 7')
  const upgraded = await readStore()
  assert.deepEqual(upgraded.diary, {}, 'upgraded diary should be empty object')
  assert.equal(upgraded.todos[yesterday][0].text, '旧待办', 'todos lost during upgrade')
  assert.deepEqual(upgraded.records[yesterday], ['a-com'], 'records lost during upgrade')
  record('v6 数据（无 diary）升级为 v7：未进保护模式，diary={}，签到和待办原样保留')

  // 2. 切到日记视图，写一条带标题的日记
  await openDiary()
  assert.match(await panelTitle(), /^今天/)
  assert.equal(await text('.diary__empty'), '今天还没有写日记')
  assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '保存到今天').disabled`), true, 'save must be disabled with empty body')
  await setValue('input[aria-label="日记标题"]', '  周会纪要  ')
  await setValue('textarea[aria-label="日记正文"]', '讨论了 Diary 功能\n第二行')
  await clickText('保存到今天')
  await waitFor(async () => (await readStore()).diary[today]?.length === 1, 'diary entry not saved')
  const first = (await readStore()).diary[today][0]
  assert.equal(first.title, '周会纪要', 'title should be trimmed')
  assert.equal(first.text, '讨论了 Diary 功能\n第二行', 'body must be stored verbatim, newline kept')
  assert.ok(typeof first.id === 'string' && first.id.length > 0)
  assert.ok(typeof first.createdAt === 'string' && !Number.isNaN(Date.parse(first.createdAt)))
  assert.equal(await page.evaluate(`document.querySelector('textarea[aria-label="日记正文"]').value`), '', 'composer should clear after save')
  assert.equal(await text('.diary-entry__title'), '周会纪要')
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.diary-entry__text')).whiteSpace"), 'pre-wrap')
  record('写入带标题的日记：标题 trim、正文原样保留换行、表单清空、正文 pre-wrap 显示')

  // 3. Ctrl+Enter 保存第二条（无标题）
  await setValue('textarea[aria-label="日记正文"]', '第二条，没有标题')
  await page.evaluate(`document.querySelector('textarea[aria-label="日记正文"]').focus()`)
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 })
  await waitFor(async () => (await readStore()).diary[today]?.length === 2, 'Ctrl+Enter did not save')
  const second = (await readStore()).diary[today][1]
  assert.equal('title' in second, false, 'empty title must not be stored as a field')
  const order = await page.evaluate("[...document.querySelectorAll('.diary-entry')].map(e => e.querySelector('.diary-entry__text').textContent)")
  assert.deepEqual(order, ['讨论了 Diary 功能\n第二行', '第二条，没有标题'], 'entries should be sorted oldest first')
  record('Ctrl+Enter 保存；无标题条目不存 title 字段；同一天按创建时间从早到晚排')

  // 3b. 关页提醒（新建框）：只在「正文写了字还没保存」时弹，其余情况关页不打扰
  const composer = 'textarea[aria-label="日记正文"]'
  await setValue('input[aria-label="日记标题"]', '只写了标题')
  await setValue(composer, '   ')
  await reload() // 只有标题、正文纯空白：存不进去也不会丢东西 → 不弹（reload 内部断言）
  await openDiary()
  await setValue(composer, '还没点保存的草稿')
  assert.equal(await reloadExpectPrompt(), 'beforeunload')
  assert.equal(await page.evaluate(`document.querySelector(${q(composer)}).value`), '还没点保存的草稿', 'draft lost after cancelling the leave prompt')
  // 保存失败（模拟存储写满）：草稿保留，提醒也必须保留
  await page.evaluate(`(() => { window.__realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError') } })()`)
  await clickText('保存到今天')
  await waitFor(async () => /保存失败/.test(await text('.diary-composer .diary__status') ?? ''), 'save failure not shown')
  assert.equal(await reloadExpectPrompt(), 'beforeunload', 'prompt must stay after a failed save')
  await page.evaluate('Storage.prototype.setItem = window.__realSetItem')
  await setValue(composer, '')
  await setValue('input[aria-label="日记标题"]', '')
  record('关页提醒（新建框）：正文有字未保存时弹、取消后草稿还在；保存失败后仍弹；只有标题或正文纯空白时不弹')

  // 3c. 切视图确认（新建框）。目标页**从导航栏现读**，不写死「签到 / 工具箱」——
  //     以后加了新页面，这一步自动把它也测到
  const navTo = (label) => page.evaluate(`(() => { const el = [...document.querySelectorAll('.view-switch__btn')].find(b => b.textContent.trim() === ${q(label)}); if (!el) throw new Error('missing nav ' + ${q(label)}); el.click() })()`)
  const onDiary = () => page.evaluate("!!document.querySelector('.diary')")
  const otherViews = await page.evaluate("[...document.querySelectorAll('.view-switch__btn')].map(b => b.textContent.trim()).filter(t => t !== '日记')")
  assert.ok(otherViews.length >= 2, 'expected at least 签到 and 工具箱 besides 日记: ' + JSON.stringify(otherViews))
  // 没有草稿：去哪都不弹
  for (const label of otherViews) {
    const before = dialogs.length
    await navTo(label)
    await waitFor(async () => !(await onDiary()), `could not leave diary to ${label} without a draft`)
    assert.equal(dialogs.length, before, `unexpected confirm when leaving to ${label} with no draft`)
    await openDiary()
  }
  // 有草稿：去哪都弹；点「取消」留在日记页，草稿原样还在
  await setValue(composer, '切视图前没保存的草稿')
  for (const label of otherViews) {
    const before = dialogs.length
    await navTo(label)
    await delay(150)
    assert.deepEqual(dialogs.slice(before), ['confirm'], `leaving to ${label} with a draft must confirm`)
    assert.match(dialogMessages[dialogMessages.length - 1], /没保存/)
    assert.equal(await onDiary(), true, `cancelled confirm still left diary for ${label}`)
    assert.equal(await page.evaluate(`document.querySelector(${q(composer)}).value`), '切视图前没保存的草稿', `draft lost after cancelling confirm to ${label}`)
  }
  // 点「确定」：真的离开，草稿按用户的选择丢弃；名单随组件卸载撤销，之后刷新、切换都不再弹
  acceptDialogs = true
  await navTo(otherViews[0])
  await waitFor(async () => !(await onDiary()), 'accepting the confirm did not leave diary')
  acceptDialogs = false
  await reload() // 内部断言不弹 beforeunload：组件卸载后关页提醒也摘掉了
  await openDiary()
  assert.equal(await page.evaluate(`document.querySelector(${q(composer)}).value`), '', 'discarded draft came back')
  record(`切视图确认（新建框）：有草稿时去 ${otherViews.join(' / ')} 都弹，取消留下且草稿还在，确定才离开；没草稿不弹`)

  // 4. 刷新后仍在
  await reload()
  await openDiary()
  assert.equal(await page.evaluate("document.querySelectorAll('.diary-entry').length"), 2, 'entries lost after reload')
  assert.equal(await text('.diary-entry__title'), '周会纪要')
  record('刷新页面后两条日记都在，localStorage diary[today] 有 2 条')

  // 5. 编辑：防抖只写一次盘；focus 刷新不顶掉草稿；自动保存后刷新是新内容
  await click('button[aria-label="编辑日记 周会纪要"]')
  await waitFor(() => page.evaluate(`!!document.querySelector('textarea[aria-label="编辑日记正文"]')`), 'editor did not open')
  await page.evaluate(`(() => { window.__writes = 0; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === ${q(KEY)}) window.__writes++; return orig.call(this, k, v) } })()`)
  const typed = ['讨', '讨论', '讨论了', '讨论了 Diary', '讨论了 Diary 功能（已修改）']
  for (const value of typed) { await setValue('textarea[aria-label="编辑日记正文"]', value); await delay(100) }
  assert.equal((await readStore()).diary[today][0].text, '讨论了 Diary 功能\n第二行', 'should not write while still typing')
  // 用户这时切了个窗口又回来：useCheckInStore 会 refresh 换掉 data，草稿不能被存储里的旧版本覆盖
  await page.evaluate("window.dispatchEvent(new Event('focus'))")
  await delay(50)
  assert.equal(await page.evaluate(`document.querySelector('textarea[aria-label="编辑日记正文"]').value`), '讨论了 Diary 功能（已修改）', 'focus refresh clobbered the draft')
  // 停笔还不到 600ms 就关页：自动保存还没发生，这时必须弹提醒
  assert.equal(await reloadExpectPrompt(), 'beforeunload')
  assert.equal(await page.evaluate(`document.querySelector('textarea[aria-label="编辑日记正文"]').value`), '讨论了 Diary 功能（已修改）', 'edit draft lost after cancelling the leave prompt')
  await waitFor(async () => (await readStore()).diary[today][0].text === '讨论了 Diary 功能（已修改）', 'autosave did not happen')
  await waitFor(async () => (await text('.diary-entry .diary__status')) === '已保存', 'status did not show 已保存')
  await delay(700)
  const writes = await page.evaluate('window.__writes')
  assert.equal(writes, 1, `5 rapid edits should be committed once, got ${writes}`)
  // 自动保存完成后，编辑框还开着也直接关页：内容已经落盘，不弹（reload 内部断言）
  await reload()
  await openDiary()
  assert.equal(await text('.diary-entry__text'), '讨论了 Diary 功能（已修改）', 'edited text lost after reload')
  record(`编辑：连续 5 次输入只落盘 ${writes} 次（防抖），focus 刷新不顶掉草稿，状态显示「已保存」，刷新后为新内容`)
  record('关页提醒（编辑）：停笔不到 600ms 就关页时弹、取消后草稿还在；自动保存完成后编辑框开着关页也不弹')

  // 6. 编辑时清空正文：不保存、提示
  await click('button[aria-label="编辑日记 周会纪要"]')
  await setValue('textarea[aria-label="编辑日记正文"]', '   ')
  await delay(800)
  assert.equal((await readStore()).diary[today][0].text, '讨论了 Diary 功能（已修改）', 'empty body must not be saved')
  assert.match(await text('.diary-entry .diary__status'), /正文不能为空/)
  await setValue('textarea[aria-label="编辑日记正文"]', '讨论了 Diary 功能（已修改）')
  await waitFor(() => page.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '完成' && !b.disabled)`), 'done button stays disabled')
  await clickText('完成')
  await waitFor(() => page.evaluate(`!document.querySelector('textarea[aria-label="编辑日记正文"]')`), 'editor did not close')
  record('编辑时把正文清空：不写盘，提示「正文不能为空」，「完成」禁用')

  // 6b. 切视图确认（编辑已有条目）
  const editor = 'textarea[aria-label="编辑日记正文"]'
  const savedText = '讨论了 Diary 功能（已修改）'
  // 正常情况：停笔不到 600ms 就切走 → 不弹，卸载时自动补交，回来是新内容
  await click('button[aria-label="编辑日记 周会纪要"]')
  await setValue(editor, '切走前补交的内容')
  let before = dialogs.length
  await navTo(otherViews[0])
  await waitFor(async () => !(await onDiary()), 'could not leave diary while editing')
  assert.equal(dialogs.length, before, 'editing an existing entry must not confirm on a normal view switch')
  await waitFor(async () => (await readStore()).diary[today][0].text === '切走前补交的内容', 'unmount flush did not save the edit')
  await openDiary()
  assert.equal(await text('.diary-entry__text'), '切走前补交的内容')
  // 保存失败过：切视图要弹 —— 即使失败后又接着打了字（状态从「未保存」变回「有改动」）
  await click('button[aria-label="编辑日记 周会纪要"]')
  await page.evaluate(`(() => { window.__realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError') } })()`)
  await setValue(editor, savedText)
  await waitFor(async () => (await text('.diary-entry .diary__status')) === '未保存', 'failed autosave not shown')
  await setValue(editor, savedText + '…') // 失败后接着打字
  before = dialogs.length
  await navTo(otherViews[0])
  await delay(150)
  assert.deepEqual(dialogs.slice(before), ['confirm'], 'must confirm when leaving after a failed save')
  assert.equal(await onDiary(), true, 'cancelled confirm still left diary')
  // 存储恢复后改回原文、点「完成」，后面的步骤依赖这条的正文
  await page.evaluate('Storage.prototype.setItem = window.__realSetItem')
  await setValue(editor, savedText)
  await waitFor(async () => (await readStore()).diary[today][0].text === savedText, 'save after storage recovered failed')
  await clickText('完成')
  await waitFor(() => page.evaluate(`!document.querySelector(${q(editor)})`), 'editor did not close')
  record('切视图确认（编辑）：正常切走不弹、卸载时自动补交；保存失败过（即使之后又打了字）切走要弹')

  // 7. 搜索：大小写不敏感；从别的日期点结果跳回当天并高亮
  await clickText('← 前一天')
  assert.match(await panelTitle(), new RegExp('^' + yesterday))
  await setValue('input[aria-label="搜索日记"]', 'diary')
  await waitFor(() => page.evaluate("document.querySelectorAll('.diary-hit').length === 1"), 'search did not find entry')
  assert.equal(await text('.diary-hit__title'), '周会纪要')
  assert.equal(await text('.diary-hit__day'), today)
  await setValue('input[aria-label="搜索日记"]', '不存在的关键字xyz')
  await waitFor(async () => (await text('.diary__empty')) === '没有找到匹配的日记', 'no-hit message missing')
  await setValue('input[aria-label="搜索日记"]', '已修改')
  await waitFor(() => page.evaluate("document.querySelectorAll('.diary-hit').length === 1"), 'search did not find edited text')
  await click('.diary-hit')
  await delay(200)
  assert.equal(await page.evaluate(`document.querySelector('input[aria-label="搜索日记"]').value`), '', 'search should clear after jump')
  assert.match(await panelTitle(), /^今天/, 'did not jump back to today')
  assert.equal(await text('.diary-entry--focused .diary-entry__title'), '周会纪要', 'jumped entry not highlighted')
  record('搜索：大小写不敏感命中、无结果有提示；从昨天点结果跳回今天、清空搜索并高亮该条')

  // 8. 删除 + 撤销：放回存储里的原位置
  await click('button[aria-label="删除日记 周会纪要"]')
  await waitFor(async () => (await readStore()).diary[today]?.length === 1, 'delete did not persist')
  assert.match(await text('.diary .notice'), /已删除「周会纪要」/)
  await clickText('撤销')
  await waitFor(async () => (await readStore()).diary[today]?.length === 2, 'undo did not persist')
  assert.equal((await readStore()).diary[today][0].title, '周会纪要', 'undo should restore original position')
  assert.equal(await page.evaluate("document.querySelectorAll('.diary-entry').length"), 2)
  assert.equal(await page.evaluate("document.querySelectorAll('.diary .notice').length"), 0, 'undo notice should close')
  record('删除后立即生效并提示撤销；撤销放回原位置（存储下标 0）')

  // 9. 补写过去的日子；禁止未来日期
  await clickText('← 前一天')
  await setValue('textarea[aria-label="日记正文"]', '补写昨天的实习日志')
  await clickText(`保存到 ${yesterday}`)
  await waitFor(async () => (await readStore()).diary[yesterday]?.length === 1, 'backfill not saved')
  assert.equal(await page.evaluate("document.querySelectorAll('.diary-recent .chip').length"), 2, 'recent days should list 2 days')
  assert.equal(await page.evaluate(`document.querySelector('input[aria-label="选择日期"]').max`), today)
  await clickText('回到今天')
  assert.match(await panelTitle(), /^今天/)
  assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '后一天 →').disabled`), true, 'cannot go past today')
  await setValue('input[aria-label="选择日期"]', tomorrow)
  await delay(100)
  assert.match(await panelTitle(), /^今天/, 'future date should clamp to today')
  record('可以补写昨天的日记；最近日期列出 2 天；「后一天」到今天为止；选未来日期会退回今天')

  // 10. 亮色外观下日记视图可读
  await clickText('签到')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'dashboard not shown')
  await setAppearance('light')
  await openDiary()
  const color = await page.evaluate("(() => { const v = getComputedStyle(document.querySelector('.diary-entry__text')).color; const p = v.match(/rgba?\\(([^)]+)\\)/)[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2] } })()")
  assert.ok(color.r < 80 && color.g < 80 && color.b < 100, 'diary text should be dark in light mode: ' + JSON.stringify(color))
  await shot('01-light-diary.png')
  // 设置面板在签到页里，切回去再还原成深色
  await clickText('签到')
  await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'dashboard not shown')
  await setAppearance('dark')
  record(`亮色外观下日记正文为深色 rgb(${color.r},${color.g},${color.b})，无运行时异常`)

  // 11. 移动端：不横向溢出，面板去掉 blur
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await delay(300)
  await openDiary()
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 1, 'mobile layout overflows horizontally by ' + overflow + 'px')
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.diary__panel')).backdropFilter"), 'none', 'mobile panel should drop backdrop-filter')
  await shot('02-mobile-diary.png')
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  record('移动端 390px：无横向溢出，日记面板去掉 backdrop-filter')

  // 12. 保护模式：已有日记可看，所有写入口禁用，存储不被改写
  const broken = JSON.stringify({
    version: 7, sites: [], records: {}, todos: {}, targets: {},
    diary: { [today]: [{ id: 'good', title: '保留', text: '能读回来的日记' }, { id: 'bad' }] },
    preferences: { theme: 'auto', effects: 'full', compact: false, appearance: 'dark' },
  })
  await page.evaluate(`localStorage.setItem(${q(KEY)}, ${q(broken)})`)
  await reload()
  await openDiary()
  assert.match(await text('.diary .alert'), /保护模式/)
  assert.equal(await text('.diary-entry__text'), '能读回来的日记', 'readable entry should still be visible')
  assert.equal(await page.evaluate(`document.querySelector('textarea[aria-label="日记正文"]').disabled`), true)
  assert.equal(await page.evaluate(`document.querySelector('button[aria-label="编辑日记 保留"]').disabled`), true)
  assert.equal(await page.evaluate(`document.querySelector('button[aria-label="删除日记 保留"]').disabled`), true)
  await delay(500)
  assert.equal(await page.evaluate(`localStorage.getItem(${q(KEY)})`), broken, 'protection mode must not rewrite storage')
  record('保护模式（含 1 条坏日记）：好的那条照常显示，输入/编辑/删除全部禁用，存储原样未改')

  assert.deepEqual(failures, [], 'runtime exceptions: ' + JSON.stringify(failures))
  console.log('\nALL DIARY CHECKS PASSED')
  console.log('screenshots:', shots)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exitCode = 1
} finally {
  page?.close()
  for (const c of children) { try { c.kill() } catch {} }
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {})
}
