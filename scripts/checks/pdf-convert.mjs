// 图片转 PDF 的单工具验收。运行：node scripts/checks/pdf-convert.mjs
// 覆盖：A4 默认（MediaBox / 页数 / 头）、JPEG 原字节透传、PNG 走 canvas、排序、移除、
// 原尺寸模式按 96dpi、EXIF 方向 6 的竖拍（用 pdf.js 真渲染出来看颜色）、HEIC 提示、390px。
import { runToolCheck } from '../lib/tool-harness.mjs'

const PRELUDE = `(() => {
  // 左红右蓝的图：转向后看颜色在哪一边就知道方向对不对
  window.__mkBlob = async (w, h, type, colors = ['#dd2222', '#2222dd']) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d'); ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, w / 2, h); ctx.fillStyle = colors[1]; ctx.fillRect(w / 2, 0, w / 2, h)
    return await new Promise((r) => c.toBlob(r, type, 0.9))
  }
  // 在 SOI 后插一段只含 Orientation 的 EXIF APP1（大端）
  window.__withOrientation = async (blob, orientation) => {
    const src = new Uint8Array(await blob.arrayBuffer())
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
    const len = payload.length + 2
    const out = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, ...src.slice(2)])
    return new Blob([out], { type: 'image/jpeg' })
  }
  window.__files = {}
  window.__downloads = []
  HTMLAnchorElement.prototype.click = function () { window.__downloads.push({ href: this.href, name: this.download }) }
  // 点「生成」，等下载，按 blob URL 读回 PDF（toolbox-check 也是这么读的）
  window.__generate = async () => {
    const n = __downloads.length
    ;[...document.querySelectorAll('.tool-panel .btn--primary')].find((b) => b.textContent.includes('PDF')).click()
    for (let i = 0; i < 200 && __downloads.length === n; i++) await new Promise((r) => setTimeout(r, 50))
    if (__downloads.length === n) throw new Error('no download')
    const d = __downloads[n]
    const bytes = new Uint8Array(await (await fetch(d.href)).arrayBuffer())
    let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
    window.__lastPdf = bytes
    return { name: d.name, size: bytes.length, head: text.slice(0, 8), count: Number(/\\/Count (\\d+)/.exec(text)?.[1]),
      pages: (text.match(/\\/Type \\/Page /g) || []).length, boxes: [...text.matchAll(/\\/MediaBox \\[([^\\]]+)\\]/g)].map((m) => m[1]),
      colorSpaces: [...text.matchAll(/\\/ColorSpace \\/(\\w+)/g)].map((m) => m[1]) }
  }
  // 原始字节在 PDF 里的位置（-1 = 没有原样出现）
  window.__indexOf = (needle) => {
    const hay = __lastPdf
    outer: for (let i = 0; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i }
    return -1
  }
})()`

await runToolCheck('图片转 PDF', async (t) => {
  await t.eval(PRELUDE)
  const label = 'input[aria-label="选择图片"]'
  t.assert.ok(await t.eval(`!!document.querySelector('${label}')`), 'FilePicker 的 aria-label 应为「选择图片」')
  // 1. 两张 JPEG + 一张 PNG，默认 A4
  await t.setFiles(`(async () => {
    const p1 = await __mkBlob(120, 160, 'image/jpeg'); const p2 = await __mkBlob(120, 160, 'image/jpeg', ['#22aa22', '#aa22aa']); const p3 = await __mkBlob(200, 100, 'image/png')
    __files.p1 = new Uint8Array(await p1.arrayBuffer()); __files.p2 = new Uint8Array(await p2.arrayBuffer())
    return [new File([p1], 'p1.jpg', { type: 'image/jpeg' }), new File([p2], 'p2.jpg', { type: 'image/jpeg' }), new File([p3], 'p3.png', { type: 'image/png' })]
  })()`, label)
  await t.waitFor("document.querySelectorAll('.compress-item').length === 3", 'thumbnails not shown')
  let pdf = await t.eval('__generate()')
  t.assert.equal(pdf.head, '%PDF-1.4')
  t.assert.equal(pdf.count, 3); t.assert.equal(pdf.pages, 3)
  t.assert.deepEqual(pdf.boxes, ['0 0 595.28 841.89', '0 0 595.28 841.89', '0 0 595.28 841.89'])
  let order = await t.eval('[__indexOf(__files.p1), __indexOf(__files.p2)]')
  t.assert.ok(order[0] > 0 && order[1] > order[0], 'JPEG bytes not passed through in order: ' + order)
  const summary = await t.eval("document.querySelector('.pdf-convert__summary')?.textContent || ''")
  t.assert.ok(summary.includes('2 张 JPEG 原样嵌入') && summary.includes('1 张转成 JPEG'), 'summary: ' + summary)
  t.pass(`A4：${pdf.pages} 页，头 ${pdf.head}，MediaBox 全是 [${pdf.boxes[0]}]，${pdf.size} 字节`)
  t.pass(`两张 JPEG 的原始字节原样出现在 PDF 里（偏移 ${order.join(' < ')}），PNG 走 canvas；提示「${summary}」`)

  // 2. 排序：p1 下移 → 页面列表和 PDF 里的顺序都变成 p2、p1
  t.assert.ok(await t.eval("document.querySelector('button[aria-label=\"上移 p1.jpg\"]').disabled"), 'first item up should be disabled')
  await t.click('button[aria-label="下移 p1.jpg"]')
  const names = await t.eval("[...document.querySelectorAll('.compress-item img')].map((img) => img.alt)")
  t.assert.deepEqual(names, ['p2.jpg', 'p1.jpg', 'p3.png'])
  pdf = await t.eval('__generate()')
  order = await t.eval('[__indexOf(__files.p1), __indexOf(__files.p2)]')
  t.assert.ok(order[1] > 0 && order[0] > order[1], 'reorder not reflected in PDF: ' + order)
  t.pass(`下移后列表顺序 ${names.join(' → ')}，PDF 里 p2 在前（偏移 ${order[1]} < ${order[0]}）`)

  // 3. 移除 + 原尺寸模式：120×160px → 90×120pt（96dpi），不再是 1px = 1pt
  await t.click('button[aria-label="移除 p3.png"]')
  await t.clickText('原尺寸')
  pdf = await t.eval('__generate()')
  t.assert.equal(pdf.pages, 2)
  t.assert.deepEqual(pdf.boxes, ['0 0 90 120', '0 0 90 120'])
  t.pass(`移除 PNG 后剩 ${pdf.pages} 页；原尺寸模式 MediaBox [${pdf.boxes[0]}]（120×160px 按 96dpi）`)

  // 4. 长截图：1080×20000 的 PNG，原尺寸模式页面高被压到 14400pt
  await t.click('button[aria-label="移除 p1.jpg"]'); await t.click('button[aria-label="移除 p2.jpg"]')
  await t.setFiles(`(async () => [new File([await __mkBlob(1080, 20000, 'image/png')], 'long.png', { type: 'image/png' })])()`, label)
  await t.waitFor("document.querySelectorAll('.compress-item').length === 1", 'long image not shown')
  pdf = await t.eval('__generate()')
  t.assert.deepEqual(pdf.boxes, ['0 0 777.6 14400'])
  t.pass(`1080×20000 长图原尺寸模式 MediaBox [${pdf.boxes[0]}]（不超过 PDF 上限 14400pt）`)
  // 5. EXIF 方向 6 的「竖拍」：编码 200×100（左红右蓝），浏览器转正后 100×200（上红下蓝）。
  // JPEG 透传时 PDF 阅读器不认 EXIF，全靠 cm 矩阵转。用 pdf.js 真渲染一遍，看颜色在不在对的位置
  await t.click('button[aria-label="移除 long.png"]')
  await t.setFiles(`(async () => {
    const rotated = await __withOrientation(await __mkBlob(200, 100, 'image/jpeg'), 6)
    __files.rot = new Uint8Array(await rotated.arrayBuffer())
    return [new File([rotated], 'rot.jpg', { type: 'image/jpeg' })]
  })()`, label)
  await t.waitFor("document.querySelectorAll('.compress-item').length === 1", 'rotated image not shown')
  const caption = await t.eval("document.querySelector('.compress-item figcaption').textContent")
  t.assert.ok(caption.includes('100×200'), 'browser did not apply EXIF orientation: ' + caption)
  pdf = await t.eval('__generate()')
  t.assert.deepEqual(pdf.boxes, ['0 0 75 150'])
  t.assert.ok(await t.eval('__indexOf(__files.rot)') > 0, 'rotated JPEG should be passed through')
  const render = await t.eval(`(async () => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
    const doc = await pdfjs.getDocument({ data: __lastPdf.slice() }).promise
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, canvas, viewport }).promise
    const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)
    // 取右上和左下：转对了是「上红下蓝」；若忽略 EXIF 只拉伸（左红右蓝），这两个点颜色正好相反
    return { size: [canvas.width, canvas.height], top: at(115, 60), bottom: at(35, 240) }
  })()`)
  t.assert.deepEqual(render.size, [150, 300])
  t.assert.ok(render.top[0] > 180 && render.top[2] < 90, 'top half should be red: ' + render.top)
  t.assert.ok(render.bottom[2] > 180 && render.bottom[0] < 90, 'bottom half should be blue: ' + render.bottom)
  t.pass(`EXIF 方向 6：原字节透传，pdf.js 渲染 ${render.size.join('×')}，上半 ${render.top}（红）下半 ${render.bottom}（蓝），和浏览器预览方向一致`)

  // 6. HEIC：说清原因
  await t.setFiles(`[new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], 'IMG_0001.HEIC', { type: 'image/heic' })]`, label)
  await t.waitFor("(document.querySelector('.tool-panel [role=alert]')?.textContent || '').includes('HEIC')", 'HEIC hint not shown')
  t.assert.equal(await t.eval("document.querySelectorAll('.compress-item').length"), 1, 'loaded image should be kept')
  t.pass('HEIC 文件给出「导出为 JPEG」的明确提示，已加载的图片保留')

  // 7. 390px 宽不横向溢出（列表里有图、带三个按钮）
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  t.assert.ok(overflow <= 0, 'horizontal overflow at 390px: ' + overflow)
  await t.shot('pdf-convert-390.png')
  t.pass('390px 宽无横向溢出')
})
