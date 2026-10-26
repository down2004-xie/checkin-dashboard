/**
 * 工具箱视图的自动化验收脚本（零依赖，复用本机已装 Chrome/Edge）。
 *
 * 本脚本位于 scripts/，通过 `npm run test:toolbox` 运行。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
const profile = await mkdtemp(join(resolve(tmpdir()), 'toolbox-browser-'))
// 截图默认写到临时目录：这个脚本是一次性验收用的，不该覆盖仓库里已有的 shots 文件
const artifacts = process.env.SHOTS_DIR || await mkdtemp(join(resolve(tmpdir()), 'toolbox-shots-'))
await mkdir(artifacts, { recursive: true })
const delay = (ms) => new Promise((d) => setTimeout(d, ms))
const freePort = () => new Promise((done, reject) => {
  const s = createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) })
})
const port = await freePort(); const debugPort = await freePort()
const origin = `http://127.0.0.1:${port}`; const debugOrigin = `http://127.0.0.1:${debugPort}`
const children = []; const clients = []; const failures = []
const launch = (cmd, args) => { const c = spawn(cmd, args, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); c.on('error', (e) => failures.push(e.message)); children.push(c); return c }
async function waitFor(check, message, timeout = 15000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { if (await check()) return } catch (e) { last = e } await delay(60) } throw new Error(`${message}${last ? `: ${last.message}` : ''}`) }
async function connect(address) {
  const socket = new WebSocket(address)
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let seq = 0; const pending = new Map()
  socket.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); const w = pending.get(m.id); if (!w) return; clearTimeout(w.timer); pending.delete(m.id); if (m.error) w.reject(new Error(JSON.stringify(m.error))); else w.done(m.result) })
  const send = (method, params = {}) => new Promise((done, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)) }, 15000); pending.set(id, { done, reject, timer }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const client = { send, evaluate, close: () => socket.close() }; clients.push(client)
  await send('Runtime.enable'); await send('Page.enable'); return client
}
const q = JSON.stringify
const ready = (p) => waitFor(() => p.evaluate("!!document.querySelector('.dashboard-controls')"), 'not ready')
const clickText = async (p, text) => { await p.evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${q(text)}); if (!el || el.disabled) throw new Error('missing button ' + ${q(text)}); el.click() })()`); await delay(80) }
const clickToolCard = async (p, name) => { await p.evaluate(`(() => { const el = [...document.querySelectorAll('.tool-card')].find(c => c.querySelector('.tool-card__name')?.textContent.trim() === ${q(name)}); if (!el) throw new Error('missing tool card ' + ${q(name)}); el.click() })()`); await delay(80) }
const clickSel = async (p, sel) => { await p.evaluate(`(() => { const el = document.querySelector(${q(sel)}); if (!el || el.disabled) throw new Error('missing/disabled ' + ${q(sel)}); el.click() })()`); await delay(80) }
const clickChip = async (p, text) => { await p.evaluate(`(() => { const el = [...document.querySelectorAll('.filter button')].find(b => b.textContent.trim() === ${q(text)}); if (!el) throw new Error('missing chip ' + ${q(text)}); el.click() })()`); await delay(80) }
const input = async (p, sel, value) => { await p.evaluate(`(() => { const el = document.querySelector(${q(sel)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })()`); await delay(40) }
const shot = async (p, name) => { const { data } = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(artifacts, name), Buffer.from(data, 'base64')) }
const record = (m) => console.log(`PASS ${m}`)

try {
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  await waitFor(async () => (await fetch(origin)).ok, 'preview down')
  launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
  await waitFor(async () => (await fetch(`${debugOrigin}/json/list`)).ok, 'debug port down')
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json()
  const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false })
  await page.send('Page.navigate', { url: origin })
  await ready(page)

  // 1. 切换到工具箱
  await clickText(page, '工具箱')
  await waitFor(() => page.evaluate("!!document.querySelector('.toolbox')"), 'toolbox not shown')
  assert.equal(await page.evaluate("document.querySelectorAll('.tool-card').length"), 16)
  assert.equal(await page.evaluate("document.querySelectorAll('.tool-card[data-status=\"ready\"]').length"), 15)
  record('切换到工具箱视图，16 张卡片、15 个可用工具')

  // 2. 搜索过滤
  await input(page, '.toolbox__search', '证件照')
  assert.equal(await page.evaluate("document.querySelectorAll('.tool-card').length"), 1)
  assert.equal(await page.evaluate("document.querySelector('.tool-card__name').textContent.trim()"), '证件照处理')
  await input(page, '.toolbox__search', '')
  record('搜索「证件照」只剩证件照处理一张卡')

  // 3. 分类筛选
  await clickText(page, '图片 8')
  assert.equal(await page.evaluate("document.querySelectorAll('.tool-card').length"), 8)
  await clickText(page, '全部 16')
  record('分类筛选「图片」显示 8 张')

  // 4. 单位换算：默认 1 米 = 100 厘米
  await clickToolCard(page, '单位换算')
  await waitFor(() => page.evaluate("!!document.querySelector('.unit-result')"), 'unit panel not shown')
  assert.equal(await page.evaluate("document.querySelector('.unit-result strong').textContent.trim()"), '100')
  // 改数值为 2 → 200
  await input(page, 'input[aria-label="要换算的数值"]', '2')
  assert.equal(await page.evaluate("document.querySelector('.unit-result strong').textContent.trim()"), '200')
  // 切温度：100°C = 212°F
  await clickText(page, '温度')
  await input(page, 'input[aria-label="要换算的数值"]', '100')
  await input(page, 'select[aria-label="原单位"]', 'c')
  await input(page, 'select[aria-label="目标单位"]', 'f')
  assert.equal(await page.evaluate("document.querySelector('.unit-result strong').textContent.trim()"), '212')
  await shot(page, 'toolbox-unit.png')
  record('单位换算：1米=100厘米、2米=200、100°C=212°F')

  // 5. 返回，进倒计时
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'back to list failed')
  await clickToolCard(page, '倒计时与纪念日')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"目标日期\"]')"), 'countdown panel not shown')
  // 目标=今天 → 就是今天
  const today = await page.evaluate("Object.keys(JSON.parse(localStorage.getItem('checkin-dashboard:data')).targets).sort().at(-1)")
  await input(page, 'input[aria-label="目标日期"]', today)
  assert.equal(await page.evaluate("document.querySelector('.countdown-result__label').textContent.trim()"), '就是今天')
  // 目标=今天+10 → 还有 10 天
  const future = await page.evaluate(`(() => { const d = new Date(${q(today)} + 'T00:00:00'); d.setDate(d.getDate() + 10); const p = (n) => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()) })()`)
  await input(page, 'input[aria-label="目标日期"]', future)
  assert.match(await page.evaluate("document.querySelector('.countdown-result__label').textContent.trim()"), /^还有 10 天$/)
  record('倒计时：今天=就是今天，+10天=还有 10 天')

  // 6. 随机抽签：掷骰子 / 抛硬币 / 抽签 / 分组
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '随机抽签')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"骰子个数\"]')"), 'random panel not shown')
  // 掷骰子：3 个 6 面骰
  await input(page, 'input[aria-label="骰子个数"]', '3')
  await clickSel(page, '.tool-panel .btn--primary')
  const dice = await page.evaluate("[...document.querySelectorAll('.random-die')].map(e => Number(e.textContent))")
  assert.equal(dice.length, 3)
  assert.ok(dice.every((v) => Number.isInteger(v) && v >= 1 && v <= 6), 'dice out of range: ' + dice)
  assert.equal(await page.evaluate("document.querySelector('.random-result__sum').textContent.trim()"), '合计 ' + dice.reduce((a, b) => a + b, 0))
  // 抛硬币
  await clickChip(page, '抛硬币')
  await clickSel(page, '.tool-panel .btn--primary')
  const coins = await page.evaluate("[...document.querySelectorAll('.random-coin')].map(e => e.textContent.trim())")
  assert.equal(coins.length, 1)
  assert.ok(['正', '反'].includes(coins[0]))
  // 抽签：名单抽一个，结果必在名单内
  await clickChip(page, '抽签')
  await waitFor(() => page.evaluate("!!document.querySelector('textarea[aria-label=\"名单\"]')"), 'names textarea missing')
  await input(page, 'textarea[aria-label="名单"]', '张三\n李四\n王五')
  await clickSel(page, '.tool-panel .btn--primary')
  const picked = await page.evaluate("document.querySelector('.random-result--pick').textContent.trim()")
  assert.ok(['张三', '李四', '王五'].includes(picked), 'picked not in list: ' + picked)
  // 分组：3 人分 2 组，所有人都在、无重复
  await clickChip(page, '随机分组')
  await input(page, 'input[aria-label="分组数"]', '2')
  await clickSel(page, '.tool-panel .btn--primary')
  const groups = await page.evaluate("[...document.querySelectorAll('.random-group__names')].map(e => e.textContent.trim())")
  assert.equal(groups.length, 2)
  const flat = groups.join('、').split('、').sort()
  assert.deepEqual(flat, ['张三', '李四', '王五'].sort())
  await shot(page, 'toolbox-random.png')
  record('随机抽签：骰子范围/合计正确、抛硬币、抽签命中名单、3人分2组无遗漏')

  // 6.5 九宫格切图：造一张 300×300 图喂进文件输入，切成 3×3 → 9 张，每张 100×100
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '九宫格切图')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'slice panel not shown')
  // 用 canvas 现造一张 PNG blob，塞进文件输入（走 DataTransfer，同真实选文件）
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 300
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ff6b6b'; ctx.fillRect(0, 0, 300, 300); ctx.fillStyle = '#4ade80'; ctx.fillRect(100, 100, 100, 100)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'test.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.image-slice-preview img')"), 'image preview not shown')
  assert.equal(await page.evaluate("document.querySelector('.image-slice-preview .hint').textContent.trim()"), '300 × 300 px')
  await clickSel(page, '.tool-panel .btn--primary')
  await waitFor(() => page.evaluate("document.querySelectorAll('.slice-item').length === 9"), 'expected 9 slices')
  // 校验每张切图确实是 100×100（读 naturalWidth/Height）
  const dims = await page.evaluate(`Promise.all([...document.querySelectorAll('.slice-item img')].map(img => new Promise(res => { if (img.complete) res([img.naturalWidth, img.naturalHeight]); else img.onload = () => res([img.naturalWidth, img.naturalHeight]) })))`)
  assert.ok(dims.every(([w, h]) => w === 100 && h === 100), 'slice dims wrong: ' + JSON.stringify(dims))
  // 文件名正确（test-1-1.png …）
  assert.equal(await page.evaluate("document.querySelector('.slice-item__download').getAttribute('download')"), 'test-1-1.png')
  assert.equal(await page.evaluate("[...document.querySelectorAll('.slice-item__download')].at(-1).getAttribute('download')"), 'test-3-3.png')
  // 中央那格（第2行第2列）应命中绿色区域
  const centerGreen = await page.evaluate(`(async () => {
    const img = document.querySelectorAll('.slice-item img')[4]
    const c = document.createElement('canvas'); c.width = 100; c.height = 100
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(50, 50, 1, 1).data
    return [d[0], d[1], d[2]]
  })()`)
  assert.ok(centerGreen[1] > 150 && centerGreen[0] < 120, 'center slice not green: ' + centerGreen)
  await shot(page, 'toolbox-slice.png')
  record('九宫格切图：300×300 → 9 张 100×100、文件名正确、中央格命中绿色区域')

  // 6.6 图片压缩：造一张 400×400 噪点图，长边设 200 → 压成 200×200 且体积变小
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '图片压缩')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'compress panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400
    const ctx = c.getContext('2d'); const img = ctx.createImageData(400, 400)
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random()*255; img.data[i+1] = Math.random()*255; img.data[i+2] = Math.random()*255; img.data[i+3] = 255 }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'noise.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.compress-item img')"), 'original preview not shown')
  await input(page, 'input[aria-label="长边最大"]', '200')
  await clickSel(page, '.tool-panel .btn--primary')
  await waitFor(() => page.evaluate("document.querySelectorAll('.compress-item').length === 2"), 'compressed preview not shown')
  // 压缩后尺寸应为 200×200
  const compDims = await page.evaluate(`(() => { const img = document.querySelectorAll('.compress-item img')[1]; return [img.naturalWidth, img.naturalHeight] })()`)
  assert.deepEqual(compDims, [200, 200])
  // 体积必须变小，且摘要显示「体积减少」
  const summary = await page.evaluate("document.querySelector('.compress-summary__ok')?.textContent.trim()")
  assert.match(summary ?? '', /^体积减少 \d+%$/)
  await shot(page, 'toolbox-compress.png')
  record('图片压缩：400×400 长边限 200 → 200×200 且体积减少')

  // 6.7 文本字数统计：输入「你好world 2026」→ 汉字2 单词1 数字串1 字符数? 实测值断言
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '文本字数统计')
  await waitFor(() => page.evaluate("!!document.querySelector('textarea[aria-label=\"待统计文本\"]')"), 'text-stats panel not shown')
  await input(page, 'textarea[aria-label="待统计文本"]', '你好world 2026')
  const tiles = await page.evaluate("[...document.querySelectorAll('.stat-tile')].map(t => [t.querySelector('.stat-tile__label').textContent.trim(), Number(t.querySelector('.stat-tile__value').textContent)])")
  const tileMap = Object.fromEntries(tiles)
  assert.equal(tileMap['汉字'], 2)
  assert.equal(tileMap['英文单词'], 1)
  assert.equal(tileMap['数字串'], 1)
  // 「你好world 2026」可见字符 = 2 汉字 + 5 字母 + 4 数字 = 11（空格不算）
  assert.equal(tileMap['字符数'], 11)
  await shot(page, 'toolbox-text-stats.png')
  record('文本字数统计：你好world 2026 → 汉字2 单词1 数字1 字符11')

  // 6.8 加水印：深色图 + 白字，用「近白像素数」量化验证；平铺应显著增多
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '加水印')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'watermark panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400
    const ctx = c.getContext('2d'); ctx.fillStyle = '#282828'; ctx.fillRect(0, 0, 400, 400)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'dark.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("(() => { const i = document.querySelector('.watermark-preview img'); return !!i && i.naturalWidth > 0 })()"), 'watermark preview not shown')
  // 透明度调到 1，让白字是纯白，便于数近白像素
  await input(page, 'input[aria-label="透明度"]', '1')
  await delay(120)
  const countWhite = () => page.evaluate(`(() => {
    const img = document.querySelector('.watermark-preview img')
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200) n++ }
    return n
  })()`)
  const single = await countWhite()
  assert.ok(single > 0, 'single watermark produced no white pixels')
  // 位置 chips 默认可见；开启平铺后应隐藏
  assert.equal(await page.evaluate("!!document.querySelector('.filter[aria-label=\"水印位置\"]')"), true)
  await clickSel(page, '.check-inline input[type="checkbox"]')
  await delay(150)
  assert.equal(await page.evaluate("!!document.querySelector('.filter[aria-label=\"水印位置\"]')"), false)
  const tiled = await countWhite()
  assert.ok(tiled > single * 2, 'tiling did not increase watermark coverage: single=' + single + ' tiled=' + tiled)
  await shot(page, 'toolbox-watermark.png')
  record(`加水印：单水印近白像素 ${single}，平铺后 ${tiled}（显著增多），位置 chips 随平铺隐藏`)

  // 6.9 图片格式互转：PNG → JPEG，文件名变 .jpg、尺寸不变
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '图片格式互转')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'convert panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240
    const ctx = c.getContext('2d'); ctx.fillStyle = '#3355aa'; ctx.fillRect(0, 0, 320, 240)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'pic.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.compress-item img')"), 'original preview not shown')
  await input(page, 'select[aria-label="输出格式"]', 'image/jpeg')
  await clickSel(page, '.tool-panel .btn--primary')
  await waitFor(() => page.evaluate("document.querySelectorAll('.compress-item').length === 2"), 'converted preview not shown')
  const conv = await page.evaluate(`(() => {
    const img = document.querySelectorAll('.compress-item img')[1]
    const dl = document.querySelector('.compress-summary a[download]')
    return { w: img.naturalWidth, h: img.naturalHeight, name: dl?.getAttribute('download') }
  })()`)
  assert.equal(conv.w, 320); assert.equal(conv.h, 240)
  assert.equal(conv.name, 'pic.jpg')
  await shot(page, 'toolbox-convert.png')
  record('图片格式互转：PNG 320×240 → JPEG，尺寸不变、文件名 pic.jpg')

  // 6.10 裁剪旋转翻转：400×200 图，顺时针 90° 后应变 200×400；拖框后裁剪尺寸随之变
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '裁剪旋转翻转')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'crop panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200
    const ctx = c.getContext('2d'); ctx.fillStyle = '#2e7d32'; ctx.fillRect(0, 0, 400, 200)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'land.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.crop-overlay img')"), 'crop preview not shown')
  // 初始：变换后尺寸 400×200，裁剪区 = 全图 400×200
  let info = await page.evaluate("document.querySelector('.tool-panel .hint').textContent")
  assert.match(info, /变换后尺寸 400×200/)
  assert.match(info, /裁剪区域 400×200/)
  // 顺时针 90° → 200×400
  await page.evaluate(`[...document.querySelectorAll('.tool-panel .btn')].find(b => b.textContent.includes('顺时针')).click()`)
  await delay(150)
  info = await page.evaluate("document.querySelector('.tool-panel .hint').textContent")
  assert.match(info, /变换后尺寸 200×400/, 'rotation did not swap dimensions: ' + info)
  await shot(page, 'toolbox-crop.png')
  record('裁剪旋转翻转：400×200 顺时针 90° → 变换后 200×400（宽高互换）')

  // 6.11 打码马赛克：造棋盘格（细节多），框选打码后该区域颜色种类应大幅减少
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '打码与马赛克')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'mosaic panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200
    const ctx = c.getContext('2d'); const img = ctx.createImageData(200, 200)
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random()*255; img.data[i+1] = Math.random()*255; img.data[i+2] = Math.random()*255; img.data[i+3] = 255 }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'noise.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.crop-overlay img')"), 'mosaic preview not shown')
  // 用真实鼠标事件拖拽（合成 PointerEvent 不会触发 React 的 setPointerCapture，需走 CDP）
  const mrect = await page.evaluate(`(() => { const el=document.querySelector('.crop-overlay'); const r=el.getBoundingClientRect(); return {left:r.left, top:r.top, width:r.width, height:r.height} })()`)
  const mx1 = mrect.left + mrect.width * 0.25, my1 = mrect.top + mrect.height * 0.25
  const mx2 = mrect.left + mrect.width * 0.75, my2 = mrect.top + mrect.height * 0.75
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx1, y: my1, button: 'left', buttons: 1, clickCount: 1 })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (mx1 + mx2) / 2, y: (my1 + my2) / 2, button: 'left', buttons: 1 })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx2, y: my2, button: 'left', buttons: 1 })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx2, y: my2, button: 'left', buttons: 0, clickCount: 1 })
  await delay(120)
  assert.equal(await page.evaluate("!!document.querySelector('.crop-selection')"), true, 'selection box not created')
  // 记录打码前中心区域颜色种类
  const colorCountBefore = await page.evaluate(`(() => {
    const img = document.querySelector('.crop-overlay img'); const c = document.createElement('canvas'); c.width=img.naturalWidth;c.height=img.naturalHeight
    const ctx=c.getContext('2d'); ctx.drawImage(img,0,0); const d=ctx.getImageData(60,60,80,80).data; const s=new Set(); for(let i=0;i<d.length;i+=4) s.add(d[i]+','+d[i+1]+','+d[i+2]); return s.size
  })()`)
  // 强度拉高、点打码
  await input(page, 'input[aria-label="强度"]', '8')
  await page.evaluate(`[...document.querySelectorAll('.tool-panel .btn')].find(b => b.textContent.trim() === '打码').click()`)
  await delay(200)
  const colorCountAfter = await page.evaluate(`(() => {
    const img = document.querySelector('.crop-overlay img'); const c = document.createElement('canvas'); c.width=img.naturalWidth;c.height=img.naturalHeight
    const ctx=c.getContext('2d'); ctx.drawImage(img,0,0); const d=ctx.getImageData(60,60,80,80).data; const s=new Set(); for(let i=0;i<d.length;i+=4) s.add(d[i]+','+d[i+1]+','+d[i+2]); return s.size
  })()`)
  assert.ok(colorCountBefore > 2, 'checker should have many colors, got ' + colorCountBefore)
  assert.ok(colorCountAfter < colorCountBefore, 'mosaic did not reduce detail: before=' + colorCountBefore + ' after=' + colorCountAfter)
  await shot(page, 'toolbox-mosaic.png')
  record(`打码马赛克：中心区域颜色种类 ${colorCountBefore} → ${colorCountAfter}（细节被抹掉）`)

  // 6.12 证件照：绿底 + 中央红方块，换白底后四角应变白、中央保持红
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '证件照处理')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择照片\"]')"), 'id-photo panel not shown')
  await page.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 400
    const ctx = c.getContext('2d'); ctx.fillStyle = '#00cc00'; ctx.fillRect(0, 0, 300, 400); ctx.fillStyle = '#cc0000'; ctx.fillRect(110, 150, 80, 100)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'portrait.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择照片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.id-photo-preview img')"), 'id-photo preview not shown')
  // 默认白底。检查预览图：左上角像素近白、中央偏下像素近红
  const photoCheck = await page.evaluate(`(async () => {
    const img = document.querySelector('.id-photo-preview img')
    await new Promise((r) => { if (img.complete && img.naturalWidth) r(); else img.onload = r })
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const corner = ctx.getImageData(5, 5, 1, 1).data
    const center = ctx.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data
    return { w: c.width, h: c.height, corner: [corner[0], corner[1], corner[2]], center: [center[0], center[1], center[2]] }
  })()`)
  // 一寸 295×413
  assert.equal(photoCheck.w, 295); assert.equal(photoCheck.h, 413)
  // 角落背景换成白色
  assert.ok(photoCheck.corner[0] > 240 && photoCheck.corner[1] > 240 && photoCheck.corner[2] > 240, 'corner not white: ' + photoCheck.corner)
  // 中央红方块保留（红 > 绿/蓝）
  assert.ok(photoCheck.center[0] > 150 && photoCheck.center[0] > photoCheck.center[1], 'center red not preserved: ' + photoCheck.center)
  await shot(page, 'toolbox-idphoto.png')
  record(`证件照：绿底换白底成功（角落 ${photoCheck.corner}），中央红方块保留（${photoCheck.center}），尺寸 295×413`)

  // 6.13 长图拼接：两张 100×80 与 100×40，纵向拼接 → 画布 100×120（gap 0）
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '长图拼接')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'stitch panel not shown')
  await page.evaluate(`(async () => {
    const mk = async (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); return await new Promise((r) => c.toBlob(r, 'image/png')) }
    const b1 = await mk(100, 80, '#aa2222'); const b2 = await mk(100, 40, '#2222aa')
    const dt = new DataTransfer(); dt.items.add(new File([b1], 'a.png', { type: 'image/png' })); dt.items.add(new File([b2], 'b.png', { type: 'image/png' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("document.querySelectorAll('.compress-item').length >= 2"), 'stitch thumbnails not shown')
  await input(page, 'input[aria-label="间隔"]', '0')
  await page.evaluate(`[...document.querySelectorAll('.tool-panel .btn')].find(b => b.textContent.trim() === '拼接').click()`)
  await waitFor(() => page.evaluate("!!document.querySelector('.image-slice-preview img')"), 'stitch result not shown')
  const stitchDims = await page.evaluate(`(() => { const img = document.querySelector('.image-slice-preview img'); return [img.naturalWidth, img.naturalHeight] })()`)
  assert.deepEqual(stitchDims, [100, 120], 'stitch dims wrong: ' + stitchDims)
  await shot(page, 'toolbox-stitch.png')
  record(`长图拼接：100×80 + 100×40 纵向拼接 → ${stitchDims[0]}×${stitchDims[1]}`)

  // 6.14 图片转 PDF：两张图 → 下载按钮出现，blob 是合法 PDF（通过 fetch 读下载链接头）
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '图片转 PDF')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"选择图片\"]')"), 'pdf panel not shown')
  await page.evaluate(`(async () => {
    const mk = async (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)) }
    const b1 = await mk(120, 160, '#33aa33'); const b2 = await mk(120, 160, '#aa33aa')
    const dt = new DataTransfer(); dt.items.add(new File([b1], 'p1.jpg', { type: 'image/jpeg' })); dt.items.add(new File([b2], 'p2.jpg', { type: 'image/jpeg' }))
    const el = document.querySelector('input[aria-label="选择图片"]'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(() => page.evaluate("document.querySelectorAll('.compress-item').length >= 2"), 'pdf thumbnails not shown')
  // 拦截下载：改写 createObjectURL 捕获 blob，再读它的前几个字节验证 PDF 头
  const pdfHeader = await page.evaluate(`(async () => {
    const origCreate = URL.createObjectURL
    let captured = null
    URL.createObjectURL = (blob) => { if (blob && blob.type === 'application/pdf') captured = blob; return origCreate.call(URL, blob) }
    ;[...document.querySelectorAll('.tool-panel .btn--primary')].find(b => b.textContent.includes('PDF')).click()
    // 等生成
    for (let i = 0; i < 60 && !captured; i++) await new Promise(r => setTimeout(r, 50))
    URL.createObjectURL = origCreate
    if (!captured) return null
    const buf = new Uint8Array(await captured.arrayBuffer())
    return { type: captured.type, size: buf.length, header: String.fromCharCode(...buf.slice(0, 8)) }
  })()`)
  assert.ok(pdfHeader, 'pdf blob not captured')
  assert.equal(pdfHeader.type, 'application/pdf')
  assert.equal(pdfHeader.header, '%PDF-1.4')
  record(`图片转 PDF：两张图生成 ${pdfHeader.size} 字节 PDF，头部 ${pdfHeader.header}`)

  // 6.15 条形码：输入 "ABC123" 生成 canvas，宽度 > 0
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '条形码生成')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"条形码内容\"]')"), 'barcode panel not shown')
  await input(page, 'input[aria-label="条形码内容"]', 'ABC123')
  await waitFor(() => page.evaluate("!!document.querySelector('.barcode-preview canvas')"), 'barcode canvas not shown')
  const barcodeInfo = await page.evaluate(`(() => { const c = document.querySelector('.barcode-preview canvas'); const ctx = c.getContext('2d'); const d = ctx.getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++; return { w: c.width, h: c.height, dark } })()`)
  assert.ok(barcodeInfo.w > 0 && barcodeInfo.h > 0, 'barcode canvas empty')
  assert.ok(barcodeInfo.dark > 100, 'barcode has too few dark pixels: ' + barcodeInfo.dark)
  await shot(page, 'toolbox-barcode.png')
  record(`条形码：ABC123 → canvas ${barcodeInfo.w}×${barcodeInfo.h}，黑条像素 ${barcodeInfo.dark}`)

  // 6.16 网页分享：卡片列表渲染、搜索过滤、分类 chips、外链 target=_blank
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await clickToolCard(page, '有趣的网页分享')
  await waitFor(() => page.evaluate("!!document.querySelector('input[aria-label=\"搜索网站\"]')"), 'share panel not shown')
  const shareTotal = await page.evaluate("document.querySelectorAll('.share-card').length")
  assert.ok(shareTotal >= 10, 'share cards too few: ' + shareTotal)
  const firstLink = await page.evaluate(`(() => { const a = document.querySelector('.share-card'); return { target: a.getAttribute('target'), rel: a.getAttribute('rel'), href: a.getAttribute('href') } })()`)
  assert.equal(firstLink.target, '_blank')
  assert.ok(firstLink.rel.includes('noopener'))
  assert.ok(firstLink.href.startsWith('https://'))
  // 搜索过滤：输入一个必然减少结果的词
  await input(page, 'input[aria-label="搜索网站"]', 'zzzznotexist')
  await waitFor(() => page.evaluate("document.querySelectorAll('.share-card').length === 0"), 'search did not filter to 0')
  assert.equal(await page.evaluate("!!document.querySelector('.empty')"), true)
  await input(page, 'input[aria-label="搜索网站"]', '')
  await waitFor(() => page.evaluate(`document.querySelectorAll('.share-card').length === ${shareTotal}`), 'clear search did not restore')
  record(`网页分享：${shareTotal} 张卡片、外链 target=_blank、搜索过滤生效`)

  // 7. 桌面截图（工具列表）
  await clickText(page, '← 返回工具列表')
  await waitFor(() => page.evaluate("document.querySelectorAll('.tool-card').length === 16"), 'list')
  await shot(page, 'toolbox-desktop.png')

  // 7. 移动端 390 无横向溢出
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await delay(150)
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 1, 'mobile horizontal overflow: ' + overflow)
  await shot(page, 'toolbox-mobile.png')
  record('移动端 390px 无横向溢出')

  // 8. 切回签到视图，看板正常
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false })
  await clickText(page, '签到')
  await waitFor(() => page.evaluate("!!document.querySelector('.header') && !!document.querySelector('.dashboard-controls')"), 'dashboard not restored')
  record('切回签到视图，看板正常渲染')

  assert.deepEqual(failures, [], 'page had runtime exceptions')
  console.log('\nALL TOOLBOX CHECKS PASSED')
} catch (error) {
  console.error('FAIL:', error.message)
  process.exitCode = 1
} finally {
  for (const c of clients) c.close()
  for (const child of children) { try { child.kill() } catch {} }
  await delay(150)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
