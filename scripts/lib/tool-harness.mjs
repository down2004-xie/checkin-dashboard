/**
 * 单个工具的浏览器验收脚手架（零依赖，复用本机 Chrome/Edge，走 CDP）。
 *
 * 为什么另写一份而不是全塞进 toolbox-check.mjs：工具箱大修时多个子代理并行开发，
 * 每人要能单独验自己的工具。这里每次启动一个**独立的** Vite dev server
 * （独立端口 + 独立 cacheDir），多个脚本同时跑也不会抢同一个依赖预构建缓存。
 *
 * 用法（scripts/checks/<tool-id>.mjs）：
 *   import { runToolCheck } from '../lib/tool-harness.mjs'
 *   await runToolCheck('答案之书', async (t) => {
 *     await t.click('.answer-book__button')
 *     t.pass('翻开后出现答案')
 *   })
 * 运行：node scripts/checks/<tool-id>.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export { assert }

const workspace = fileURLToPath(new URL('../..', import.meta.url))
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const q = JSON.stringify

const freePort = () => new Promise((done, reject) => {
  const s = netServer(); s.on('error', reject)
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)) })
})

async function waitFor(check, message, timeout = 20000) {
  const end = Date.now() + timeout; let last
  while (Date.now() < end) {
    try { if (await check()) return } catch (error) { last = error }
    await delay(60)
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`)
}

async function connect(address, failures) {
  const socket = new WebSocket(address)
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let seq = 0; const pending = new Map()
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data)
    if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    const w = pending.get(m.id); if (!w) return
    clearTimeout(w.timer); pending.delete(m.id)
    if (m.error) w.reject(new Error(JSON.stringify(m.error))); else w.done(m.result)
  })
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)) }, 30000)
    pending.set(id, { done, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  await send('Runtime.enable'); await send('Page.enable')
  return { send, evaluate, close: () => socket.close() }
}

/**
 * 启动 dev server + 无头浏览器，切到工具箱、点开名为 toolName 的工具卡，然后把操作句柄交给 body。
 * body 抛错 = 验收失败（进程退出码 1）；页面上出现未捕获异常也算失败。
 */
export async function runToolCheck(toolName, body) {
  const browser = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(existsSync)
  assert(browser, 'Set CHROME_PATH to a Chrome/Chromium executable')
  const scratch = await mkdtemp(join(resolve(tmpdir()), 'tool-check-'))
  const port = await freePort(); const debugPort = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const children = []; const failures = []; let page
  const launch = (cmd, args) => {
    const c = spawn(cmd, args, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    c.on('error', (e) => failures.push(e.message)); children.push(c); return c
  }
  try {
    // 默认用独立缓存的 dev server；PDF 附件等需额外验证正式产物时显式选择 preview。
    if (process.env.TOOL_CHECK_PREVIEW === '1') {
      launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
    } else {
      launch(process.execPath, ['scripts/lib/dev-server.mjs', String(port), join(scratch, 'vite-cache')])
    }
    await waitFor(async () => (await fetch(origin)).ok, 'app server down', 60000)
    launch(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(scratch, 'profile')}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'])
    await waitFor(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).ok, 'debug port down')
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, failures)
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await page.send('Page.navigate', { url: origin })
    await waitFor(() => page.evaluate("!!document.querySelector('.dashboard-controls')"), 'app not ready', 60000)
    await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '工具箱').click()`)
    await waitFor(() => page.evaluate("!!document.querySelector('.tool-card')"), 'toolbox not shown')
    await page.evaluate(`(() => { const el = [...document.querySelectorAll('.tool-card')].find(c => c.querySelector('.tool-card__name')?.textContent.trim() === ${q(toolName)}); if (!el) throw new Error('missing tool card ' + ${q(toolName)}); el.click() })()`)
    await waitFor(() => page.evaluate("!!document.querySelector('.tool-panel') && !document.querySelector('.toolbox__loading')"), 'tool panel not shown', 30000)

    const t = {
      page, assert, delay, origin,
      /** 在页面里执行表达式（可 await），返回可序列化的值 */
      eval: (expression) => page.evaluate(expression),
      waitFor: (expression, message, timeout) => waitFor(() => page.evaluate(expression), message || `waitFor: ${expression}`, timeout),
      click: async (selector) => { await page.evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) throw new Error('missing ' + ${q(selector)}); if (el.disabled) throw new Error('disabled ' + ${q(selector)}); el.click() })()`); await delay(80) },
      clickText: async (text, scope = '.tool-panel') => { await page.evaluate(`(() => { const el = [...document.querySelectorAll(${q(scope + ' button, ' + scope + ' a, ' + scope + ' label')})].find(b => b.textContent.trim() === ${q(text)}); if (!el) throw new Error('missing text ' + ${q(text)}); if (el.disabled) throw new Error('disabled ' + ${q(text)}); el.click() })()`); await delay(80) },
      /** 用 React 认得的方式改 input / textarea / select 的值 */
      input: async (selector, value) => { await page.evaluate(`(() => { const el = document.querySelector(${q(selector)}); if (!el) throw new Error('missing ' + ${q(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })()`); await delay(60) },
      /**
       * 往文件输入框塞文件。filesExpr 是一段在页面里求值、返回 File[] 的 JS 表达式（可 async），
       * 例如用 canvas 现造 PNG。selector 默认按 FilePicker 的 aria-label 找。
       */
      setFiles: async (filesExpr, selector = '.tool-panel input[type=file]') => { await page.evaluate(`(async () => { const files = await (${filesExpr}); const dt = new DataTransfer(); for (const f of files) dt.items.add(f); const el = document.querySelector(${q(selector)}); if (!el) throw new Error('missing file input'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })) })()`); await delay(120) },
      /** 截图到临时目录（路径打印出来，方便人工看一眼） */
      shot: async (name) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); const file = join(scratch, name); await writeFile(file, Buffer.from(data, 'base64')); console.log(`  shot: ${file}`) },
      pass: (message) => console.log(`PASS ${message}`),
    }
    await body(t)
    assert.deepEqual(failures, [], 'page had runtime exceptions')
    console.log(`\nALL CHECKS PASSED: ${toolName}`)
  } catch (error) {
    console.error('FAIL:', error.message)
    if (failures.length) console.error('page exceptions:', failures)
    process.exitCode = 1
  } finally {
    page?.close()
    for (const child of children) { try { child.kill() } catch { /* already gone */ } }
    await delay(300)
    // 截图留着方便人工查看，只删浏览器 profile 和 vite 缓存
    await rm(join(scratch, 'profile'), { recursive: true, force: true }).catch(() => {})
    await rm(join(scratch, 'vite-cache'), { recursive: true, force: true }).catch(() => {})
  }
}
