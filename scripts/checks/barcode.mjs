// 条形码工具的单工具验收（也是 tool-harness 的示例）。运行：node scripts/checks/barcode.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const CANVAS_WIDTH = "document.querySelector('.barcode-preview canvas')?.width ?? null"
const DOWNLOAD_DISABLED = "[...document.querySelectorAll('.tool-panel button')].find(b => b.textContent.trim() === '下载 PNG').disabled"
const ALERT = "document.querySelector('.tool-panel [role=alert]')?.textContent.trim() ?? null"

await runToolCheck('条形码生成', async (t) => {
  const { assert } = t
  await t.input('input[aria-label="条形码内容"]', 'ABC-123')
  await t.waitFor("!!document.querySelector('.barcode-preview canvas')", 'barcode canvas not rendered')
  const width = await t.eval(CANVAS_WIDTH)
  // Code B：(7 + 3) * 11 + 2 = 112 模块，× 3px + 两侧静区 2 × 10 × 3px
  assert.equal(width, 112 * 3 + 60)
  t.pass(`ABC-123（Code B）渲染出条形码，画布宽 ${width}px`)

  // 纯数字走 Code C：16 位数字 = 8 个符号，(8 + 3) * 11 + 2 = 123 模块
  await t.input('input[aria-label="条形码内容"]', '1234567890123456')
  const digitsWidth = await t.eval(CANVAS_WIDTH)
  assert.equal(digitsWidth, 123 * 3 + 60)
  assert.match(await t.eval("document.querySelector('.tool-panel').textContent"), /Code Set C/)
  t.pass(`16 位纯数字走 Code Set C，画布宽 ${digitsWidth}px（Code B 需 ${(19 * 11 + 2) * 3 + 60}px）`)

  // 长度上限：80 可以，81 和 2000 给提示、不画、不能下载
  await t.input('input[aria-label="条形码内容"]', 'A'.repeat(80))
  assert.ok((await t.eval(CANVAS_WIDTH)) > 0)
  assert.equal(await t.eval(DOWNLOAD_DISABLED), false)
  for (const length of [81, 2000]) {
    await t.input('input[aria-label="条形码内容"]', 'A'.repeat(length))
    assert.match((await t.eval(ALERT)) ?? '', new RegExp(`内容太长：最多 80 个字符，当前 ${length} 个`))
    assert.equal(await t.eval(CANVAS_WIDTH), null)
    assert.equal(await t.eval(DOWNLOAD_DISABLED), true)
  }
  t.pass('80 字符正常生成；81 / 2000 字符提示超长、不画布、下载禁用')

  // 下载：click() 之后不能立刻 revokeObjectURL
  await t.input('input[aria-label="条形码内容"]', 'ABC-123')
  await t.eval(`(() => {
    window.__dl = { clicked: null, revoked: [] }
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => { window.__dl.revoked.push(url); revoke(url) }
    HTMLAnchorElement.prototype.click = function () { window.__dl.clicked = { href: this.href, download: this.download } }
  })()`)
  await t.clickText('下载 PNG')
  await t.waitFor('!!window.__dl.clicked', 'download anchor not clicked')
  await t.delay(500)
  const dl = await t.eval('window.__dl')
  assert.equal(dl.clicked.download, 'barcode.png')
  assert.match(dl.clicked.href, /^blob:/)
  assert.deepEqual(dl.revoked, [], 'object URL revoked right after click')
  t.pass('下载触发 barcode.png（blob URL），click 后 500ms 内没有 revoke')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.input('input[aria-label="条形码内容"]', 'A'.repeat(60))
  await t.delay(200)
  const layout = await t.eval("({ page: document.documentElement.scrollWidth, preview: document.querySelector('.barcode-preview').scrollWidth, previewBox: document.querySelector('.barcode-preview').clientWidth })")
  assert.ok(layout.page <= 390, `horizontal overflow at 390px: ${layout.page}`)
  t.pass(`390px 宽 60 字符条码：页面 scrollWidth ${layout.page}，预览区内部滚动（${layout.preview} > ${layout.previewBox}）`)
})
