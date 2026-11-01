// 文本加密工具的浏览器验收。运行：node scripts/checks/text-encrypt.mjs
import { runToolCheck } from '../lib/tool-harness.mjs'

const result = "document.querySelector('textarea[aria-label=\"结果\"]')?.value ?? ''"
const error = "document.querySelector('.tool-panel [role=alert]')?.textContent ?? ''"
const runButton = "document.querySelector('.text-encrypt__password-row .btn--primary')"

/** 点主按钮，并用 MutationObserver 记录期间是否出现过「处理中」且按钮被禁用（PBKDF2 只跑几百毫秒，轮询可能错过） */
async function runAndWatch(t) {
  await t.eval(`(() => {
    window.__sawBusy = false
    const button = ${runButton}
    const observer = new MutationObserver(() => { if (button.textContent.includes('处理中') && button.disabled) window.__sawBusy = true })
    observer.observe(button, { childList: true, characterData: true, subtree: true, attributes: true })
    window.__stopWatch = () => observer.disconnect()
    button.click()
  })()`)
  await t.waitFor(`!${runButton}.disabled`, '加解密一直没结束', 30000)
  return t.eval('(window.__stopWatch(), window.__sawBusy)')
}

await runToolCheck('文本加密', async (t) => {
  const { assert } = t
  const panel = await t.eval("document.querySelector('.tool-panel').textContent")
  assert.match(panel, /只能用本工具解开/)
  assert.match(panel, /CryptoJS/)
  t.pass('界面写明密文只能用本工具解开、不兼容 CryptoJS')

  // 缺密码时不开跑
  await t.input('textarea[aria-label="明文"]', '今天签到了 😀')
  await t.click('.text-encrypt__password-row .btn--primary')
  assert.match(await t.eval(error), /先输入密码/)
  t.pass('没填密码时提示，不加密')

  // 加密：显示「处理中」并禁用按钮
  await t.input('input[aria-label="密码"]', 'correct horse')
  const sawBusy = await runAndWatch(t)
  assert.equal(sawBusy, true, '加密期间没出现「处理中」+ 禁用')
  const cipher = await t.eval(result)
  assert.match(cipher, /^[A-Za-z0-9+/]+=*$/)
  const bytes = await t.eval(`atob(${JSON.stringify(cipher)}).length`)
  assert.equal(bytes, 1 + 16 + 12 + new TextEncoder().encode('今天签到了 😀').length + 16)
  assert.equal(await t.eval(`atob(${JSON.stringify(cipher)}).charCodeAt(0)`), 1)
  t.pass(`加密期间显示「处理中」并禁用按钮；密文 ${bytes} 字节 = 版本号 + 盐 + IV + 密文 + 标签`)

  // 解密：正确密码
  await t.clickText('解密', '.tool-panel [aria-label="模式"]')
  await t.input('textarea[aria-label="密文"]', `\n ${cipher} \n`)
  await t.input('input[aria-label="密码"]', 'correct horse')
  assert.equal(await runAndWatch(t), true, '解密期间没出现「处理中」+ 禁用')
  assert.equal(await t.eval(result), '今天签到了 😀')
  t.pass('正确密码解回原文（密文首尾带空白也行）')

  // 错密码
  await t.input('input[aria-label="密码"]', 'wrong')
  await runAndWatch(t)
  assert.equal(await t.eval(error), '密码错误或密文已损坏')
  assert.equal(await t.eval(result), '')
  t.pass('错密码 → 密码错误或密文已损坏')

  // 篡改一个字节
  const tampered = await t.eval(`(() => { const b = [...atob(${JSON.stringify(cipher)})].map(c => c.charCodeAt(0)); b[40] ^= 1; return btoa(String.fromCharCode(...b)) })()`)
  await t.input('textarea[aria-label="密文"]', tampered)
  await t.input('input[aria-label="密码"]', 'correct horse')
  await runAndWatch(t)
  assert.equal(await t.eval(error), '密码错误或密文已损坏')
  t.pass('密文被改一个字节 → GCM 认证失败，提示损坏')

  // 不是本工具的格式
  // CryptoJS 默认格式：「Salted__」+ 8 字节盐 + 密文，Base64 后以 U2FsdGVkX1 开头。首字节是 'S'（0x53）而不是版本号 1
  const cryptoJsStyle = Buffer.concat([Buffer.from('Salted__'), Buffer.alloc(8, 7), Buffer.alloc(32, 9)]).toString('base64')
  await t.input('textarea[aria-label="密文"]', cryptoJsStyle)
  await runAndWatch(t)
  assert.match(await t.eval(error), /不认识的格式版本/)
  t.pass('CryptoJS 风格的密文给出「格式不认识」提示')

  // 复制失败兜底
  await t.input('textarea[aria-label="密文"]', cipher)
  await runAndWatch(t)
  await t.eval("navigator.clipboard.writeText = async () => { throw new DOMException('denied', 'NotAllowedError') }")
  await t.clickText('复制结果')
  await t.waitFor("/手动/.test(document.querySelector('.text-encrypt__actions .hint')?.textContent ?? '')", '复制失败时没有提示')
  t.pass('复制失败提示手动复制')

  await t.page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await t.clickText('加密', '.tool-panel [aria-label="模式"]')
  await t.input('textarea[aria-label="明文"]', '长'.repeat(400))
  await runAndWatch(t)
  const overflow = await t.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  assert.ok(overflow <= 0, `390px 下横向溢出 ${overflow}px`)
  await t.shot('text-encrypt-390.png')
  t.pass('390px 宽长密文无横向溢出')
})
