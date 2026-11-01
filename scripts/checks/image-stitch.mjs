// 长图拼接专属浏览器验收。运行：node scripts/checks/image-stitch.mjs
// 覆盖图片顺序、删除/追加、真实 PNG 下载，以及亮色 390px 布局。
import { runToolCheck } from '../lib/tool-harness.mjs'
import { captureDownload, checkMobileWidth, colorAt } from './_image-tools.mjs'

const q = JSON.stringify

/** 在页面里现造多张纯色 PNG，顺序与 specs 一致。 */
const imageFiles = (specs) => `(async () => {
  const specs = ${q(specs)}
  return Promise.all(specs.map(async ({ name, width, height, color }) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height
    const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height)
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'))
    return new File([blob], name, { type: 'image/png' })
  }))
})()`

const itemNames = (t) => t.eval("[...document.querySelectorAll('.stitch-item__name')].map((el) => el.textContent.trim())")

async function itemAction(t, fileName, label) {
  await t.eval(`(() => {
    const item = [...document.querySelectorAll('.stitch-item')].find((el) => el.dataset.fileName === ${q(fileName)})
    if (!item) throw new Error('missing stitch item ' + ${q(fileName)})
    const button = [...item.querySelectorAll('button')].find((el) => el.textContent.trim() === ${q(label)})
    if (!button || button.disabled) throw new Error('missing/disabled action ' + ${q(label)} + ' for ' + ${q(fileName)})
    button.click()
  })()`)
  await t.delay(80)
}

await runToolCheck('长图拼接', async (t) => {
  const initial = [
    { name: 'red.png', width: 100, height: 40, color: '#ff0000' },
    { name: 'green.png', width: 100, height: 30, color: '#00ff00' },
    { name: 'blue.png', width: 100, height: 20, color: '#0000ff' },
  ]
  await t.setFiles(imageFiles(initial), 'input[aria-label="选择图片"]')
  await t.waitFor("document.querySelectorAll('.stitch-item').length === 3", 'three stitch items not shown')
  t.assert.deepEqual(await itemNames(t), ['red.png', 'green.png', 'blue.png'])
  t.assert.deepEqual(
    await t.eval("[...document.querySelectorAll('.stitch-item')].map((el) => [el.querySelector('button').disabled, el.querySelectorAll('button')[1].disabled])"),
    [[true, false], [false, false], [false, true]],
  )
  t.pass('选择三张图片：列表保持文件选择顺序，首项不能上移、末项不能下移')

  await itemAction(t, 'blue.png', '上移')
  t.assert.deepEqual(await itemNames(t), ['red.png', 'blue.png', 'green.png'])
  await itemAction(t, 'blue.png', '下移')
  t.assert.deepEqual(await itemNames(t), ['red.png', 'green.png', 'blue.png'])
  t.pass('上移 / 下移：列表顺序各移动一格')

  await itemAction(t, 'green.png', '删除')
  t.assert.deepEqual(await itemNames(t), ['red.png', 'blue.png'])
  t.assert.equal(await t.eval("document.querySelector('.stitch-list__head span').textContent.trim()"), '2 张')
  t.pass('删除中间图片：列表剩余两张，计数同步')

  await t.setFiles(imageFiles([
    { name: 'yellow.png', width: 100, height: 10, color: '#ffff00' },
  ]), 'input[aria-label="追加图片"]')
  await t.waitFor("document.querySelectorAll('.stitch-item').length === 3", 'appended stitch item not shown')
  t.assert.deepEqual(await itemNames(t), ['red.png', 'blue.png', 'yellow.png'])
  await itemAction(t, 'yellow.png', '上移')
  await itemAction(t, 'yellow.png', '上移')
  t.assert.deepEqual(await itemNames(t), ['yellow.png', 'red.png', 'blue.png'])
  t.pass('追加图片：不覆盖原列表；追加项可连续上移到首位')

  await t.input('input[aria-label="间隔"]', '5')
  await t.clickText('白')
  await t.click('.tool-panel .unit-row > .btn--primary')
  await t.waitFor("(() => { const img = document.querySelector('.image-slice-preview img'); return !!img && img.complete && img.naturalWidth > 0 })()", 'stitch result not shown')
  const summary = await t.eval("document.querySelector('.stitch-result__preview .hint').textContent.replace(/\\s+/g, ' ').trim()")
  t.assert.equal(summary, '已拼接 3 张 · 100×80 px')

  const download = await captureDownload(t, () => t.click('.stitch-result__download'))
  t.assert.deepEqual(
    { name: download.name, type: download.type, width: download.width, height: download.height },
    { name: 'stitched.png', type: 'image/png', width: 100, height: 80 },
  )
  const colors = await Promise.all([
    colorAt(t, 'window.__dlCanvas', 50, 5),
    colorAt(t, 'window.__dlCanvas', 50, 12),
    colorAt(t, 'window.__dlCanvas', 50, 20),
    colorAt(t, 'window.__dlCanvas', 50, 57),
    colorAt(t, 'window.__dlCanvas', 50, 65),
  ])
  t.assert.deepEqual(colors, ['yellow', 'white', 'red', 'white', 'blue'])
  t.pass(`按列表顺序下载 stitched.png（PNG 100×80）；像素分段 ${colors.join('/')}`)

  // 工具面板视图不渲染签到页的设置面板；这里直接切根节点属性，只验本工具的亮色 CSS。
  // 「设置控件能否持久化 appearance」由 scripts/appearance-check.mjs 单独负责。
  await t.eval("document.documentElement.dataset.appearance = 'light'")
  await t.waitFor("document.documentElement.dataset.appearance === 'light'", 'light appearance not applied')
  const light = await t.eval(`(() => {
    const item = document.querySelector('.stitch-item')
    const name = document.querySelector('.stitch-item__name')
    const rgb = getComputedStyle(name).color.match(/rgba?\\(([^)]+)\\)/)?.[1].split(',').map(Number)
    return { itemBackground: getComputedStyle(item).backgroundColor, textRed: rgb?.[0] }
  })()`)
  t.assert.ok(light.itemBackground !== 'rgba(0, 0, 0, 0)', 'light item background is transparent')
  t.assert.ok(light.textRed < 80, 'light appearance should use dark item text: ' + JSON.stringify(light))
  t.pass(`亮色外观：列表文字为深色，卡片底色 ${light.itemBackground}`)

  await checkMobileWidth(t, 'image-stitch-light-390.png')
})
