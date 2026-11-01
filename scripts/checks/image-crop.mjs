// 裁剪旋转翻转的单工具验收。运行：node scripts/checks/image-crop.mjs
// 拖框用 CDP 真鼠标事件（合成 PointerEvent 不触发 pointer capture，见 CLAUDE.md 拖拽排序一节）
import { runToolCheck } from '../lib/tool-harness.mjs'
import { QUADRANTS, captureDownload, checkLoadFailureClears, checkMobileWidth, checkStaleLoadIgnored, colorAt, imageFile, solid, withToBlob } from './_image-tools.mjs'

const PRIMARY = '.tool-panel .unit-row .btn--primary'
const PREVIEW = "document.querySelector('.crop-overlay canvas')"
const READY = `(() => { const c = ${PREVIEW}; return !!c && c.width > 0 })()`
const info = (t) => t.eval("document.querySelector('.tool-panel p.hint').textContent.replace(/\\s+/g, ' ')")
const button = (t, label) => t.eval(`[...document.querySelectorAll('.tool-panel .btn')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`)
const cropStyle = (t) => t.eval("(() => { const s = document.querySelector('.crop-selection').style; return [s.left, s.top, s.width, s.height].map((v) => Math.round(parseFloat(v))) })()")
/** 四个象限中心的颜色：[左上, 右上, 左下, 右下] */
const quadrants = (t, expr, w, h) => Promise.all([[w / 4, h / 4], [w * 3 / 4, h / 4], [w / 4, h * 3 / 4], [w * 3 / 4, h * 3 / 4]].map(([x, y]) => colorAt(t, expr, Math.floor(x), Math.floor(y))))

async function mouse(t, type, x, y) {
  await t.page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
  await t.delay(40)
}

/** 在 overlay 上从 (fx1, fy1) 拖到 (fx2, fy2)（相对 overlay 的比例）；release=false 时不松手 */
async function drag(t, fx1, fy1, fx2, fy2, release = true) {
  const r = await t.eval("(() => { const el = document.querySelector('.crop-overlay'); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })()")
  await mouse(t, 'mousePressed', r.x + r.w * fx1, r.y + r.h * fy1)
  await mouse(t, 'mouseMoved', r.x + r.w * (fx1 + fx2) / 2, r.y + r.h * (fy1 + fy2) / 2)
  await mouse(t, 'mouseMoved', r.x + r.w * fx2, r.y + r.h * fy2)
  if (release) await mouse(t, 'mouseReleased', r.x + r.w * fx2, r.y + r.h * fy2)
  return r
}

await runToolCheck('裁剪旋转翻转', async (t) => {
  await t.setFiles(imageFile('land.png', 'image/png', 400, 200, QUADRANTS))
  await t.waitFor(READY, 'crop preview not shown')
  t.assert.match(await info(t), /变换后尺寸 400×200 px · 裁剪区域 400×200 px/)
  t.pass('载入 400×200：预览是 canvas，变换后 400×200，裁剪区为整图')

  // 已确认的 bug：旋转 90° 后点「水平翻转」，旧实现实际是上下翻转
  await button(t, '顺时针')
  await t.delay(100)
  t.assert.match(await info(t), /变换后尺寸 200×400/)
  t.assert.deepEqual(await quadrants(t, PREVIEW, 200, 400), ['green', 'red', 'yellow', 'blue'], 'rotate 90 wrong')
  await button(t, '水平翻转')
  await t.delay(100)
  // 屏幕上左右镜像：左上红 / 右上绿 / 左下蓝 / 右下黄；旧 bug 会得到 黄 / 蓝 / 绿 / 红（上下颠倒）
  const flipped = await quadrants(t, PREVIEW, 200, 400)
  t.assert.deepEqual(flipped, ['red', 'green', 'blue', 'yellow'], 'flipH after rotate is not a horizontal mirror: ' + flipped)
  t.pass(`旋转 90° 后水平翻转：预览四象限 ${flipped.join('/')}（左右镜像，不是上下颠倒）`)

  const full = await captureDownload(t, () => t.click(PRIMARY))
  t.assert.equal(full.name, 'land-cropped.png'); t.assert.equal(full.type, 'image/png')
  t.assert.deepEqual([full.width, full.height], [200, 400])
  t.assert.deepEqual(await quadrants(t, 'window.__dlCanvas', 200, 400), ['red', 'green', 'blue', 'yellow'])
  t.pass('全分辨率导出 land-cropped.png（image/png，200×400），四象限与预览一致')

  // 裁剪框跟着旋转走：重新载图，框住左上四分之一（红），顺时针转后框应到右上、导出仍是纯红
  await t.setFiles(imageFile('land.png', 'image/png', 400, 200, QUADRANTS))
  await t.waitFor(READY, 'crop preview not shown (2)')
  await drag(t, 0.02, 0.04, 0.48, 0.46)
  const before = await cropStyle(t)
  t.assert.ok(before[0] <= 3 && before[1] <= 5 && before[2] >= 44 && before[3] >= 40, 'drag did not draw top-left box: ' + before)
  await button(t, '顺时针')
  await t.delay(100)
  const after = await cropStyle(t)
  // 顺时针 90°：新 left = 1 - (旧 top + 旧 height)，新 top = 旧 left，宽高互换
  t.assert.deepEqual(after, [100 - before[1] - before[3], before[0], before[3], before[2]], `crop box did not follow rotation: ${before} -> ${after}`)
  const part = await captureDownload(t, () => t.click(PRIMARY))
  const partColors = await quadrants(t, 'window.__dlCanvas', part.width, part.height)
  t.assert.deepEqual(partColors, ['red', 'red', 'red', 'red'], 'cropped export is not the red quadrant: ' + partColors)
  t.pass(`裁剪框跟着旋转：[${before}]% → [${after}]%，导出 ${part.width}×${part.height} 仍是框住的红色象限`)

  // pointercancel：拖到一半被系统收走指针 → 恢复按下前的框，后续移动不再改框
  await drag(t, 0.6, 0.6, 0.9, 0.9, false)
  await t.eval("void document.querySelector('.crop-overlay').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }))")
  await t.delay(80)
  const r = await t.eval("(() => { const b = document.querySelector('.crop-overlay').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })()")
  await mouse(t, 'mouseMoved', r.x + r.w * 0.95, r.y + r.h * 0.95)
  await mouse(t, 'mouseReleased', r.x + r.w * 0.95, r.y + r.h * 0.95)
  t.assert.deepEqual(await cropStyle(t), after, 'pointercancel did not restore the previous crop box')
  t.pass('拖拽中途 pointercancel：裁剪框恢复为按下前的框，之后的移动/松手不再改框')

  // 导出跟随原格式：JPEG 进 JPEG 出
  await t.setFiles(imageFile('photo.jpg', 'image/jpeg', 300, 200, QUADRANTS))
  await t.waitFor(READY, 'jpeg preview not shown')
  const jpg = await captureDownload(t, () => t.click(PRIMARY))
  t.assert.equal(jpg.name, 'photo-cropped.jpg'); t.assert.equal(jpg.type, 'image/jpeg')
  t.pass('JPEG 原图导出 photo-cropped.jpg（image/jpeg）')

  await withToBlob(t, 'null', async () => {
    await t.click(PRIMARY)
    await t.waitFor("!!document.querySelector('.tool-panel .site-form__error')", 'encode failure not reported')
  })
  const encodeErr = await t.eval("document.querySelector('.tool-panel .site-form__error').textContent")
  t.assert.doesNotMatch(encodeErr, /请重试/)
  t.pass(`toBlob 返回 null：「${encodeErr.slice(0, 28)}…」`)

  await checkLoadFailureClears(t, { goodFile: imageFile('a.png', 'image/png', 50, 50, solid('#f00')), ready: READY, primary: PRIMARY })
  await checkStaleLoadIgnored(t, {
    slowFile: imageFile('slow.png', 'image/png', 111, 77, solid('#f00')),
    fastFile: imageFile('fast.png', 'image/png', 64, 48, solid('#00f')),
    describe: `(() => { const c = ${PREVIEW}; return c ? c.width + 'x' + c.height : 'none' })()`,
    expected: '64x48',
  })
  await checkMobileWidth(t, 'image-crop-390.png')
})
