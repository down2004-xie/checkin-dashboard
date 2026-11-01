// 编码转换工具的浏览器验收。运行：node scripts/checks/encode-convert.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const BS = String.fromCharCode(92) // 反斜杠
const output = "document.querySelector('textarea[aria-label=\"输出结果\"]').value"
const error = "document.querySelector('.tool-panel [role=alert]')?.textContent ?? ''"

await runToolCheck('编码转换', async (t) => {
  const { assert } = t
  const mode = (label) => t.clickText(label, '.tool-panel [aria-label="编码类型"]')
  const direction = (label) => t.clickText(label, '.tool-panel [aria-label="方向"]')
  const type = (value) => t.input('textarea[aria-label="输入文本"]', value)

  // 提示语：Base64 不是加密
  const notes = await t.eval("document.querySelector('.tool-panel').textContent")
  assert.match(notes, /Base64 不是加密/)
  t.pass('界面写明「Base64 不是加密」')

  // Base64：中文 + emoji 走 UTF-8（直接 btoa 会抛 InvalidCharacterError）
  await type('你好😀')
  assert.equal(await t.eval(output), '5L2g5aW98J+YgA==')
  t.pass('Base64 编码中文 + emoji：5L2g5aW98J+YgA==')

  await t.click('.encode-convert__option input')
  assert.equal(await t.eval(output), '5L2g5aW98J-YgA')
  t.pass('URL 安全变体：+ 换成 -，省略 =')

  await direction('解码')
  await type('5L2g5aW98J-YgA')
  assert.equal(await t.eval(output), '你好😀')
  await type('5L2g5aW9\n8J+YgA==')
  assert.equal(await t.eval(output), '你好😀')
  t.pass('解码同时认 URL 安全和标准写法，容忍换行')

  await type('abc*')
  assert.equal(await t.eval(output), '')
  assert.match(await t.eval(error), /不是有效的 Base64/)
  t.pass('非法 Base64 显示错误而不是崩溃')

  // URL
  await mode('URL')
  await direction('编码')
  await type('a b&c=你')
  assert.equal(await t.eval(output), 'a%20b%26c%3D%E4%BD%A0')
  await direction('解码')
  await type('%E4%BD')
  assert.match(await t.eval(error), /不是有效的 URL 编码/)
  t.pass('URL 编码正确，残缺的 %XX 给出提示')

  // Unicode
  await mode('Unicode')
  await direction('编码')
  await type('a你😀')
  assert.equal(await t.eval(output), `a${BS}u4F60${BS}uD83D${BS}uDE00`)
  await direction('解码')
  await type(`${BS}u{1F600}${BS}u4f60`)
  assert.equal(await t.eval(output), '😀你')
  t.pass('Unicode 转义：emoji 编成代理对，解码认 \\u{...}')

  // 十六进制
  await mode('十六进制')
  await direction('编码')
  await type('你A')
  assert.equal(await t.eval(output), 'e4 bd a0 41')
  await direction('解码')
  await type('0xE4,0xBD,0xA0')
  assert.equal(await t.eval(output), '你')
  t.pass('十六进制按 UTF-8 字节，解码容忍 0x 和逗号')

  // 凯撒
  await mode('凯撒密码')
  await direction('加密')
  await type('Hello, 世界!')
  assert.equal(await t.eval(output), 'Khoor, 世界!')
  await t.input('input[aria-label="偏移量"]', '-29')
  assert.equal(await t.eval(output), 'Ebiil, 世界!')
  await t.input('input[aria-label="偏移量"]', '1.5')
  assert.match(await t.eval(error), /整数/)
  t.pass('凯撒：默认偏移 3，负数和大于 26 正常，小数给提示')

  // 摩斯
  await mode('摩斯电码')
  await direction('编码')
  await type('SOS 你')
  assert.equal(await t.eval(output), '... --- ... / 你')
  const status = await t.eval("[...document.querySelectorAll('.tool-panel [role=status]')].map(e => e.textContent).join('|')")
  assert.match(status, /不支持这些字符.*你/)
  t.pass('摩斯：中文原样保留并提示不支持')

  // 复制：成功和失败两条路
  await t.eval("window.__copied = null; navigator.clipboard.writeText = async (s) => { window.__copied = s }")
  await t.clickText('复制结果')
  await t.waitFor("window.__copied === '... --- ... / 你'", '复制内容不对')
  await t.waitFor("document.querySelector('.encode-convert__actions .hint')?.textContent === '已复制'", '没有「已复制」提示')
  await t.eval("navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError') }")
  await t.clickText('复制结果')
  await t.waitFor("/手动/.test(document.querySelector('.encode-convert__actions .hint')?.textContent ?? '')", '复制失败时没有提示手动复制')
  t.pass('复制成功提示「已复制」，失败提示手动复制')

  // 390px 宽不横向溢出（长 Base64 串）
  await mode('Base64')
  await direction('编码')
  await type('很长的内容'.repeat(80))
  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.delay(200)
  const overflow = await t.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 0, `390px 下横向溢出 ${overflow}px`)
  await t.shot('encode-convert-390.png')
  t.pass('390px 宽无横向溢出')
})
