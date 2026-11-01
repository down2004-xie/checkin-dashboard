// 哈希计算工具的浏览器验收。运行：node scripts/checks/hash-calc.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const value = (algorithm) => `document.querySelector('.hash-calc__row[data-algorithm="${algorithm}"] .hash-calc__value')?.textContent ?? ''`
const verdict = "document.querySelector('.hash-calc__verdict')?.textContent ?? ''"

await runToolCheck('哈希计算', async (t) => {
  const { assert } = t

  const text = await t.eval("document.querySelector('.tool-panel').textContent")
  assert.match(text, /不能「解密」/)
  assert.match(text, /对照表/)
  t.pass('界面写明哈希不能解密、MD5 解密是查对照表')

  // 文字模式：NIST "abc" 向量（输入后防抖 200ms 自动算）
  await t.input('textarea[aria-label="要计算哈希的文字"]', 'abc')
  await t.waitFor(`${value('SHA-256')} === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'`, 'SHA-256("abc") 不对')
  assert.equal(await t.eval(value('MD5')), '900150983cd24fb0d6963f7d28e17f72')
  assert.equal(await t.eval(value('SHA-1')), 'a9993e364706816aba3e25717850c26c9cd0d89d')
  assert.match(await t.eval(value('SHA-512')), /^ddaf35a193617aba/)
  t.pass('文字 "abc" 的四种哈希与 RFC 1321 / NIST 向量一致')

  // 期望值对比：大写 + 首尾空白也算一致，自动识别算法
  await t.input('input[aria-label="期望的哈希值"]', '  BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD \n')
  assert.match(await t.eval(verdict), /一致（SHA-256）/)
  assert.ok(await t.eval("!!document.querySelector('.hash-calc__row--match[data-algorithm=\"SHA-256\"]')"))
  await t.input('input[aria-label="期望的哈希值"]', '0'.repeat(32))
  assert.match(await t.eval(verdict), /不一致（MD5）/)
  await t.input('input[aria-label="期望的哈希值"]', 'abcd')
  assert.match(await t.eval("document.querySelector('.tool-panel [role=status].site-form__error')?.textContent ?? ''"), /对不上任何算法/)
  t.pass('期望值大小写不敏感、忽略空白；不一致和长度不对都有提示')

  // 复制
  await t.eval("window.__copied = null; navigator.clipboard.writeText = async (s) => { window.__copied = s }")
  await t.click('.hash-calc__row[data-algorithm="MD5"] .btn')
  await t.waitFor("window.__copied === '900150983cd24fb0d6963f7d28e17f72'", 'MD5 复制内容不对')
  t.pass('点「复制」复制对应算法的哈希')

  // 文件模式：页面里现造 3 MB 文件，期望值用页面自己的 crypto.subtle 算（独立于工具的代码路径）
  await t.clickText('文件', '.tool-panel [aria-label="计算对象"]')
  await t.waitFor("!!document.querySelector('input[type=file][aria-label=\"选择文件\"]')", '文件模式没有出现「选择文件」')
  const expected = await t.eval(`(async () => {
    const data = new Uint8Array(3 * 1024 * 1024); for (let i = 0; i < data.length; i++) data[i] = (i * 13) & 255
    window.__file = new File([data], 'sample.bin', { type: 'application/octet-stream' })
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('')
  })()`)
  await t.setFiles('[window.__file]', 'input[type=file][aria-label="选择文件"]')
  await t.waitFor(`${value('SHA-256')} === ${JSON.stringify(expected)}`, '文件 SHA-256 不对', 30000)
  assert.match(await t.eval("document.querySelector('.hash-calc__file')?.textContent ?? ''"), /sample\.bin（3\.0 MB）/)
  await t.input('input[aria-label="期望的哈希值"]', expected.toUpperCase())
  assert.match(await t.eval(verdict), /一致（SHA-256）/)
  t.pass(`文件 3 MB 的 SHA-256 与页面独立计算一致，期望值对比通过`)

  // 未知类型文件（accept 为空串，任何文件都收）
  await t.setFiles("[new File([new TextEncoder().encode('abc')], 'x.weird')]", 'input[type=file][aria-label="选择文件"]')
  await t.waitFor(`${value('MD5')} === '900150983cd24fb0d6963f7d28e17f72'`, '任意扩展名文件没被接收')
  t.pass('任意扩展名的文件都能算（accept 为空）')

  // 竞态：先选 64 MB 大文件、紧接着选小文件。大文件后算完，结果不能覆盖小文件的
  await t.eval("window.__big = new File([new Uint8Array(64 * 1024 * 1024)], 'big.bin')")
  await t.setFiles('[window.__big]', 'input[type=file][aria-label="选择文件"]')
  await t.setFiles("[new File([new TextEncoder().encode('a')], 'small.txt')]", 'input[type=file][aria-label="选择文件"]')
  await t.waitFor(`${value('MD5')} === '0cc175b9c0f1b6a831c399e269772661'`, '小文件结果没出现')
  await t.delay(3000) // 给大文件足够时间算完
  assert.equal(await t.eval(value('MD5')), '0cc175b9c0f1b6a831c399e269772661', '大文件的过期结果覆盖了后选的小文件')
  assert.match(await t.eval("document.querySelector('.hash-calc__file')?.textContent ?? ''"), /small\.txt/)
  t.pass('连续选两个文件，先选的大文件后算完也不会覆盖结果')

  // 390px 宽不横向溢出（SHA-512 是 128 位长串）
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const overflow = await t.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 0, `390px 下横向溢出 ${overflow}px`)
  await t.shot('hash-calc-390.png')
  t.pass('390px 宽无横向溢出')
})
