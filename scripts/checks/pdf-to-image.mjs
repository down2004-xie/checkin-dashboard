// PDF 转图片单工具验收。运行：node scripts/checks/pdf-to-image.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const SAMPLE_PDF = `Promise.resolve((() => {
  const encoder = new TextEncoder()
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 30 18] /Contents 4 0 R >>',
    '<< /Length 32 >>\\nstream\\n0.94 0.12 0.12 rg\\n0 0 30 18 re f\\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 30 18] /Contents 6 0 R >>',
    '<< /Length 32 >>\\nstream\\n0.12 0.82 0.25 rg\\n0 0 30 18 re f\\nendstream',
  ]
  const chunks = []; const offsets = [0]; let length = 0
  const push = (text) => { const bytes = encoder.encode(text); chunks.push(bytes); length += bytes.length }
  push('%PDF-1.4\\n%local\\n')
  objects.forEach((body, index) => { offsets.push(length); push((index + 1) + ' 0 obj\\n' + body + '\\nendobj\\n') })
  const xref = length
  push('xref\\n0 ' + (objects.length + 1) + '\\n0000000000 65535 f \\n')
  offsets.slice(1).forEach((offset) => push(String(offset).padStart(10, '0') + ' 00000 n \\n'))
  push('trailer\\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n')
  const pdf = new Uint8Array(length); let at = 0
  chunks.forEach((chunk) => { pdf.set(chunk, at); at += chunk.length })
  window.__pdfImageSample = pdf
  return [new File([pdf], '像素样本.pdf', { type: 'application/pdf' })]
})())`

const ZIP_RESULT = `(async () => {
  const link = document.querySelector('.pdf-image__download')
  const zip = new Uint8Array(await (await fetch(link.href)).arrayBuffer())
  const view = new DataView(zip.buffer)
  const end = zip.length - 22
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files = []
  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(offset + 28, true)
    const size = view.getUint32(offset + 24, true)
    const local = view.getUint32(offset + 42, true)
    const localNameLength = view.getUint16(local + 26, true)
    const start = local + 30 + localNameLength
    const data = zip.slice(start, start + size)
    const name = new TextDecoder().decode(zip.slice(offset + 46, offset + 46 + nameLength))
    const png = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    const jpg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    const blob = new Blob([data], { type: png ? 'image/png' : 'image/jpeg' })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(bitmap, 0, 0)
    const pixel = [...context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data]
    bitmap.close()
    files.push({ name, png, jpg, width: canvas.width, height: canvas.height, pixel })
    offset += 46 + nameLength
  }
  return { download: link.download, files }
})()`

await runToolCheck('PDF 转图片', async (t) => {
  const { assert } = t
  await t.setFiles(SAMPLE_PDF, 'input[aria-label="选择 PDF"]')
  await t.waitFor("document.querySelector('.pdf-image__file')?.textContent.includes('共 2 页')", 'PDF page count not shown', 30000)
  assert.match(await t.eval("document.querySelector('.pdf-image__file').textContent"), /像素样本\.pdf/)
  t.pass('读取本地两页 PDF，并显示正确页数')

  await t.clickText('转换并打包 ZIP')
  await t.waitFor("!!document.querySelector('.pdf-image__download')", 'PNG ZIP not generated', 30000)
  const png = await t.eval(ZIP_RESULT)
  assert.equal(png.download, '像素样本-PNG.zip')
  assert.deepEqual(png.files.map((file) => file.name), ['像素样本-p01.png', '像素样本-p02.png'])
  assert.ok(png.files.every((file) => file.png && !file.jpg), 'PNG signature missing')
  assert.ok(png.files.every((file) => file.width === 60 && file.height === 36), `unexpected PNG dimensions: ${JSON.stringify(png.files)}`)
  assert.ok(png.files[0].pixel[0] > 180 && png.files[0].pixel[1] < 90, `page 1 is not red: ${png.files[0].pixel}`)
  assert.ok(png.files[1].pixel[1] > 150 && png.files[1].pixel[0] < 100, `page 2 is not green: ${png.files[1].pixel}`)
  t.pass('两页 PNG 打进一个 ZIP；文件名、PNG 签名、60×36 像素和页色都正确')

  await t.clickText('JPG')
  assert.equal(await t.eval("document.querySelector('.pdf-image__download')"), null)
  await t.clickText('转换并打包 ZIP')
  await t.waitFor("document.querySelector('.pdf-image__download')?.download.endsWith('-JPG.zip')", 'JPG ZIP not generated', 30000)
  const jpg = await t.eval(ZIP_RESULT)
  assert.deepEqual(jpg.files.map((file) => file.name), ['像素样本-p01.jpg', '像素样本-p02.jpg'])
  assert.ok(jpg.files.every((file) => file.jpg && !file.png), 'JPEG signature missing')
  assert.ok(jpg.files.every((file) => file.width === 60 && file.height === 36))
  t.pass('切换 JPG 后旧结果失效；ZIP 内是可解码的 JPEG 而不是改扩展名')

  await t.setFiles("Promise.resolve([new File([new Uint8Array([1, 2, 3, 4])], '坏文件.pdf', { type: 'application/pdf' })])", 'input[aria-label="选择 PDF"]')
  await t.waitFor("document.querySelector('[role=alert]')?.textContent.includes('可能已损坏')", 'invalid PDF feedback missing', 30000)
  t.pass('非法 PDF 明确提示损坏，不保留上一份输出')

  // 第一份文件故意慢读；第二份先完成。最终界面只能属于第二份，旧 Promise 不能回写错误。
  await t.eval(`(async () => {
    const input = document.querySelector('input[aria-label="选择 PDF"]')
    const dispatch = (file) => { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })) }
    const slow = new File([new Uint8Array([9])], '过时.pdf', { type: 'application/pdf' })
    Object.defineProperty(slow, 'arrayBuffer', { value: () => new Promise((resolve) => setTimeout(() => resolve(new Uint8Array([9]).buffer), 450)) })
    dispatch(slow)
    await new Promise((resolve) => setTimeout(resolve, 30))
    dispatch(new File([window.__pdfImageSample], '最新.pdf', { type: 'application/pdf' }))
  })()`)
  await t.waitFor("document.querySelector('.pdf-image__file')?.textContent.includes('最新.pdf')", 'latest PDF did not win race', 30000)
  await t.delay(600)
  assert.equal(await t.eval("document.querySelector('[role=alert]')?.textContent ?? null"), null)
  assert.match(await t.eval("document.querySelector('.pdf-image__file').textContent"), /最新\.pdf/)
  t.pass('快速换文件时旧异步读取被票据拦截，不会覆盖最新 PDF')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(150)
  const pageWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(pageWidth <= 390, `horizontal overflow at 390px: ${pageWidth}`)
  t.pass(`390px 宽无横向溢出（scrollWidth ${pageWidth}）`)
})
