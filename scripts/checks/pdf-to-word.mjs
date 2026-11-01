// PDF 提取文字（导出 Word）单工具验收。运行：node scripts/checks/pdf-to-word.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

// 测试 PDF 不依赖 fixture：用自写最小 PDF + ToUnicode CMap，把 01..08 映射成「你好世界第二段落」。
const PDF_FACTORY = `(() => {
  const encoder = new TextEncoder()
  const cmap = String.raw\`/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Test-UCS def
/CMapType 2 def
1 begincodespacerange
<01> <08>
endcodespacerange
8 beginbfchar
<01> <4F60>
<02> <597D>
<03> <4E16>
<04> <754C>
<05> <7B2C>
<06> <4E8C>
<07> <6BB5>
<08> <843D>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end\`
  const build = (content) => {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>',
      '<< /Length ' + encoder.encode(content).length + ' >>\\nstream\\n' + content + '\\nendstream',
      '<< /Length ' + encoder.encode(cmap).length + ' >>\\nstream\\n' + cmap + '\\nendstream',
    ]
    const chunks = []; const offsets = [0]; let length = 0
    const push = (text) => { const bytes = encoder.encode(text); chunks.push(bytes); length += bytes.length }
    push('%PDF-1.4\\n%local\\n')
    objects.forEach((body, index) => { offsets.push(length); push((index + 1) + ' 0 obj\\n' + body + '\\nendobj\\n') })
    const xref = length
    push('xref\\n0 ' + (objects.length + 1) + '\\n0000000000 65535 f \\n')
    offsets.slice(1).forEach((offset) => push(String(offset).padStart(10, '0') + ' 00000 n \\n'))
    push('trailer\\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n')
    const out = new Uint8Array(length); let at = 0
    chunks.forEach((chunk) => { out.set(chunk, at); at += chunk.length })
    return out
  }
  return {
    text: build('BT\\n/F1 18 Tf\\n72 720 Td\\n<01020304> Tj\\n0 -28 Td\\n<05060708> Tj\\nET'),
    scan: build('0.85 0.25 0.25 rg\\n72 600 240 120 re f'),
  }
})()`

const TEXT_PDF = `Promise.resolve((() => {
  const samples = ${PDF_FACTORY}
  window.__pdfWordTextSample = samples.text
  window.__pdfWordScanSample = samples.scan
  return [new File([samples.text], '中文文字层.pdf', { type: 'application/pdf' })]
})())`

const DOCX_RESULT = `(async () => {
  const link = document.querySelector('.pdf-word__download')
  const response = await fetch(link.href)
  const blob = await response.blob()
  const zip = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(zip.buffer)
  const end = zip.length - 22
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files = {}
  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(offset + 28, true)
    const size = view.getUint32(offset + 24, true)
    const local = view.getUint32(offset + 42, true)
    const localNameLength = view.getUint16(local + 26, true)
    const start = local + 30 + localNameLength
    const name = new TextDecoder().decode(zip.slice(offset + 46, offset + 46 + nameLength))
    files[name] = new TextDecoder().decode(zip.slice(start, start + size))
    offset += 46 + nameLength
  }
  return {
    magic: [...zip.slice(0, 4)],
    type: blob.type,
    download: link.download,
    names: Object.keys(files),
    contentTypes: files['[Content_Types].xml'],
    rels: files['_rels/.rels'],
    document: files['word/document.xml'],
  }
})()`

await runToolCheck('PDF 提取文字（导出 Word）', async (t) => {
  const { assert } = t
  await t.setFiles(TEXT_PDF, 'input[aria-label="选择 PDF"]')
  await t.waitFor("document.querySelector('.pdf-word__file')?.textContent.includes('共 1 页')", 'text PDF not loaded', 30000)
  await t.clickText('提取文字并生成 Word')
  await t.waitFor("!!document.querySelector('.pdf-word__download')", 'DOCX not generated', 30000)

  const docx = await t.eval(DOCX_RESULT)
  assert.deepEqual(docx.magic, [0x50, 0x4b, 0x03, 0x04])
  assert.equal(docx.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(docx.download, '中文文字层-文字.docx')
  assert.deepEqual(docx.names, ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])
  assert.match(docx.contentTypes, /wordprocessingml\.document\.main\+xml/)
  assert.match(docx.rels, /relationships\/officeDocument/)
  assert.match(docx.document, /你好世界/)
  assert.match(docx.document, /第二段落/)
  assert.ok((docx.document.match(/<w:p>/g) ?? []).length >= 1)
  assert.match(await t.eval("document.querySelector('.pdf-word__output').textContent"), /已提取 .*段落，共 8 字/)
  t.pass('自造中文 ToUnicode PDF 提取成功；下载为真实 OOXML DOCX，包结构、MIME 与中文文字正确')

  await t.setFiles("Promise.resolve([new File([window.__pdfWordScanSample], '扫描页.pdf', { type: 'application/pdf' })])", 'input[aria-label="选择 PDF"]')
  await t.waitFor("document.querySelector('.pdf-word__file')?.textContent.includes('扫描页.pdf')", 'scan PDF not loaded', 30000)
  await t.clickText('提取文字并生成 Word')
  await t.waitFor("document.querySelector('[role=alert]')?.textContent.includes('扫描件')", 'scan feedback missing', 30000)
  const scanMessage = await t.eval("document.querySelector('[role=alert]').textContent")
  assert.match(scanMessage, /不做 OCR/)
  assert.equal(await t.eval("!!document.querySelector('.pdf-word__download')"), false)
  t.pass('图片型 PDF 不生成空 Word，明确提示扫描件无文字层且不做 OCR')

  await t.setFiles("Promise.resolve([new File([new Uint8Array([1, 2, 3])], '非法.pdf', { type: 'application/pdf' })])", 'input[aria-label="选择 PDF"]')
  await t.waitFor("document.querySelector('[role=alert]')?.textContent.includes('可能已损坏')", 'invalid PDF feedback missing', 30000)
  t.pass('非法 PDF 明确提示损坏')

  // 慢文件晚回来时不能覆盖随后选择的有效文件。
  await t.eval(`(async () => {
    const input = document.querySelector('input[aria-label="选择 PDF"]')
    const dispatch = (file) => { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })) }
    const slow = new File([new Uint8Array([9])], '过时.pdf', { type: 'application/pdf' })
    Object.defineProperty(slow, 'arrayBuffer', { value: () => new Promise((resolve) => setTimeout(() => resolve(new Uint8Array([9]).buffer), 450)) })
    dispatch(slow)
    await new Promise((resolve) => setTimeout(resolve, 30))
    dispatch(new File([window.__pdfWordTextSample], '最新中文.pdf', { type: 'application/pdf' }))
  })()`)
  await t.waitFor("document.querySelector('.pdf-word__file')?.textContent.includes('最新中文.pdf')", 'latest text PDF did not win race', 30000)
  await t.delay(600)
  assert.equal(await t.eval("document.querySelector('[role=alert]')?.textContent ?? null"), null)
  t.pass('快速换文件时旧异步读取不会覆盖最新 PDF')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(150)
  const pageWidth = await t.eval('document.documentElement.scrollWidth')
  assert.ok(pageWidth <= 390, `horizontal overflow at 390px: ${pageWidth}`)
  t.pass(`390px 宽无横向溢出（scrollWidth ${pageWidth}）`)
})
