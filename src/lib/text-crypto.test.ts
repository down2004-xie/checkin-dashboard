import { describe, expect, it } from 'vitest'

import { base64ToBytes, bytesToBase64 } from './encoding'
import { FORMAT_VERSION, PBKDF2_ITERATIONS, WRONG_PASSWORD_MESSAGE, decryptText, encryptText } from './text-crypto'

// 生产用 600,000 次，测试里注入小值加速（迭代次数不影响格式和正确性，只影响破解成本）
const FAST = { iterations: 1000 }

/** 把 Base64 密文解成字节、改一下、再编回去 */
function tamper(encoded: string, change: (bytes: Uint8Array) => void): string {
  const parsed = base64ToBytes(encoded)
  if (!parsed.ok) throw new Error(parsed.error)
  const copy = new Uint8Array(parsed.bytes)
  change(copy)
  return bytesToBase64(copy)
}

describe('文本加密（AES-GCM + PBKDF2）', () => {
  it('迭代次数是 OWASP 推荐值', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000)
  })

  it('往返：中文 + emoji + 空串', async () => {
    for (const text of ['今天签到了 😀', '', 'a'.repeat(5000)]) {
      const cipher = await encryptText(text, '正确的密码', FAST)
      expect(await decryptText(cipher, '正确的密码', FAST)).toEqual({ ok: true, text })
    }
  })

  it('格式：版本号 + 16 字节盐 + 12 字节 IV + 密文 + 16 字节标签', async () => {
    const parsed = base64ToBytes(await encryptText('abc', 'pw', FAST))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.bytes[0]).toBe(FORMAT_VERSION)
    expect(parsed.bytes.length).toBe(1 + 16 + 12 + 3 + 16)
  })

  it('同一明文同一密码，每次密文都不同（随机盐 + IV）', async () => {
    const a = await encryptText('same', 'pw', FAST)
    const b = await encryptText('same', 'pw', FAST)
    expect(a).not.toBe(b)
  })

  it('错密码 → 密码错误或密文已损坏', async () => {
    const cipher = await encryptText('secret', 'right', FAST)
    expect(await decryptText(cipher, 'wrong', FAST)).toEqual({ ok: false, error: WRONG_PASSWORD_MESSAGE })
  })

  it('迭代次数对不上也解不开（证明迭代次数确实参与了派生）', async () => {
    const cipher = await encryptText('secret', 'pw', FAST)
    expect((await decryptText(cipher, 'pw', { iterations: 1001 })).ok).toBe(false)
  })

  it('篡改密文、盐、IV、标签任意一个字节都会被 GCM 认证发现', async () => {
    const cipher = await encryptText('不许改', 'pw', FAST)
    const parsed = base64ToBytes(cipher)
    if (!parsed.ok) throw new Error(parsed.error)
    const length = parsed.bytes.length
    for (const index of [1, 17, 29, length - 1]) { // 盐、IV、密文首字节、标签末字节
      const bad = tamper(cipher, (bytes) => { bytes[index] ^= 0x01 })
      expect(await decryptText(bad, 'pw', FAST), `第 ${index} 字节`).toEqual({ ok: false, error: WRONG_PASSWORD_MESSAGE })
    }
  })

  it('版本号不对 → 明确报格式不认识（不用到密码）', async () => {
    const cipher = await encryptText('x', 'pw', FAST)
    const result = await decryptText(tamper(cipher, (bytes) => { bytes[0] = 2 }), 'pw', FAST)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/版本/)
  })

  it('不是 Base64、或太短，给具体原因', async () => {
    const notBase64 = await decryptText('这不是密文', 'pw', FAST)
    expect(notBase64.ok === false && notBase64.error).toMatch(/Base64/)
    const tooShort = await decryptText(bytesToBase64(new Uint8Array([FORMAT_VERSION, 1, 2, 3])), 'pw', FAST)
    expect(tooShort.ok === false && tooShort.error).toMatch(/太短/)
  })

  it('密文首尾带空白换行也能解（聊天软件复制常见）', async () => {
    const cipher = await encryptText('hi', 'pw', FAST)
    expect(await decryptText(`\n  ${cipher}  \n`, 'pw', FAST)).toEqual({ ok: true, text: 'hi' })
  })
})
