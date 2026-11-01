/* 文本加密 —— 用密码做 AES-GCM 加解密。只用 WebCrypto（crypto.subtle），零依赖。
 *
 * 流程：密码 --PBKDF2-SHA256(随机盐)--> 256 位 AES 密钥 --AES-GCM(随机 IV)--> 密文。
 *
 * 为什么不能直接拿密码当密钥：密码太短、太好猜，攻击者可以每秒试几十亿个。
 * PBKDF2 把「试一个密码」的成本拉高到几十万次 HMAC，暴力破解慢几十万倍；
 * 随机盐让同一个密码每次派生出不同的密钥，没法提前算好一张「密码 → 密钥」对照表。
 *
 * 为什么选 GCM：它是「认证加密」，密文附带一个 16 字节校验标签。
 * 密码错了、或密文被改了哪怕一个字节，解密都会失败（抛 OperationError），而不是吐出一堆乱码。
 *
 * 输出格式（本工具自定义，所以**只能用本工具解开**，和 CryptoJS 等工具的格式不兼容）：
 *   [1 字节版本号][16 字节盐][12 字节 IV][密文 + 16 字节 GCM 标签]  → 整体 Base64
 */
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './encoding'

/** 当前格式版本。以后改迭代次数或算法就升版本号，老密文按老参数仍能解开 */
export const FORMAT_VERSION = 1

/**
 * PBKDF2-HMAC-SHA256 迭代次数：600,000。
 * 来源：OWASP Password Storage Cheat Sheet（2026-11 查证）原文
 * 「PBKDF2-HMAC-SHA256: 600,000 iterations (recommended)」。
 * 代价：主线程上派生一次密钥约几百毫秒，所以界面加解密时显示「处理中」并禁用按钮。
 * 迭代次数跟着版本号走（不写进密文），改它必须升 FORMAT_VERSION，否则老密文会解不开。
 */
export const PBKDF2_ITERATIONS = 600_000

const SALT_BYTES = 16
/** 12 字节（96 位）是 GCM 的标准 IV 长度（NIST SP 800-38D 推荐），其他长度要额外做一次 GHASH */
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = 1 + SALT_BYTES + IV_BYTES

export interface CryptoOptions {
  /** 只给单测用：600,000 次在测试里太慢，注入小值加速。生产代码不传 */
  iterations?: number
}

export type DecryptResult = { ok: true; text: string } | { ok: false; error: string }

export const WRONG_PASSWORD_MESSAGE = '密码错误或密文已损坏'

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, usage: KeyUsage): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // 密钥不可导出：只在这次调用里用，用完就丢
    [usage],
  )
}

/**
 * 加密：每次都生成新的随机盐和 IV。
 * 同一个密码、同一段文字，每次加密的结果都不一样 —— 这是对的：
 * GCM 同一密钥重复使用同一个 IV 会直接泄露明文的异或关系，必须每次都换。
 */
export async function encryptText(plain: string, password: string, options: CryptoOptions = {}): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, options.iterations ?? PBKDF2_ITERATIONS, 'encrypt')
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8Encode(plain)))
  const out = new Uint8Array(HEADER_BYTES + cipher.length)
  out[0] = FORMAT_VERSION
  out.set(salt, 1)
  out.set(iv, 1 + SALT_BYTES)
  out.set(cipher, HEADER_BYTES)
  return bytesToBase64(out)
}

/**
 * 解密。先做不需要密码就能查的格式检查（Base64、长度、版本号），给出具体原因；
 * 过了格式检查还失败，就只能是密码错或数据被改 —— GCM 区分不了这两者，所以合成一句提示。
 */
export async function decryptText(encoded: string, password: string, options: CryptoOptions = {}): Promise<DecryptResult> {
  const parsed = base64ToBytes(encoded)
  if (!parsed.ok) return { ok: false, error: `密文不是有效的 Base64，可能复制不完整（${parsed.error}）` }
  const bytes = parsed.bytes
  if (bytes.length < HEADER_BYTES + TAG_BYTES) return { ok: false, error: '密文太短，不是本工具加密的结果，或者复制不完整' }
  if (bytes[0] !== FORMAT_VERSION) {
    return { ok: false, error: `不认识的格式版本（${bytes[0]}）。这段密文不是本工具加密的，本工具不兼容 CryptoJS 等其他工具的格式` }
  }
  const salt = bytes.subarray(1, 1 + SALT_BYTES)
  const iv = bytes.subarray(1 + SALT_BYTES, HEADER_BYTES)
  const cipher = bytes.subarray(HEADER_BYTES)
  try {
    const key = await deriveKey(password, salt, options.iterations ?? PBKDF2_ITERATIONS, 'decrypt')
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher))
    const text = utf8Decode(plain)
    return text.ok ? { ok: true, text: text.value } : { ok: false, error: WRONG_PASSWORD_MESSAGE }
  } catch (error) {
    // GCM 标签校验失败抛的是 OperationError；其他异常（理论上不该有）也按「解不开」处理，不让页面崩
    if (error instanceof Error && error.name !== 'OperationError') console.warn('decryptText:', error)
    return { ok: false, error: WRONG_PASSWORD_MESSAGE }
  }
}
