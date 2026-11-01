// PDF 合并与拆分的单工具验收。运行：node scripts/checks/pdf-merge-split.mjs
//
// 测试 PDF 在页面里用 pdf-lib 现造：直接 import node_modules 里的自包含 ESM 构建（dev server 能访问项目内文件），
// 每页宽度不同（A 文件 200/210，B 文件 300/310/320），这样合并后不光数页数，还能核对页序。
import { runToolCheck } from '../lib/tool-harness.mjs'

const LIB = "import('/node_modules/pdf-lib/dist/pdf-lib.esm.min.js')"
/** 页面里求值：造一个 PDF File，widths 是每页宽度 */
const makePdf = (name, widths) => `(async () => {
  const { PDFDocument } = await ${LIB}
  const doc = await PDFDocument.create()
  for (const w of ${JSON.stringify(widths)}) doc.addPage([w, 400])
  return new File([await doc.save()], ${JSON.stringify(name)}, { type: 'application/pdf' })
})()`
/** 页面里求值：下载链接指向的 PDF 的每页宽度 */
const outputWidths = `(async () => {
  const { PDFDocument } = await ${LIB}
  const href = document.querySelector('.pdf-ms__download').href
  const doc = await PDFDocument.load(await (await fetch(href)).arrayBuffer())
  return doc.getPages().map((p) => Math.round(p.getWidth()))
})()`
const listText = "[...document.querySelectorAll('.pdf-ms__item')].map((li) => li.querySelector('.pdf-ms__name').textContent + ':' + li.querySelector('.pdf-ms__pages').textContent)"
const alertText = "[...document.querySelectorAll('.tool-panel [role=alert]')].map((p) => p.textContent).join(' | ')"

await runToolCheck('PDF 合并与拆分', async (t) => {
  // ── 合并 ──
  await t.setFiles(`Promise.all([${makePdf('A.pdf', [200, 210])}, ${makePdf('B.pdf', [300, 310, 320])}])`)
  await t.waitFor(`${listText}.length === 2`, 'merge list not shown')
  t.assert.deepEqual(await t.eval(listText), ['A.pdf:2 页', 'B.pdf:3 页'])
  t.pass('多选两个 PDF，列表显示每个文件页数（2 页、3 页）')

  await t.clickText('合并（共 5 页）')
  await t.waitFor("!!document.querySelector('.pdf-ms__download')", 'merge output not shown')
  t.assert.deepEqual(await t.eval(outputWidths), [200, 210, 300, 310, 320])
  t.pass('合并后 5 页，页序 A1 A2 B1 B2 B3')

  // 下移 A → 顺序变 B、A；旧结果作废
  await t.click('button[aria-label="下移 A.pdf"]')
  t.assert.deepEqual(await t.eval(listText), ['B.pdf:3 页', 'A.pdf:2 页'])
  t.assert.equal(await t.eval("!!document.querySelector('.pdf-ms__download')"), false, 'reorder should discard stale output')
  await t.clickText('合并（共 5 页）')
  await t.waitFor("!!document.querySelector('.pdf-ms__download')", 'merge output after reorder not shown')
  t.assert.deepEqual(await t.eval(outputWidths), [300, 310, 320, 200, 210])
  t.pass('下移后重新合并，页序跟着变成 B 在前；调整顺序时旧下载链接作废')

  // 移除 → 只剩一个文件时不能合并
  await t.click('button[aria-label="移除 B.pdf"]')
  t.assert.deepEqual(await t.eval(listText), ['A.pdf:2 页'])
  t.assert.equal(await t.eval("[...document.querySelectorAll('.tool-panel button')].find((b) => b.textContent.startsWith('合并') && b.classList.contains('btn')).disabled"), true)
  t.pass('移除后只剩 1 个文件，合并按钮禁用')

  // 加密 PDF：在 trailer 里塞一个 /Encrypt 字典，pdf-lib 读取时会抛加密错误
  await t.setFiles(`(async () => {
    const { PDFDocument } = await ${LIB}
    const doc = await PDFDocument.create(); doc.addPage()
    const text = new TextDecoder('latin1').decode(await doc.save({ useObjectStreams: false }))
    const patched = text.replace(/trailer\\s*<</, 'trailer\\n<<\\n/Encrypt << /Filter /Standard /V 1 /R 2 >>')
    return [new File([Uint8Array.from(patched, (c) => c.charCodeAt(0))], '加密.pdf', { type: 'application/pdf' })]
  })()`)
  await t.waitFor(`/「加密\\.pdf」有密码保护，暂不支持/.test(${alertText})`, 'encrypted pdf message not shown')
  t.assert.deepEqual(await t.eval(listText), ['A.pdf:2 页'], 'encrypted file must not join the list')
  t.pass('加密 PDF 提示「有密码保护，暂不支持」，不加入合并列表')

  // 不是 PDF 的文件（扩展名对、内容不对）
  await t.setFiles("Promise.resolve([new File(['hello'], '假的.pdf', { type: 'application/pdf' })])")
  await t.waitFor(`/「假的\\.pdf」读取失败/.test(${alertText})`, 'broken pdf message not shown')
  t.pass('内容不是 PDF 的文件提示「读取失败：可能已损坏」')

  // ── 拆分 ──
  await t.clickText('拆分')
  await t.setFiles(`Promise.all([${makePdf('报告.pdf', [100, 110, 120, 130, 140])}])`)
  await t.waitFor("/共 5 页/.test(document.querySelector('.pdf-ms__current')?.textContent ?? '')", 'split file not loaded')

  await t.input('input[aria-label="页码范围"]', '2-3')
  t.assert.match(await t.eval("document.querySelector('.tool-panel').textContent"), /将提取 2 页：2, 3/)
  await t.clickText('提取为新 PDF')
  await t.waitFor("!!document.querySelector('.pdf-ms__download')", 'extract output not shown')
  t.assert.deepEqual(await t.eval(outputWidths), [110, 120])
  t.assert.equal(await t.eval("document.querySelector('.pdf-ms__download').download"), '报告-提取.pdf')
  t.pass('拆分 2-3 → 新 PDF 2 页（第 2、3 页）')

  await t.input('input[aria-label="页码范围"]', '5, 1-2, 8-')
  await t.waitFor(`/只有 5 页/.test(${alertText})`, 'out-of-range error not shown')
  t.assert.equal(await t.eval("[...document.querySelectorAll('.tool-panel button')].find((b) => b.textContent === '提取为新 PDF').disabled"), true)
  await t.input('input[aria-label="页码范围"]', '4-2')
  await t.waitFor(`/反向范围，请写成 2-4/.test(${alertText})`, 'reverse range error not shown')
  t.pass('越界、反向范围给出明确错误，提取按钮禁用')

  await t.input('input[aria-label="页码范围"]', '5, 1-2')
  await t.clickText('提取为新 PDF')
  await t.waitFor("!!document.querySelector('.pdf-ms__download')", 'reordered extract output not shown')
  t.assert.deepEqual(await t.eval(outputWidths), [140, 100, 110])
  t.pass('「5, 1-2」按填写顺序输出：第 5 页在最前')

  await t.clickText('每页拆成单独文件（ZIP）')
  await t.waitFor("/\\.zip$/.test(document.querySelector('.pdf-ms__download')?.download ?? '')", 'zip output not shown')
  const zip = await t.eval(`(async () => {
    const bytes = new Uint8Array(await (await fetch(document.querySelector('.pdf-ms__download').href)).arrayBuffer())
    const view = new DataView(bytes.buffer)
    const eocd = bytes.length - 22
    const count = view.getUint16(eocd + 10, true)
    // 顺着本地文件头读出每个文件名和内容（store 模式，数据紧跟文件头）
    const { PDFDocument } = await ${LIB}
    const files = []
    let offset = 0
    for (let i = 0; i < count; i++) {
      const size = view.getUint32(offset + 18, true), nameLen = view.getUint16(offset + 26, true)
      const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen))
      const doc = await PDFDocument.load(bytes.slice(offset + 30 + nameLen, offset + 30 + nameLen + size))
      files.push(name + ':' + doc.getPageCount() + ':' + Math.round(doc.getPage(0).getWidth()))
      offset += 30 + nameLen + size
    }
    return files
  })()`)
  t.assert.deepEqual(zip, ['报告-p1.pdf:1:100', '报告-p2.pdf:1:110', '报告-p3.pdf:1:120', '报告-p4.pdf:1:130', '报告-p5.pdf:1:140'])
  t.pass('每页拆成单独文件：ZIP 里 5 个 1 页 PDF，文件名和页序对应')

  // 390px 宽：长文件名不能把面板撑出横向滚动
  await t.clickText('合并')
  await t.setFiles(`Promise.all([${makePdf('一个非常非常非常非常非常非常非常非常非常非常长的文件名-用来测试移动端会不会横向溢出.pdf', [200])}, ${makePdf('B.pdf', [300])}])`)
  await t.waitFor(`${listText}.length >= 2`, 'long-name list not shown')
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(300)
  const overflow = await t.eval('document.documentElement.scrollWidth - window.innerWidth')
  t.assert.ok(overflow <= 0, `horizontal overflow ${overflow}px at 390px`)
  t.pass('390px 宽下长文件名省略截断，不横向溢出')
})
