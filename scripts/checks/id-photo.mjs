// 证件照处理的单工具验收。运行：node scripts/checks/id-photo.mjs
// 覆盖：主路径（换底 + 裁到一寸）、连通填充（主体内同色区不被换）、透明 PNG、JPG 导出、
// 大图拖容差不卡、HEIC 提示、390px 不横向溢出。测试图都用页面里的 canvas 现造。
import { runToolCheck } from '../lib/tool-harness.mjs'

// 页面里的小工具：造图、塞文件、读预览像素、拦截下载
const PRELUDE = `(() => {
  window.__mkFile = async (w, h, draw, name = 'portrait.png', type = 'image/png') => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    draw(c.getContext('2d'), w, h)
    const blob = await new Promise((r) => c.toBlob(r, type, 0.92))
    return new File([blob], name, { type })
  }
  window.__previewSrc = () => document.querySelector('.id-photo-preview img')?.src || ''
  window.__pixels = async (points) => {
    const img = document.querySelector('.id-photo-preview img')
    await new Promise((r) => { if (img.complete && img.naturalWidth) r(); else img.onload = r })
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    return { w: c.width, h: c.height, px: points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)) }
  }
  window.__downloads = []
  HTMLAnchorElement.prototype.click = function () { window.__downloads.push({ href: this.href, name: this.download }) }
})()`

const near = (actual, expected, slack = 16) => actual.every((v, i) => Math.abs(v - expected[i]) <= slack)
const BLUE = [67, 142, 219]

await runToolCheck('证件照处理', async (t) => {
  await t.eval(PRELUDE)
  const label = 'input[aria-label="选择图片"]'
  // 换图后等预览真的换成新图（而不是旧图还没清掉就被当成新结果读）
  const load = async (filesExpr, timeout) => {
    const prev = await t.eval('__previewSrc()')
    await t.setFiles(filesExpr, label)
    await t.waitFor(`!!__previewSrc() && __previewSrc() !== ${JSON.stringify(prev)}`, 'preview not updated after loading', timeout)
  }
  t.assert.ok(await t.eval(`!!document.querySelector('${label}')`), 'FilePicker 的 aria-label 应为「选择图片」')

  // 1. 主路径：绿底 + 中央红块 → 默认白底，一寸 295×413
  await load(`[await __mkFile(300, 400, (ctx) => { ctx.fillStyle = '#00cc00'; ctx.fillRect(0, 0, 300, 400); ctx.fillStyle = '#cc0000'; ctx.fillRect(110, 150, 80, 100) })]`)
  let shot = await t.eval('__pixels([[5, 5], [147, 206]])')
  t.assert.deepEqual([shot.w, shot.h], [295, 413])
  t.assert.ok(near(shot.px[0], [255, 255, 255], 15), 'corner not white: ' + shot.px[0])
  t.assert.ok(near(shot.px[1], [204, 0, 0], 20), 'center not red: ' + shot.px[1])
  t.pass(`绿底换白底，一寸 ${shot.w}×${shot.h}，角 ${shot.px[0]}，中央红块保留 ${shot.px[1]}`)

  // 2. 关键 bug：白底 + 深色主体，主体里有一块白（衬衫/眼白），换蓝底后那块必须还是白
  await load(`[await __mkFile(300, 400, (ctx) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 300, 400)
    ctx.fillStyle = '#333333'; ctx.fillRect(70, 100, 160, 300)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(120, 180, 60, 60)
  })]`)
  const before = await t.eval('__previewSrc()')
  await t.input('select[aria-label="背景色"]', 'blue')
  await t.waitFor(`__previewSrc() !== ${JSON.stringify(before)}`, 'preview did not change to blue')
  // 源 (150,210) 在白块中心 → 预览约 (147,216)；源 (20,20) 是背景
  shot = await t.eval('__pixels([[10, 10], [147, 216], [147, 380]])')
  t.assert.ok(near(shot.px[0], BLUE), 'background not blue: ' + shot.px[0])
  t.assert.ok(near(shot.px[1], [255, 255, 255], 10), 'enclosed white turned blue: ' + shot.px[1])
  t.assert.ok(near(shot.px[2], [51, 51, 51], 12), 'subject changed: ' + shot.px[2])
  t.pass(`白底换蓝底：背景 ${shot.px[0]}，主体内的白块保持 ${shot.px[1]}（旧实现会变蓝）`)
  await t.shot('id-photo-enclosed.png')
  // 3. 透明 PNG：透明处 = 背景；深色「头发」不能被当成黑背景换掉
  await load(`[await __mkFile(300, 400, (ctx) => { ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.arc(150, 200, 90, 0, Math.PI * 2); ctx.fill() })]`)
  shot = await t.eval('__pixels([[5, 5], [147, 206]])')
  t.assert.ok(near(shot.px[0], BLUE), 'transparent area not blue: ' + shot.px[0])
  t.assert.ok(near(shot.px[1], [17, 17, 17], 10), 'dark subject was replaced: ' + shot.px[1])
  const hint = await t.eval("document.querySelector('.id-photo-detected')?.textContent || ''")
  t.assert.ok(hint.includes('透明背景'), 'missing transparent hint: ' + hint)
  t.assert.ok(await t.eval("document.querySelector('input[aria-label=\"容差\"]').disabled"), 'tolerance should be disabled for transparent bg')
  t.pass(`透明 PNG：透明处铺成 ${shot.px[0]}，深色主体保持 ${shot.px[1]}，提示「检测到透明背景」`)

  // 4. 默认导出 JPG：blob 是 JPEG、文件名 .jpg
  t.assert.equal(await t.eval("document.querySelector('select[aria-label=\"导出格式\"]').value"), 'jpeg')
  await t.clickText('下载')
  await t.waitFor('__downloads.length === 1', 'download not triggered')
  const jpg = await t.eval(`(async () => { const d = __downloads[0]; const buf = new Uint8Array(await (await fetch(d.href)).arrayBuffer()); return { name: d.name, head: [buf[0], buf[1]], size: buf.length } })()`)
  t.assert.equal(jpg.name, 'portrait-295x413.jpg')
  t.assert.deepEqual(jpg.head, [0xff, 0xd8])
  await t.input('select[aria-label="导出格式"]', 'png')
  await t.clickText('下载')
  await t.waitFor('__downloads.length === 2', 'png download not triggered')
  const png = await t.eval(`(async () => { const d = __downloads[1]; const buf = new Uint8Array(await (await fetch(d.href)).arrayBuffer()); return { name: d.name, head: [buf[1], buf[2], buf[3]] } })()`)
  t.assert.equal(png.name, 'portrait-295x413.png')
  t.assert.deepEqual(png.head, [0x50, 0x4e, 0x47])
  t.pass(`导出：默认 ${jpg.name}（FFD8，${jpg.size} 字节），切 PNG 后 ${png.name}`)

  // 5. 大图（4000×3000）拖容差：只在工作尺寸上重算，单次应远小于 1 秒。
  // 顶部一条 #c8c8c8（离背景色约 55）：容差 20 不换、70 换，保证每次拖动结果都不同
  await load(`[await __mkFile(4000, 3000, (ctx, w, h) => { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, w, 300); ctx.fillStyle = '#663322'; ctx.fillRect(1500, 800, 1000, 2200) }, 'big.jpg', 'image/jpeg')]`, 30000)
  const timings = []
  for (const value of ['70', '20', '70']) {
    const prev = await t.eval('__previewSrc()')
    const start = Date.now()
    await t.input('input[aria-label="容差"]', value)
    await t.waitFor(`__previewSrc() !== ${JSON.stringify(prev)}`, 'preview did not update for tolerance ' + value)
    timings.push(Date.now() - start)
  }
  t.assert.ok(Math.max(...timings) < 1000, 'tolerance update too slow: ' + timings)
  t.pass(`4000×3000 大图拖容差三次，每次重算到出图 ${timings.join(' / ')} ms`)

  // 6. HEIC：accept 放行但浏览器解不开 → 说清原因，不是「请重试」
  await t.setFiles(`[new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], 'IMG_0001.HEIC', { type: 'image/heic' })]`, label)
  await t.waitFor("(document.querySelector('.tool-panel [role=alert]')?.textContent || '').includes('HEIC')", 'HEIC hint not shown')
  t.pass('HEIC 文件给出「导出为 JPEG」的明确提示')

  // 7. 390px 宽不横向溢出
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  t.assert.ok(overflow <= 0, 'horizontal overflow at 390px: ' + overflow)
  await t.shot('id-photo-390.png')
  t.pass('390px 宽无横向溢出')
})
