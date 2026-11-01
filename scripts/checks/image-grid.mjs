// 九宫格切图单工具验收。运行：node scripts/checks/image-grid.mjs
// 覆盖旧 toolbox-check 契约、居中裁方形、ZIP、三种选文件入口、换图竞态/错误与亮色窄屏。
import { runToolCheck } from '../lib/tool-harness.mjs'

/** 页面里用 Canvas 现造 PNG，返回 File[]；不依赖仓库 fixture。 */
const pngFiles = (width, height, name, draw) => `(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${width}; canvas.height = ${height}
  const ctx = canvas.getContext('2d'); (${draw})(ctx, canvas)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return [new File([blob], ${JSON.stringify(name)}, { type: 'image/png' })]
})()`

const solid = (color) => `(ctx, canvas) => { ctx.fillStyle = ${JSON.stringify(color)}; ctx.fillRect(0, 0, canvas.width, canvas.height) }`

await runToolCheck('九宫格切图', async (t) => {
  const { assert } = t
  const sourceHint = () => t.eval("document.querySelector('.image-slice-preview .hint')?.textContent.trim() ?? ''")
  const waitSource = async (text) => {
    await t.waitFor(`document.querySelector('.image-slice-preview .hint')?.textContent.trim() === ${JSON.stringify(text)}`, `source preview not ready: ${text}`)
  }
  const cut = async () => {
    await t.clickText('切图')
    await t.waitFor("document.querySelectorAll('.slice-item').length === 9 && ![...document.querySelectorAll('.tool-panel button')].some((button) => button.textContent.includes('切图中'))", 'nine slices not ready', 30000)
  }

  // 1. 旧共享断言兼容：300×300 默认 3×3，九张 100×100，命名与中央像素不变。
  await t.setFiles(pngFiles(300, 300, 'test.png', `(ctx) => {
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(0, 0, 300, 300)
    ctx.fillStyle = '#4ade80'; ctx.fillRect(100, 100, 100, 100)
  }`), 'input[aria-label="选择图片"]')
  await waitSource('300 × 300 px')
  assert.deepEqual(await t.eval("(() => { const img = document.querySelector('.image-slice-preview img'); return [img.naturalWidth, img.naturalHeight] })()"), [300, 300])
  await cut()
  const compatibility = await t.eval(`(async () => {
    const images = [...document.querySelectorAll('.slice-item img')]
    await Promise.all(images.map((img) => img.complete && img.naturalWidth ? null : new Promise((resolve) => { img.onload = resolve })))
    const center = images[4]; const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100
    const ctx = canvas.getContext('2d'); ctx.drawImage(center, 0, 0)
    return {
      dims: images.map((img) => [img.naturalWidth, img.naturalHeight]),
      names: [...document.querySelectorAll('.slice-item__download')].map((link) => link.download),
      center: [...ctx.getImageData(50, 50, 1, 1).data.slice(0, 3)],
    }
  })()`)
  assert.ok(compatibility.dims.every(([width, height]) => width === 100 && height === 100), JSON.stringify(compatibility.dims))
  assert.equal(compatibility.names[0], 'test-1-1.png')
  assert.equal(compatibility.names.at(-1), 'test-3-3.png')
  assert.ok(compatibility.center[1] > 150 && compatibility.center[0] < 120, 'center slice not green: ' + compatibility.center)
  t.pass('兼容旧契约：300×300 → 9 张 100×100，文件名与中央绿色像素正确')

  // 2. 「全部下载」只能触发一次，并且 ZIP 里正好是九个同名 PNG。
  const zip = await t.eval(`(async () => {
    let captured = null; let clicks = 0
    const original = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { clicks += 1; captured = { href: this.href, name: this.download } }
    try {
      const button = [...document.querySelectorAll('.tool-panel button')].find((item) => item.textContent.includes('全部下载 ZIP'))
      button.click()
      for (let index = 0; index < 100 && !captured; index += 1) await new Promise((resolve) => setTimeout(resolve, 30))
      if (!captured) throw new Error('ZIP download not triggered')
      const blob = await (await fetch(captured.href)).blob()
      const bytes = new Uint8Array(await blob.arrayBuffer()); const view = new DataView(bytes.buffer)
      const entries = []; let offset = 0
      while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true)
        const nameLength = view.getUint16(offset + 26, true); const extraLength = view.getUint16(offset + 28, true)
        const nameStart = offset + 30; const dataStart = nameStart + nameLength + extraLength
        const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength))
        const png = view.getUint32(dataStart, false) === 0x89504e47
        entries.push({ name, size, png, width: view.getUint32(dataStart + 16, false), height: view.getUint32(dataStart + 20, false) })
        offset = dataStart + size
      }
      return { name: captured.name, type: blob.type, clicks, entries }
    } finally {
      HTMLAnchorElement.prototype.click = original
    }
  })()`)
  assert.equal(zip.clicks, 1, 'all download must trigger one browser download')
  assert.equal(zip.name, 'test-slices.zip')
  assert.equal(zip.type, 'application/zip')
  assert.equal(zip.entries.length, 9)
  assert.deepEqual(zip.entries.map((entry) => entry.name), compatibility.names)
  assert.ok(zip.entries.every((entry) => entry.png && entry.width === 100 && entry.height === 100), JSON.stringify(zip.entries))
  t.pass('全部下载：只触发 1 次，ZIP 内 9 张 100×100 PNG，文件名逐项正确')

  // 3. 900×600 横图只显示 720×480 缩略预览；打开居中裁方形后导出九张 200×200。
  await t.click('input[aria-label="居中裁成正方形"]')
  await t.setFiles(pngFiles(900, 600, 'wide.png', `(ctx) => {
    ctx.fillStyle = '#ef4444'; ctx.fillRect(0, 0, 150, 600)
    ctx.fillStyle = '#22c55e'; ctx.fillRect(150, 0, 600, 600)
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(750, 0, 150, 600)
  }`))
  await waitSource('900 × 600 px')
  const preview = await t.eval("(() => { const img = document.querySelector('.image-slice-preview img'); return [img.naturalWidth, img.naturalHeight, document.querySelector('.image-grid__preview-note')?.textContent ?? ''] })()")
  assert.deepEqual(preview.slice(0, 2), [720, 480])
  assert.match(preview[2], /缩小预览/)
  await cut()
  const square = await t.eval(`(async () => {
    const links = [...document.querySelectorAll('.slice-item__download')]
    const out = []
    for (const link of links) {
      const bitmap = await createImageBitmap(await (await fetch(link.href)).blob())
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0)
      const pixel = [...ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data.slice(0, 3)]
      out.push({ width: bitmap.width, height: bitmap.height, pixel }); bitmap.close()
    }
    return out
  })()`)
  assert.ok(square.every((item) => item.width === 200 && item.height === 200), JSON.stringify(square))
  assert.ok(square.every((item) => item.pixel[1] > 150 && item.pixel[0] < 100), 'center crop leaked side pixels: ' + JSON.stringify(square))
  t.pass('居中裁方形：900×600 原图只预览 720×480，导出 9 张 200×200 且像素都来自中央绿色正方形')

  // 4. 拖放入口：接收新图并立即清掉旧切片。
  await t.eval(`(async () => {
    const [file] = await (${pngFiles(120, 90, 'drop.png', solid('#f59e0b'))})
    const transfer = new DataTransfer(); transfer.items.add(file)
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    document.querySelector('.file-picker__zone').dispatchEvent(event)
  })()`)
  await waitSource('120 × 90 px')
  assert.equal(await t.eval("document.querySelectorAll('.slice-item').length"), 0)
  t.pass('拖放入口：图片成功载入，旧切片同步失效')

  // 5. Ctrl+V 粘贴入口：window paste 的图片文件走同一条加载链。
  await t.eval(`(async () => {
    const [file] = await (${pngFiles(90, 120, 'paste.png', solid('#3b82f6'))})
    const transfer = new DataTransfer(); transfer.items.add(file)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.dispatchEvent(event)
  })()`)
  await waitSource('90 × 120 px')
  t.pass('粘贴入口：Ctrl+V 图片成功载入')

  // 6. 快速连选 A/B：故意让 A 的 onload 晚 300ms 回来，最终必须一直是 B。
  await t.eval(`(async () => {
    const NativeImage = window.Image; let created = 0
    window.Image = function (...args) {
      const image = new NativeImage(...args); const order = ++created; let handler = null
      Object.defineProperty(image, 'onload', { configurable: true, get: () => handler, set: (next) => { handler = next } })
      image.addEventListener('load', (event) => window.setTimeout(() => handler?.call(image, event), order === 1 ? 300 : 0))
      return image
    }
    window.Image.prototype = NativeImage.prototype
    const make = async (width, height, name, color) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      return new File([blob], name, { type: 'image/png' })
    }
    const input = document.querySelector('input[aria-label="选择图片"]')
    const dispatch = (file) => { const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })) }
    dispatch(await make(240, 160, 'race-a.png', '#ef4444'))
    await new Promise((resolve) => setTimeout(resolve, 80))
    dispatch(await make(120, 80, 'race-b.png', '#22c55e'))
    window.setTimeout(() => { window.Image = NativeImage }, 700)
  })()`)
  await waitSource('120 × 80 px')
  await t.delay(500)
  assert.equal(await sourceHint(), '120 × 80 px')
  await cut()
  assert.equal(await t.eval("document.querySelector('.slice-item__download').download"), 'race-b-1-1.png')
  t.pass('异步竞态：晚到的 A 未覆盖 B，切片文件名仍属于 race-b.png')

  // 7. 换成 MIME 合法但内容损坏的 PNG：必须清掉 B 和其结果，不得继续下载旧图。
  await t.setFiles(`(async () => [new File([new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3])], 'broken.png', { type: 'image/png' })])()`)
  await t.waitFor("document.querySelector('[role=alert]')?.textContent.includes('broken.png')", 'broken image error not shown')
  assert.equal(await t.eval("!!document.querySelector('.image-slice-preview img')"), false)
  assert.equal(await t.eval("document.querySelectorAll('.slice-item').length"), 0)
  assert.equal(await t.eval("[...document.querySelectorAll('.tool-panel button')].find((button) => button.textContent.trim() === '切图').disabled"), true)
  t.pass('换图错误：损坏 PNG 清掉旧预览/旧结果并禁用切图，显示明确错误')

  // 8. 恢复一张图，在 390px 亮色外观下检查完整结果不横向溢出、token 确实切到亮色。
  await t.setFiles(pngFiles(300, 300, 'mobile.png', solid('#a855f7')))
  await waitSource('300 × 300 px')
  await cut()
  await t.eval("document.documentElement.dataset.appearance = 'light'")
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const mobile = await t.eval(`(() => {
    const item = getComputedStyle(document.querySelector('.slice-item'))
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      background: item.backgroundColor,
      columns: getComputedStyle(document.querySelector('.slice-grid')).gridTemplateColumns.split(' ').length,
    }
  })()`)
  assert.ok(mobile.overflow <= 0, 'horizontal overflow at 390px: ' + mobile.overflow)
  assert.equal(mobile.scheme, 'light')
  assert.notEqual(mobile.background, 'rgba(0, 0, 0, 0)')
  assert.equal(mobile.columns, 2)
  await t.shot('image-grid-light-390.png')
  t.pass(`390px 亮色：无横向溢出（${mobile.overflow}px），两列切片且亮色 surface token 生效`)
})
