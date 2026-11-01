// 四个图片工具（格式互转 / 压缩 / 裁剪 / 水印）验收脚本共用的造图与断言。
// 不是独立脚本：被 image-convert.mjs、image-compress.mjs、image-crop.mjs、image-watermark.mjs import。
const q = JSON.stringify

/** 页面里求值、返回 [File] 的表达式：用 canvas 现造一张图。paint 是一段用 ctx / W / H 作画的 JS */
export function imageFile(name, type, width, height, paint) {
  return `(async () => {
    const W = ${width}, H = ${height}
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const ctx = c.getContext('2d'); ${paint}
    const blob = await new Promise((r) => c.toBlob(r, ${q(type)}, 0.95))
    return [new File([blob], ${q(name)}, { type: ${q(type)} })]
  })()`
}

export const solid = (color) => `ctx.fillStyle = ${q(color)}; ctx.fillRect(0, 0, W, H)`

/** 四象限：左上红、右上蓝、左下绿、右下黄（判断旋转 / 翻转方向用） */
export const QUADRANTS = `
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, W / 2, H / 2)
  ctx.fillStyle = '#0000ff'; ctx.fillRect(W / 2, 0, W / 2, H / 2)
  ctx.fillStyle = '#00ff00'; ctx.fillRect(0, H / 2, W / 2, H / 2)
  ctx.fillStyle = '#ffff00'; ctx.fillRect(W / 2, H / 2, W / 2, H / 2)`

/** 把 [r,g,b] 归到最近的基色名，JPEG 有损也能判 */
export const COLOR_NAME_FN = `(p) => {
  const names = { red: [255, 0, 0], blue: [0, 0, 255], green: [0, 255, 0], yellow: [255, 255, 0], white: [255, 255, 255], black: [0, 0, 0] }
  let best = null, dist = Infinity
  for (const [n, c] of Object.entries(names)) { const d = (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2; if (d < dist) { dist = d; best = n } }
  return best
}`

/** 文件名是 HEIC、内容是垃圾：accept="image/*" 放行，但浏览器解不开 —— 模拟 iPhone 照片 */
export const HEIC_FILE = `[new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], 'IMG_0001.HEIC', { type: 'image/heic' })]`

/** 先载一张好图，再载 HEIC：必须清掉旧图、主按钮不可用、提示点名 HEIC */
export async function checkLoadFailureClears(t, { goodFile, ready, primary }) {
  await t.setFiles(goodFile)
  await t.waitFor(ready, 'good image not shown')
  // 按钮不存在（随预览一起不渲染）也算「用不了」
  const usable = `(() => { const b = document.querySelector(${q(primary)}); return !!b && !b.disabled })()`
  t.assert.equal(await t.eval(usable), true, 'primary should be usable after good image')
  await t.setFiles(HEIC_FILE)
  await t.waitFor("(document.querySelector('.tool-panel .site-form__error')?.textContent || '').includes('HEIC')", 'HEIC hint not shown')
  t.assert.equal(await t.eval(ready), false, 'old image still shown after failed load')
  t.assert.equal(await t.eval(usable), false, 'primary button still usable after failed load')
  t.pass('先载好图再载 HEIC：旧图清空、主按钮禁用、提示点名 HEIC')
}

/**
 * 快速连选两张图，让第一张的 src 赋值晚 600ms 生效（模拟大图解码慢）。
 * 没有序号保护时：旧图的 onload（或因 URL 已 revoke 触发的 onerror）晚到，覆盖掉新图。
 */
export async function checkStaleLoadIgnored(t, { slowFile, fastFile, describe, expected }) {
  await t.eval(`(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'); window.__srcDesc = d; let first = true
    Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return d.get.call(this) },
      set(v) { if (first && String(v).startsWith('blob:')) { first = false; const el = this; setTimeout(() => d.set.call(el, v), 600); return } d.set.call(this, v) } })
  })()`)
  try {
    await t.setFiles(slowFile)
    await t.setFiles(fastFile)
    await t.delay(1200)
    const got = await t.eval(describe)
    t.assert.equal(got, expected, 'stale load overwrote the newer image')
    const err = await t.eval("document.querySelector('.tool-panel .site-form__error')?.textContent ?? null")
    t.assert.equal(err, null, 'stale onerror leaked an error: ' + err)
  } finally {
    // void：defineProperty 返回原型对象，returnByValue 序列化不了会报 CDP Internal error
    await t.eval("void Object.defineProperty(HTMLImageElement.prototype, 'src', window.__srcDesc)")
  }
  t.pass(`快速连选两张图、旧图晚到：界面仍是新图（${expected}），没有串图也没有误报错`)
}

/** 让 canvas.toBlob 的行为临时变一下，跑完 body 再还原。mode: 'null' 回调 null；'no-webp' 请求 WebP 时退回 PNG（模拟 Safari） */
export async function withToBlob(t, mode, body) {
  await t.eval(`(() => {
    const orig = HTMLCanvasElement.prototype.toBlob; window.__toBlob = orig
    HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
      if (${q(mode)} === 'null') { setTimeout(() => cb(null), 0); return }
      if (${q(mode)} === 'no-webp' && type === 'image/webp') return orig.call(this, cb, 'image/png')
      return orig.call(this, cb, type, quality)
    }
  })()`)
  try { await body() } finally { await t.eval('void (HTMLCanvasElement.prototype.toBlob = window.__toBlob)') }
}

/** 拦下组件里 a.click() 触发的下载，取回 blob：文件名、类型、尺寸；解码后的画布存在 window.__dlCanvas */
export async function captureDownload(t, trigger) {
  await t.eval(`(() => { window.__dl = null; window.__aClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { window.__dl = { href: this.href, name: this.download } } })()`)
  try {
    await trigger()
    await t.waitFor('!!window.__dl', 'download not triggered')
  } finally {
    await t.eval('void (HTMLAnchorElement.prototype.click = window.__aClick)')
  }
  return t.eval(`(async () => {
    const { href, name } = window.__dl; const blob = await (await fetch(href)).blob(); const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0)
    window.__dlCanvas = c
    return { href, name, type: blob.type, width: bmp.width, height: bmp.height }
  })()`)
}

/** 读某个 canvas 表达式在 (x, y) 处的颜色名 */
export function colorAt(t, canvasExpr, x, y) {
  return t.eval(`(() => { const c = ${canvasExpr}; const p = c.getContext('2d').getImageData(${x}, ${y}, 1, 1).data; return (${COLOR_NAME_FN})(p) })()`)
}

/** blob URL 已被 revoke：fetch 会失败 */
export function isRevoked(t, url) {
  return t.eval(`fetch(${q(url)}).then(() => false, () => true)`)
}

/** 390px 宽（手机）下面板不横向溢出 */
export async function checkMobileWidth(t, shotName) {
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(300)
  const m = await t.eval("({ doc: document.documentElement.scrollWidth, panel: document.querySelector('.tool-panel').scrollWidth, panelClient: document.querySelector('.tool-panel').clientWidth })")
  await t.shot(shotName)
  t.assert.ok(m.doc <= 390, 'page overflows horizontally at 390px: ' + JSON.stringify(m))
  t.assert.ok(m.panel <= m.panelClient + 1, 'tool panel overflows at 390px: ' + JSON.stringify(m))
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  t.pass(`390px 宽下不横向溢出（页面 scrollWidth ${m.doc}）`)
}
