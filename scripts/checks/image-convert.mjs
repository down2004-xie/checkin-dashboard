// 图片格式互转的单工具验收。运行：node scripts/checks/image-convert.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'
import { checkLoadFailureClears, checkMobileWidth, checkStaleLoadIgnored, imageFile, isRevoked, solid, withToBlob } from './_image-tools.mjs'

const PRIMARY = '.tool-panel .unit-row .btn--primary'
const ORIGINAL_SHOWN = "!!document.querySelector('.compress-item img[alt=\"原图\"]')"
const RESULT_SHOWN = "document.querySelectorAll('.compress-item').length === 2"
const result = () => `(() => {
  const img = document.querySelectorAll('.compress-item img')[1]
  const dl = document.querySelector('.compress-summary a[download]')
  return { w: img?.naturalWidth, h: img?.naturalHeight, name: dl?.getAttribute('download'), href: dl?.href,
    ok: document.querySelector('.compress-summary__ok')?.textContent.trim(), notice: document.querySelector('.image-convert__notice')?.textContent ?? null }
})()`

await runToolCheck('图片格式互转', async (t) => {
  t.assert.equal(await t.eval("document.querySelector('.tool-panel input[type=file]').getAttribute('aria-label')"), '选择图片')
  t.pass('选文件用 FilePicker，aria-label 仍是「选择图片」')

  // 主路径：PNG → JPEG
  await t.setFiles(imageFile('pic.png', 'image/png', 320, 240, solid('#3355aa')))
  await t.waitFor(ORIGINAL_SHOWN, 'original preview not shown')
  await t.input('select[aria-label="输出格式"]', 'image/jpeg')
  await t.click(PRIMARY)
  await t.waitFor(RESULT_SHOWN, 'converted preview not shown')
  const first = await t.eval(result())
  t.assert.equal(first.w, 320); t.assert.equal(first.h, 240)
  t.assert.equal(first.name, 'pic.jpg')
  t.assert.match(first.ok, /^已转为 JPEG/)
  t.assert.equal(first.notice, null)
  t.pass('PNG 320×240 → JPEG：尺寸不变、文件名 pic.jpg、无多余提示')

  // 改下拉框但不重新转换：下载名仍是上次实际的格式
  await t.input('select[aria-label="输出格式"]', 'image/webp')
  t.assert.equal((await t.eval(result())).name, 'pic.jpg', 'download name followed the dropdown instead of the actual result')
  t.pass('只改下拉框不重新转换：下载名仍是 pic.jpg（跟实际结果走）')

  // 重新转换：旧结果的 blob URL 被 revoke
  await t.input('select[aria-label="输出格式"]', 'image/png')
  await t.click(PRIMARY)
  await t.waitFor(`document.querySelector('.compress-summary a[download]')?.getAttribute('download') === 'pic.png'`, 'reconvert to png failed')
  t.assert.equal(await isRevoked(t, first.href), true, 'old result blob URL not revoked')
  t.pass('重新转换后旧结果的 blob URL 已 revoke')

  // Safari：不支持编码 WebP，toBlob 静默退回 PNG
  await withToBlob(t, 'no-webp', async () => {
    await t.input('select[aria-label="输出格式"]', 'image/webp')
    await t.click(PRIMARY)
    await t.waitFor("!!document.querySelector('.image-convert__notice')", 'fallback notice not shown')
  })
  const fb = await t.eval(result())
  t.assert.equal(fb.name, 'pic.png', 'fallback result should be named .png, got ' + fb.name)
  t.assert.match(fb.ok, /^已转为 PNG/)
  t.assert.match(fb.notice, /不支持导出 WebP.*实际导出的是 PNG/)
  t.pass(`WebP 编码不支持（模拟 Safari）：文件名 ${fb.name}、标签写 PNG、提示「${fb.notice.slice(0, 26)}…」`)

  // toBlob 返回 null：给真实原因，不说「请重试」
  await withToBlob(t, 'null', async () => {
    await t.click(PRIMARY)
    await t.waitFor("!!document.querySelector('.tool-panel .site-form__error')", 'encode failure not reported')
  })
  const encodeErr = await t.eval("document.querySelector('.tool-panel .site-form__error').textContent")
  t.assert.doesNotMatch(encodeErr, /请重试/)
  t.assert.match(encodeErr, /没能编码 320×240/)
  t.pass(`toBlob 返回 null：「${encodeErr.slice(0, 30)}…」（不说请重试）`)

  await checkLoadFailureClears(t, { goodFile: imageFile('a.png', 'image/png', 50, 50, solid('#f00')), ready: ORIGINAL_SHOWN, primary: PRIMARY })
  await checkStaleLoadIgnored(t, {
    slowFile: imageFile('slow.png', 'image/png', 111, 77, solid('#f00')),
    fastFile: imageFile('fast.png', 'image/png', 64, 48, solid('#00f')),
    describe: "(() => { const i = document.querySelector('.compress-item img[alt=\"原图\"]'); return i ? i.naturalWidth + 'x' + i.naturalHeight : 'none' })()",
    expected: '64x48',
  })
  await checkMobileWidth(t, 'image-convert-390.png')
})
