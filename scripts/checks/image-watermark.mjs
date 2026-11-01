// 加水印的单工具验收。运行：node scripts/checks/image-watermark.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'
import { captureDownload, checkLoadFailureClears, checkMobileWidth, checkStaleLoadIgnored, imageFile, solid, withToBlob } from './_image-tools.mjs'

const PRIMARY = '.watermark-preview .btn--primary'
const PREVIEW = "document.querySelector('.watermark-preview canvas')"
const READY = `(() => { const c = ${PREVIEW}; return !!c && c.width > 0 })()`
/** 数某个 canvas 上的近白像素（深底白字：白像素数 ≈ 水印露在画布内的面积） */
const countWhite = (t, expr = PREVIEW) => t.eval(`(() => {
  const c = ${expr}; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200) n++ } return n
})()`)

await runToolCheck('加水印', async (t) => {
  await t.setFiles(imageFile('dark.png', 'image/png', 400, 400, solid('#282828')))
  await t.waitFor(READY, 'watermark preview not shown')
  t.assert.deepEqual(await t.eval(`[${PREVIEW}.width, ${PREVIEW}.height]`), [400, 400])
  const label = await t.eval("[...document.querySelectorAll('.unit-field__label')].find((l) => l.textContent.startsWith('字号')).textContent")
  t.assert.equal(label, '字号 短边 5%（约 20px）')
  t.pass(`预览是 canvas（400×400），字号标签「${label}」`)

  // 平铺覆盖显著多于单个；位置 chips 随平铺隐藏
  await t.input('input[aria-label="透明度"]', '1')
  const single = await countWhite(t)
  t.assert.ok(single > 0, 'single watermark produced no white pixels')
  await t.click('.check-inline input[type="checkbox"]')
  t.assert.equal(await t.eval("!!document.querySelector('.filter[aria-label=\"水印位置\"]')"), false)
  const tiled = await countWhite(t)
  t.assert.ok(tiled > single * 2, `tiling did not increase coverage: single=${single} tiled=${tiled}`)
  await t.click('.check-inline input[type="checkbox"]')
  t.pass(`单水印近白像素 ${single}，平铺后 ${tiled}，位置 chips 随平铺隐藏`)

  // 九宫格按旋转后的外接框锚定：45° 时右下角的水印不被画布裁掉（露出面积 ≈ 正中时）
  await t.input('input[aria-label="水印文字"]', 'WATERMARK-TEST-1234')
  await t.input('input[aria-label="旋转"]', '45')
  await t.clickText('正中')
  const centered = await countWhite(t)
  await t.clickText('右下')
  const corner = await countWhite(t)
  t.assert.ok(corner >= centered * 0.9, `bottom-right 45° watermark is clipped: corner=${corner} center=${centered}`)
  await t.shot('image-watermark-45.png')
  t.pass(`旋转 45° 右下锚点：露出 ${corner} 白像素 / 正中 ${centered}（${Math.round(corner / centered * 100)}%，没有被画布裁掉）`)

  // 全分辨率导出：2000×1000 的图预览缩成 1600×800，下载仍是 2000×1000、格式跟随原图
  await t.setFiles(imageFile('big.png', 'image/png', 2000, 1000, solid('#282828')))
  await t.waitFor(`${READY} && ${PREVIEW}.width === 1600`, 'big preview not downscaled to 1600')
  t.assert.equal(await t.eval(`${PREVIEW}.height`), 800)
  const big = await captureDownload(t, () => t.click(PRIMARY))
  t.assert.equal(big.name, 'big-watermark.png'); t.assert.equal(big.type, 'image/png')
  t.assert.deepEqual([big.width, big.height], [2000, 1000])
  // 字号按短边比例：预览和导出上水印占的面积比例应一致（面积比 = (2000/1600)^2）
  const previewWhite = await countWhite(t)
  const exportWhite = await countWhite(t, 'window.__dlCanvas')
  const ratio = exportWhite / previewWhite / (2000 / 1600) ** 2
  t.assert.ok(ratio > 0.8 && ratio < 1.25, `export watermark not proportional to preview: ratio=${ratio}`)
  t.assert.equal(big.href.startsWith('blob:'), true, 'download should be a blob URL, not a data URL')
  t.pass(`预览 1600×800，下载 ${big.name} ${big.width}×${big.height}（blob URL），水印面积与预览等比（偏差 ${Math.round(Math.abs(1 - ratio) * 100)}%）`)

  // JPEG 原图导出 JPEG
  await t.setFiles(imageFile('photo.jpg', 'image/jpeg', 300, 200, solid('#282828')))
  await t.waitFor(`${READY} && ${PREVIEW}.width === 300`, 'jpeg preview not shown')
  const jpg = await captureDownload(t, () => t.click(PRIMARY))
  t.assert.equal(jpg.name, 'photo-watermark.jpg'); t.assert.equal(jpg.type, 'image/jpeg')
  t.pass('JPEG 原图导出 photo-watermark.jpg（image/jpeg）')

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
  await checkMobileWidth(t, 'image-watermark-390.png')
})
