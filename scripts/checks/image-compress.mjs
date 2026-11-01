// 图片压缩的单工具验收。运行：node scripts/checks/image-compress.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'
import { checkLoadFailureClears, checkMobileWidth, checkStaleLoadIgnored, imageFile, isRevoked, solid, withToBlob } from './_image-tools.mjs'

const PRIMARY = '.tool-panel .unit-row .btn--primary'
const ORIGINAL_SHOWN = "!!document.querySelector('.compress-item img[alt=\"原图\"]')"
const RESULT_SHOWN = "document.querySelectorAll('.compress-item').length === 2"
const NOISE = `const d = ctx.createImageData(W, H); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random()*255; d.data[i+1] = Math.random()*255; d.data[i+2] = Math.random()*255; d.data[i+3] = 255 } ctx.putImageData(d, 0, 0)`
const summary = () => `(() => {
  const img = document.querySelectorAll('.compress-item img')[1]
  const links = [...document.querySelectorAll('.compress-summary a[download]')].map((a) => ({ text: a.textContent.trim(), name: a.getAttribute('download'), href: a.href, primary: a.classList.contains('btn--primary') }))
  return { w: img?.naturalWidth, h: img?.naturalHeight, links, caption: document.querySelectorAll('.compress-item figcaption')[1]?.textContent ?? null,
    ok: document.querySelector('.compress-summary__ok')?.textContent.trim() ?? null, warn: document.querySelector('.compress-summary__warn')?.textContent.trim() ?? null,
    notice: document.querySelector('.image-compress__notice')?.textContent ?? null, error: document.querySelector('.tool-panel .site-form__error')?.textContent ?? null }
})()`

await runToolCheck('图片压缩', async (t) => {
  // 主路径：400×400 噪点图，长边限 200 → 200×200 且体积减少
  await t.setFiles(imageFile('noise.png', 'image/png', 400, 400, NOISE))
  await t.waitFor(ORIGINAL_SHOWN, 'original preview not shown')
  await t.input('input[aria-label="长边最大"]', '200')
  await t.click(PRIMARY)
  await t.waitFor(RESULT_SHOWN, 'compressed preview not shown')
  const main = await t.eval(summary())
  t.assert.deepEqual([main.w, main.h], [200, 200])
  t.assert.match(main.ok ?? '', /^体积减少 \d+%$/)
  t.assert.equal(main.links.length, 1)
  t.assert.equal(main.links[0].name, 'noise-compressed.jpg')
  t.pass(`400×400 长边限 200 → 200×200，「${main.ok}」，下载名 ${main.links[0].name}`)

  // 改下拉框不重新压：下载名仍按上次实际格式
  await t.input('select[aria-label="输出格式"]', 'image/webp')
  t.assert.equal((await t.eval(summary())).links[0].name, 'noise-compressed.jpg')
  t.pass('只改下拉框不重新压缩：下载名仍是 .jpg（读实际结果，不读下拉框）')

  // WebP 正常编码（Chrome 支持）
  await t.click(PRIMARY)
  await t.waitFor(`document.querySelector('.compress-summary a[download]')?.getAttribute('download') === 'noise-compressed.webp'`, 'webp compress failed')
  t.assert.equal(await isRevoked(t, main.links[0].href), true, 'old result blob URL not revoked')
  t.pass('重新压成 WebP：下载名 .webp，旧结果 blob URL 已 revoke')

  // 模拟 Safari：WebP 退回 PNG
  await withToBlob(t, 'no-webp', async () => {
    await t.click(PRIMARY)
    await t.waitFor("!!document.querySelector('.image-compress__notice')", 'fallback notice not shown')
  })
  const fb = await t.eval(summary())
  t.assert.ok(fb.links.every((l) => l.name.endsWith('.png')), 'fallback links not named .png: ' + JSON.stringify(fb.links))
  t.assert.match(fb.caption, /PNG/)
  t.assert.match(fb.notice, /不支持导出 WebP.*实际导出的是 PNG/)
  t.pass(`WebP 编码不支持（模拟 Safari）：下载名 ${fb.links.at(-1).name}，标题写 PNG，并明确提示`)

  // 长边为空 / 非数字：明确提示，不静默按原尺寸压
  for (const bad of ['', 'abc']) {
    await t.input('input[aria-label="长边最大"]', bad)
    await t.click(PRIMARY)
    const s = await t.eval(summary())
    t.assert.match(s.error ?? '', /长边最大.*正整数/, `no hint for maxEdge=${JSON.stringify(bad)}`)
  }
  t.pass('长边填空或 abc：提示「请填一个正整数」，不压缩')

  // 压缩后变大：默认给原图，压缩图降级为次要链接
  await t.input('select[aria-label="输出格式"]', 'image/jpeg')
  await t.input('input[aria-label="长边最大"]', '1920')
  await t.input('input[aria-label="质量"]', '1')
  await t.setFiles(imageFile('tiny.png', 'image/png', 8, 8, solid('#336699')))
  await t.waitFor(ORIGINAL_SHOWN, 'tiny original not shown')
  await t.click(PRIMARY)
  await t.waitFor(RESULT_SHOWN, 'tiny result not shown')
  const big = await t.eval(summary())
  t.assert.equal(big.ok, null, 'should not claim size reduced')
  t.assert.match(big.warn ?? '', /反而大了 \d+%.*保留原图/)
  const [orig, comp] = big.links
  t.assert.equal(orig.text, '下载原图'); t.assert.equal(orig.primary, true); t.assert.equal(orig.name, 'tiny.png')
  t.assert.match(comp.text, /^仍然下载压缩图/); t.assert.equal(comp.primary, false)
  t.pass(`8×8 小图压后变大：「${big.warn}」，主按钮是「下载原图」，压缩图降为次要链接`)

  // toBlob 返回 null
  await withToBlob(t, 'null', async () => {
    await t.click(PRIMARY)
    await t.waitFor("!!document.querySelector('.tool-panel .site-form__error')", 'encode failure not reported')
  })
  const encodeErr = (await t.eval(summary())).error
  t.assert.doesNotMatch(encodeErr, /请重试/)
  t.pass(`toBlob 返回 null：「${encodeErr.slice(0, 28)}…」`)

  await checkLoadFailureClears(t, { goodFile: imageFile('a.png', 'image/png', 50, 50, solid('#f00')), ready: ORIGINAL_SHOWN, primary: PRIMARY })
  await checkStaleLoadIgnored(t, {
    slowFile: imageFile('slow.png', 'image/png', 111, 77, solid('#f00')),
    fastFile: imageFile('fast.png', 'image/png', 64, 48, solid('#00f')),
    describe: "(() => { const i = document.querySelector('.compress-item img[alt=\"原图\"]'); return i ? i.naturalWidth + 'x' + i.naturalHeight : 'none' })()",
    expected: '64x48',
  })
  await checkMobileWidth(t, 'image-compress-390.png')
})
