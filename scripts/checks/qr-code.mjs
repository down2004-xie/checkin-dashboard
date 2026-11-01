// 二维码生成与识别的单工具验收。运行：node scripts/checks/qr-code.mjs
//
// 核心一条：生成的二维码 canvas 转成 File 喂给识别，识别出的文本必须和输入一致 ——
// 同时验证了生成和识别。识别分三条路径各走一次：浏览器自带（用假 BarcodeDetector 控制返回值）、
// 自带没认出来 → jsQR、浏览器根本没有 BarcodeDetector → jsQR。
import { runToolCheck } from '../lib/tool-harness.mjs'

const CANVAS = '.qr-preview canvas'
const fileFromCanvas = `new Promise((done) => document.querySelector('${CANVAS}').toBlob((b) => done([new File([b], 'qr.png', { type: 'image/png' })]), 'image/png'))`
// 外层括号不能省：JS 不允许 ?? 和 || / && 不加括号混写
const resultText = "(document.querySelector('.qr-result__text')?.textContent ?? null)"
const engine = "(document.querySelector('.qr-engine')?.dataset.engine ?? null)"

await runToolCheck('二维码生成与识别', async (t) => {
  // 主视图不该预载任何工具的库：打开二维码工具后，pdf-lib 不应出现在已加载资源里
  const pdfLoaded = await t.eval("performance.getEntriesByType('resource').some((e) => e.name.includes('pdf-lib'))")
  t.assert.equal(pdfLoaded, false, 'pdf-lib should not load for the QR tool')

  const content = 'https://example.com/签到?id=42&from=qr'
  await t.input('textarea[aria-label="二维码内容"]', content)
  await t.waitFor(`document.querySelector('${CANVAS}').width > 0 && !document.querySelector('.qr-preview--hidden')`, 'qr canvas not rendered')
  t.pass(`输入网址后生成二维码，画布 ${await t.eval(`document.querySelector('${CANVAS}').width`)}px`)

  // 真实环境：这台浏览器有没有自带识别都行，结果必须和输入一致
  const nativeExists = await t.eval("typeof window.BarcodeDetector === 'function'")
  await t.setFiles(fileFromCanvas)
  await t.waitFor(`${resultText} !== null || !!document.querySelector('.qr-result .site-form__error')`, 'scan did not finish', 20000)
  t.assert.equal(await t.eval(resultText), content, 'decoded text should equal input')
  t.pass(`生成 → 识别往返一致（引擎 ${await t.eval(engine)}，浏览器${nativeExists ? '有' : '没有'} BarcodeDetector）`)

  const link = await t.eval("(() => { const a = document.querySelector('.qr-result__open'); return a && { href: a.href, rel: a.rel, target: a.target } })()")
  t.assert.ok(link, 'https result should get an open-link button')
  t.assert.equal(link.rel, 'noopener noreferrer')
  t.assert.equal(link.target, '_blank')
  t.assert.ok(link.href.startsWith('https://example.com/'), link.href)
  t.assert.match(await t.eval("document.querySelector('.qr-result').textContent"), /即将前往 example\.com.*确认这个网址可信/)
  t.pass('https 结果给出「打开链接」，rel=noopener noreferrer，并提示先确认网址可信')

  // 换成假的 BarcodeDetector，控制「自带识别」的返回值。先存原物，最后还原
  await t.eval(`(() => {
    window.__realDetector = window.BarcodeDetector
    window.__fakeResult = []
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code'] } async detect() { return window.__fakeResult.map((rawValue) => ({ rawValue, format: 'qr_code' })) } }
  })()`)

  // 1) 自带识别返回恶意 javascript: 内容 → 只显示文本，绝不渲染成链接
  await t.eval("window.__fakeResult = ['javascript:alert(document.cookie)']")
  await t.setFiles(fileFromCanvas)
  await t.waitFor(`${resultText} === 'javascript:alert(document.cookie)'`, 'fake native result not shown')
  t.assert.equal(await t.eval(engine), 'native')
  t.assert.equal(await t.eval("document.querySelectorAll('.qr-result a').length"), 0, 'javascript: must not become a link')
  t.assert.equal(await t.eval("document.querySelectorAll('.tool-panel [href^=\"javascript\" i]').length"), 0)
  t.assert.match(await t.eval("document.querySelector('.qr-engine').textContent"), /浏览器自带（BarcodeDetector）/)
  t.pass('javascript: 结果只显示文字，面板里没有任何 javascript: 链接；界面标明用的是浏览器自带引擎')

  // 2) 自带识别没认出来 → jsQR 兜底，结果仍和输入一致
  await t.eval('window.__fakeResult = []')
  await t.setFiles(fileFromCanvas)
  await t.waitFor(`${engine} === 'jsqr' && ${resultText} === ${JSON.stringify(content)}`, 'jsqr fallback after empty native result failed')
  t.assert.match(await t.eval("document.querySelector('.qr-engine').textContent"), /自带识别没认出来，已用 jsQR 再试一次/)
  t.pass('自带识别返回空 → jsQR 兜底识别成功，界面写明原因')

  // 3) 浏览器没有 BarcodeDetector（Firefox 等）→ 直接走 jsQR
  await t.eval('delete window.BarcodeDetector')
  await t.setFiles(fileFromCanvas)
  await t.waitFor(`${engine} === 'jsqr' && /没有自带二维码识别/.test(document.querySelector('.qr-engine').textContent)`, 'jsqr path without BarcodeDetector failed')
  t.assert.equal(await t.eval(resultText), content)
  t.pass('没有 BarcodeDetector 时直接用 jsQR，结果一致')
  await t.eval('if (window.__realDetector) window.BarcodeDetector = window.__realDetector')

  // 识别不出来：一张纯白图
  await t.setFiles(`new Promise((done) => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); c.toBlob((b) => done([new File([b], 'blank.png', { type: 'image/png' })]), 'image/png') })`)
  await t.waitFor("/没有识别出二维码/.test(document.querySelector('.qr-result')?.textContent ?? '')", 'blank image should report not found')
  t.pass('没有二维码的图片提示「没有识别出二维码」')

  // 容量：2500 字节在 H 级装不下（上限 1273），L 级装得下（上限 2953）
  await t.input('textarea[aria-label="二维码内容"]', 'x'.repeat(2500))
  await t.clickText('H')
  await t.waitFor("/内容太长/.test(document.querySelector('.tool-panel [role=alert]')?.textContent ?? '')", 'too-long error not shown')
  t.assert.equal(await t.eval("[...document.querySelectorAll('.tool-panel button')].find((b) => b.textContent === '下载 PNG').disabled"), true)
  await t.clickText('L')
  await t.waitFor("!/内容太长/.test(document.querySelector('.tool-panel').textContent) && !document.querySelector('.qr-preview--hidden')", 'switching to L should fix capacity error')
  t.pass('内容超出 H 级容量时提示「内容太长，换低纠错级别」，换 L 级后恢复生成')

  // 低对比度提示
  await t.input('input[aria-label="前景色"]', '#ffb7d5')
  await t.waitFor("/对比度/.test(document.querySelector('.qr-warning')?.textContent ?? '')", 'low contrast warning not shown')
  await t.input('input[aria-label="前景色"]', '#000000')
  await t.waitFor("!document.querySelector('.qr-warning')", 'contrast warning should clear')
  t.pass('浅粉前景 + 白底提示对比度过低，改回黑色后提示消失')

  // 下载 PNG / SVG：拦截 createObjectURL 看实际交出去的 Blob
  await t.input('textarea[aria-label="二维码内容"]', content)
  await t.eval("(() => { window.__blobs = []; const real = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return real(b) }; HTMLAnchorElement.prototype.click = function () { window.__lastDownload = this.download } })()")
  await t.clickText('下载 PNG')
  await t.waitFor("window.__blobs.length === 1", 'png blob not created')
  t.assert.equal(await t.eval('window.__blobs[0].type'), 'image/png')
  await t.clickText('下载 SVG')
  await t.waitFor("window.__blobs.length === 2", 'svg blob not created')
  const svg = await t.eval("window.__blobs[1].text().then((s) => ({ type: window.__blobs[1].type, head: s.slice(0, 4), name: window.__lastDownload }))")
  t.assert.deepEqual(svg, { type: 'image/svg+xml', head: '<svg', name: 'qrcode.svg' })
  t.pass('下载 PNG（image/png）和 SVG（image/svg+xml，内容以 <svg 开头）')

  // 390px 宽 + 2048px 二维码不能横向溢出
  await t.input('input[aria-label="二维码尺寸"]', '2048')
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  t.assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`)
  t.assert.equal(await t.eval(`document.querySelector('${CANVAS}').width`), 2048, 'export resolution stays 2048')
  t.pass('390px 宽下 2048px 二维码只缩小显示、不横向溢出，导出分辨率仍是 2048')
})
