// 打码与马赛克的单工具验收。运行：node scripts/checks/image-mosaic.mjs
// 重点守审核确认过的高危 bug：模糊时选区边缘半透明，原文透出来。
import { runToolCheck } from '../lib/tool-harness.mjs'

/** 页面里：按 draw(ctx) 画一张 w×h 的 PNG，返回 File[] */
const pngFiles = (w, h, name, draw) => `(async () => {
  const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}
  const ctx = c.getContext('2d'); (${draw})(ctx)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return [new File([blob], ${JSON.stringify(name)}, { type: 'image/png' })]
})()`

/** 白底 + 2px 黑竖条 + 一行黑字：细节最密，最容易看出原文有没有透出来 */
const STRIPES = `(ctx) => {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 200)
  ctx.fillStyle = '#000'; for (let x = 0; x < 400; x += 4) ctx.fillRect(x, 0, 2, 200)
  ctx.font = 'bold 28px sans-serif'; ctx.fillText('SECRET 1234567890', 20, 112)
}`

/** 读当前预览图的像素（等新的 object URL 解码完） */
const readPreview = (prevSrc) => `(async () => {
  const img = document.querySelector('.crop-overlay img')
  if (!img || img.src === ${JSON.stringify(prevSrc ?? '')}) return null
  if (!img.complete || !img.naturalWidth) await new Promise((r) => { img.onload = r })
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  return { src: img.src, w: c.width, h: c.height, data: [...ctx.getImageData(0, 0, c.width, c.height).data] }
})()`

await runToolCheck('打码与马赛克', async (t) => {
  const { assert } = t
  const currentSrc = () => t.eval("document.querySelector('.crop-overlay img')?.src ?? ''")
  const waitPreview = async (prevSrc) => {
    let shot = null
    await t.waitFor(`(async () => { const img = document.querySelector('.crop-overlay img'); return !!img && img.src !== ${JSON.stringify(prevSrc)} && img.complete && img.naturalWidth > 0 })()`, 'preview not refreshed')
    shot = await t.eval(readPreview(prevSrc))
    return shot
  }
  /** 用 CDP 真鼠标事件拖选（合成 PointerEvent 不触发 pointer capture） */
  const drag = async (ax, ay, bx, by) => {
    const r = await t.eval("(() => { const b = document.querySelector('.crop-overlay').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height } })()")
    const pt = (rx, ry) => ({ x: r.l + r.w * rx, y: r.t + r.h * ry })
    const a = pt(ax, ay); const b = pt(bx, by)
    await t.page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...a, button: 'left', buttons: 1, clickCount: 1 })
    await t.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, button: 'left', buttons: 1 })
    await t.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...b, button: 'left', buttons: 1 })
    await t.page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...b, button: 'left', buttons: 0, clickCount: 1 })
    await t.delay(100)
  }
  /**
   * 选区（像素）内三条都要满足，才算「原文看不出来」：
   * - alpha 全 255（半透明 = 底下原文会透出来）
   * - 每个像素都偏离原图 ≥ 40（没有原样留下来的黑 / 白像素）
   * - 原图的竖条纹（周期 4px，x 与 x+2 原本一黑一白）残余对比度 < 24。
   *   只看亮度区间不够：旧算法 alpha≈0.5 时黑条变 64、白底变 191，都「不纯」，但条纹和字照样看得清
   */
  const checkObscured = (shot, orig, rect) => {
    let alphaBad = 0; let sameBad = 0; let contrastBad = 0; let first = null
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * shot.w + x) * 4
      const a = shot.data[i + 3]
      if (a !== 255) alphaBad++
      const dev = Math.max(...[0, 1, 2].map((c) => Math.abs(shot.data[i + c] - orig.data[i + c])))
      // 文字抗锯齿边缘原本就是灰的，模糊后可能仍接近原值；只要求原本纯黑 / 纯白的像素都偏离
      const pure = orig.data[i] < 40 || orig.data[i] > 215
      if (pure && dev < 40) { sameBad++; first ??= { x, y, rgba: shot.data.slice(i, i + 4), orig: orig.data.slice(i, i + 4) } }
      if (x + 2 < rect.x + rect.w && Math.abs(shot.data[i] - shot.data[i + 8]) >= 24) contrastBad++
    }
    return { alphaBad, sameBad, contrastBad, first }
  }
  const assertObscured = (res, label) => {
    assert.equal(res.alphaBad, 0, `${label}: non-opaque pixels ${res.alphaBad}`)
    assert.equal(res.sameBad, 0, `${label}: pixels still equal to original ${res.sameBad} first=${JSON.stringify(res.first)}`)
    assert.equal(res.contrastBad, 0, `${label}: stripe pattern still visible at ${res.contrastBad} pixels`)
  }
  // 1. 模糊一行文字：选区内每个像素都已偏离原图（没有接近纯黑 / 纯白的残留），alpha 全 255
  await t.setFiles(pngFiles(400, 200, 'stripes.png', STRIPES))
  const original = await waitPreview('')
  assert.equal(original.w, 400)
  const band = { x: 44, y: 84, w: 312, h: 32 } // 拖 10%~90% × 40%~60%，内缩 4px 防取整
  // 前提：原图自己和自己比，纯黑/白像素和条纹对比度都应该很多（否则这把尺子量不出东西）
  const before = checkObscured(original, original, band)
  assert.ok(before.sameBad > band.w * band.h * 0.5 && before.contrastBad > band.w * band.h * 0.5, 'test image not detailed enough: ' + JSON.stringify(before))
  await t.input('select[aria-label="打码方式"]', 'blur')
  await drag(0.1, 0.4, 0.9, 0.6)
  assert.ok(await t.eval("!!document.querySelector('.crop-selection')"), 'selection box not created')
  let prev = await currentSrc()
  await t.clickText('打码')
  const blurred = await waitPreview(prev)
  assertObscured(checkObscured(blurred, original, band), 'blur band')
  t.pass(`模糊一行文字：选区 ${band.w}×${band.h} 内 alpha 全 255，原本纯黑/白的 ${before.sameBad} 个像素全部偏离 ≥40，条纹残余对比度 <24`)

  // 1b. 对照：同一张图用旧算法（只拷选区再 blur、source-over 画回）必须被同一把尺子判失败，证明断言有效
  const oldShot = await t.eval(`(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200; const ctx = c.getContext('2d'); (${STRIPES})(ctx)
    const rect = { x: 40, y: 80, width: 320, height: 40 }
    const temp = document.createElement('canvas'); temp.width = rect.width; temp.height = rect.height
    temp.getContext('2d').drawImage(c, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip()
    ctx.filter = 'blur(19px)'; ctx.drawImage(temp, rect.x, rect.y); ctx.restore()
    return { w: 400, h: 200, data: [...ctx.getImageData(0, 0, 400, 200).data] }
  })()`)
  const old = checkObscured(oldShot, original, band)
  assert.ok(old.alphaBad === 0 && old.contrastBad > 1000, 'old algorithm should leak the stripe pattern: ' + JSON.stringify({ ...old, first: undefined }))
  t.pass(`对照：旧算法在同一选区留下 ${old.contrastBad} 个条纹可辨像素、${old.sameBad} 个未偏离像素（同一断言判失败）`)

  // 2. 单步撤销：回到打码前，像素逐个相等
  prev = await currentSrc()
  await t.clickText('撤销一步')
  const undone = await waitPreview(prev)
  assert.deepEqual(undone.data, original.data, 'undo did not restore original pixels')
  assert.ok(await t.eval("[...document.querySelectorAll('.tool-panel .btn')].find(b => b.textContent.trim() === '撤销一步').disabled"), 'undo should be disabled when stack empty')
  t.pass('撤销一步：像素与打码前完全一致，栈空后按钮禁用')

  // 3. 贴着图片左上边缘模糊：padding 扩不出去的一侧也不能出现半透明 / 原文
  await drag(0.001, 0.001, 0.3, 0.3)
  prev = await currentSrc()
  await t.clickText('打码')
  const edge = await waitPreview(prev)
  assertObscured(checkObscured(edge, original, { x: 0, y: 0, w: 116, h: 56 }), 'edge blur')
  t.pass('贴边模糊：选区含图片边缘，alpha 全 255、无原始像素残留')
  // 4. 撤销全部：回到原图
  prev = await currentSrc()
  await t.clickText('撤销全部')
  const reset = await waitPreview(prev)
  assert.deepEqual(reset.data, original.data, 'reset did not restore original')
  t.pass('撤销全部：回到原图')

  // 5. pointercancel：手势被打断后不再跟着鼠标改选框
  const box = await t.eval("(() => { const b = document.querySelector('.crop-overlay').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height } })()")
  await t.page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.l + box.w * 0.2, y: box.t + box.h * 0.2, button: 'left', buttons: 1, clickCount: 1 })
  await t.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.l + box.w * 0.4, y: box.t + box.h * 0.4, button: 'left', buttons: 1 })
  await t.delay(60)
  assert.ok(await t.eval("!!document.querySelector('.crop-selection')"), 'selection should exist mid-drag')
  await t.eval("document.querySelector('.crop-overlay').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))")
  await t.delay(60)
  await t.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.l + box.w * 0.8, y: box.t + box.h * 0.8, button: 'left', buttons: 1 })
  await t.delay(60)
  assert.equal(await t.eval("!!document.querySelector('.crop-selection')"), false, 'selection should be cleared after pointercancel')
  await t.page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.l + box.w * 0.8, y: box.t + box.h * 0.8, button: 'left', buttons: 0, clickCount: 1 })
  t.pass('pointercancel：选框清掉，之后移动鼠标不再画框')

  // 6. 马赛克考虑 alpha：左半透明、右半红底黑线，全选打码后透明处仍透明，红色处被抹平且不透明
  await t.setFiles(pngFiles(200, 100, 'alpha.png', `(ctx) => {
    ctx.fillStyle = '#e11'; ctx.fillRect(100, 0, 100, 100); ctx.fillStyle = '#000'; for (let x = 101; x < 200; x += 6) ctx.fillRect(x, 0, 1, 100)
  }`))
  const alphaOrig = await waitPreview(reset.src)
  await t.input('select[aria-label="打码方式"]', 'mosaic')
  await drag(0.001, 0.001, 0.999, 0.999)
  prev = await currentSrc()
  await t.clickText('打码')
  const pix = await waitPreview(prev)
  let leftOpaque = 0; let rightClear = 0; let changed = 0
  for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) {
    const i = (y * 200 + x) * 4
    if (x < 90 && pix.data[i + 3] !== 0) leftOpaque++
    if (x >= 110 && pix.data[i + 3] !== 255) rightClear++
    if (pix.data[i] !== alphaOrig.data[i]) changed++
  }
  assert.equal(leftOpaque, 0, 'transparent area became opaque: ' + leftOpaque)
  assert.equal(rightClear, 0, 'opaque area lost alpha: ' + rightClear)
  assert.ok(changed > 500, 'mosaic did not change pixels: ' + changed)
  t.pass(`马赛克带透明：透明区 0 个变不透明，红色区 alpha 全 255，${changed} 个像素被抹平`)

  // 7. 不支持 ctx.filter 时回退「缩小再放大」并提示，同样看不清原文
  await t.eval("delete CanvasRenderingContext2D.prototype.filter")
  assert.equal(await t.eval("'filter' in document.createElement('canvas').getContext('2d')"), false, 'filter should be gone')
  await t.setFiles(pngFiles(400, 200, 'stripes2.png', STRIPES))
  await waitPreview(pix.src)
  await t.input('select[aria-label="打码方式"]', 'blur')
  await drag(0.1, 0.4, 0.9, 0.6)
  prev = await currentSrc()
  await t.clickText('打码')
  const fallback = await waitPreview(prev)
  assertObscured(checkObscured(fallback, original, band), 'fallback blur')
  assert.match(await t.eval("document.querySelector('.mosaic-notice')?.textContent ?? ''"), /不支持画布滤镜/)
  t.pass('无 ctx.filter：回退缩放模糊并提示，选区无原始像素残留、alpha 全 255')

  // 8. 下载：产出 PNG
  const download = await t.eval(`(async () => {
    let captured = null; const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { captured = { href: this.href, name: this.download } }
    ;[...document.querySelectorAll('.tool-panel .btn')].find(b => b.textContent.trim() === '下载').click()
    for (let i = 0; i < 50 && !captured; i++) await new Promise(r => setTimeout(r, 50))
    HTMLAnchorElement.prototype.click = orig
    const buf = new Uint8Array(await (await fetch(captured.href)).arrayBuffer())
    return { name: captured.name, sig: [...buf.slice(1, 4)].map(c => String.fromCharCode(c)).join('') }
  })()`)
  assert.deepEqual(download, { name: 'stripes2-mosaic.png', sig: 'PNG' })
  t.pass(`下载：${download.name}，PNG 签名正确`)

  // 9. 移动端 390px 不横向溢出
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const overflow = await t.eval("document.documentElement.scrollWidth - window.innerWidth")
  assert.ok(overflow <= 0, 'horizontal overflow at 390px: ' + overflow)
  t.pass('390px 宽无横向溢出')
})
