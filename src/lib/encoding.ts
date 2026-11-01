/* 编码转换 —— 纯函数，可单测。Base64 / URL / Unicode 转义 / 十六进制。
 *
 * 统一约定：所有「文字 ↔ 字节」都走 UTF-8（TextEncoder / TextDecoder），
 * 这样中文、emoji 在四种编码里得到的是同一串字节，结果能和其他主流工具对得上。
 *
 * 错误处理：解码类函数遇到非法输入返回 { ok: false, error }，**不抛异常**。
 * 组件只管把 error 显示出来，不用每处都包 try/catch。
 */

export type CodecResult = { ok: true; value: string } | { ok: false; error: string }

const ok = (value: string): CodecResult => ({ ok: true, value })
const fail = (error: string): CodecResult => ({ ok: false, error })

const encoder = new TextEncoder()

/**
 * 文字 → UTF-8 字节。返回类型写明 Uint8Array<ArrayBuffer>：TS 5.7 起 Uint8Array 默认是
 * Uint8Array<ArrayBufferLike>（可能是 SharedArrayBuffer），crypto.subtle 的参数不收它，会编译报错。
 */
export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text)
}

/**
 * UTF-8 字节 → 文字。fatal: true 让非法字节序列报错，而不是悄悄变成 U+FFFD（�）：
 * 用户解出一堆问号会以为是工具坏了，明确告诉他「这不是 UTF-8 文本」更有用。
 */
export function utf8Decode(bytes: Uint8Array): CodecResult {
  try {
    return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return fail('解码出的字节不是有效的 UTF-8 文字（原数据可能是图片等二进制内容，或者不是 UTF-8 编码）')
  }
}

// ---------- Base64 ----------

const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const URL_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 解码查表：标准和 URL 安全两套字母都认（+ 和 - 都是 62，/ 和 _ 都是 63），所以两种变体可以互相解 */
const DECODE_TABLE: Record<string, number> = {}
for (let i = 0; i < 64; i += 1) {
  DECODE_TABLE[STANDARD_ALPHABET[i]] = i
  DECODE_TABLE[URL_SAFE_ALPHABET[i]] = i
}

export interface Base64Options {
  /** URL 安全变体（RFC 4648 §5）：+/ 换成 -_，并省略末尾的 = */
  urlSafe?: boolean
}

/**
 * 字节 → Base64。自己按字节查表，不用 btoa，也不用 Uint8Array.prototype.toBase64：
 * - btoa 只认 Latin-1（每个字符必须 ≤ 0xFF），见 encodeBase64 的注释；
 * - toBase64 是 2025 年才进标准的新 API，老浏览器没有，用了会直接报「不是函数」。
 *
 * 每 3 字节（24 位）切成 4 个 6 位，各查一个字符；末尾不足 3 字节时用 = 补齐到 4 的倍数。
 */
export function bytesToBase64(bytes: Uint8Array, options: Base64Options = {}): string {
  const alphabet = options.urlSafe ? URL_SAFE_ALPHABET : STANDARD_ALPHABET
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    out += alphabet[(triple >> 18) & 63] + alphabet[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? alphabet[triple & 63] : '='
  }
  return options.urlSafe ? out.replace(/=+$/, '') : out
}

export type BytesResult = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string }

/**
 * Base64 → 字节。宽容地接受常见「不规范」写法，严格地拒绝真错误：
 * - 容忍：空白和换行（邮件、PEM 每 76 字符折行）、缺失的 = 、标准与 URL 安全字母混用；
 * - 拒绝：表外字符、= 出现在中间、去掉 = 后长度除 4 余 1（这种长度任何字节串都编不出来）。
 */
export function base64ToBytes(input: string): BytesResult {
  const compact = input.replace(/\s+/g, '')
  const body = compact.replace(/=+$/, '')
  const padding = compact.length - body.length
  if (padding > 2) return { ok: false, error: '末尾的 = 最多两个' }
  for (let i = 0; i < body.length; i += 1) {
    if (DECODE_TABLE[body[i]] === undefined) {
      const char = body[i] === '=' ? '=（只能出现在末尾）' : `「${body[i]}」`
      return { ok: false, error: `不是有效的 Base64：第 ${i + 1} 个有效字符 ${char} 不在 Base64 字符表里` }
    }
  }
  if (body.length % 4 === 1) return { ok: false, error: '不是有效的 Base64：长度不对，内容可能被截断了' }
  if (padding > 0 && (body.length + padding) % 4 !== 0) return { ok: false, error: '不是有效的 Base64：末尾 = 的个数和长度对不上' }

  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8))
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of body) {
    buffer = (buffer << 6) | DECODE_TABLE[char]
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[index] = (buffer >> bits) & 0xff
      index += 1
    }
    buffer &= (1 << bits) - 1 // 只留还没用掉的位，避免左移溢出 32 位
  }
  return { ok: true, bytes }
}

/**
 * 文字 → Base64（先转 UTF-8 字节）。
 *
 * 踩坑点：不能直接 btoa('你好')。btoa 的输入被当成「每个字符一个字节」的 Latin-1 串，
 * 遇到 > 0xFF 的字符（所有中文、emoji）直接抛 InvalidCharacterError。
 * 网上常见的 btoa(unescape(encodeURIComponent(s))) 能绕过去，但 unescape 已被标记为废弃。
 * 正确做法是先用 TextEncoder 拿到 UTF-8 字节，再对字节做 Base64。
 */
export function encodeBase64(text: string, options: Base64Options = {}): string {
  return bytesToBase64(utf8Encode(text), options)
}

/** Base64 → 文字。标准和 URL 安全变体都能解。 */
export function decodeBase64(input: string): CodecResult {
  if (input.trim() === '') return ok('')
  const result = base64ToBytes(input)
  if (!result.ok) return fail(result.error)
  return utf8Decode(result.bytes)
}

// ---------- URL ----------

/**
 * URL 编码（encodeURIComponent）：除 A-Z a-z 0-9 - _ . ! ~ * ' ( ) 以外全部转成 %XX。
 * 用它而不是 encodeURI：encodeURI 不编码 & = ? / #，拿去拼查询参数会把参数切断。
 * 唯一会抛的情况是字符串里有不成对的代理项（半个 emoji），这里转成错误提示。
 */
export function encodeUrl(text: string): CodecResult {
  try {
    return ok(encodeURIComponent(text))
  } catch {
    return fail('文字里有残缺的字符（例如被截断的半个 emoji），无法编码')
  }
}

/**
 * URL 解码。% 后面不是两位十六进制、或拼出的字节不是合法 UTF-8 时 decodeURIComponent 抛 URIError。
 * 注意：表单提交里的 + 代表空格，decodeURIComponent 不认这个约定，+ 会原样保留。
 */
export function decodeUrl(input: string): CodecResult {
  try {
    return ok(decodeURIComponent(input))
  } catch {
    return fail('不是有效的 URL 编码：% 后面必须是两位十六进制，且拼出来要是合法的 UTF-8')
  }
}

// ---------- Unicode 转义 ----------

const hex4 = (code: number) => code.toString(16).toUpperCase().padStart(4, '0')

export interface UnicodeEscapeOptions {
  /** 连 ASCII 字符（英文、数字、标点）也转义。默认只转非 ASCII，英文保持可读 */
  escapeAscii?: boolean
}

/**
 * 文字 → \uXXXX 转义。
 *
 * 码点 > 0xFFFF（大部分 emoji）用 UTF-16 代理对，写成两个 \uXXXX（如 😀 → \uD83D\uDE00），
 * 而不是 \u{1F600}。原因：代理对写法 JSON、Java、C#、旧版 JS 都认；\u{...} 只有 ES2015+ 的 JS
 * 和少数语言认，JSON 不认。解码时两种写法都接受。
 */
export function escapeUnicode(text: string, options: UnicodeEscapeOptions = {}): string {
  let out = ''
  // 按 UTF-16 码元遍历：emoji 自然拆成两个码元，正好就是代理对
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    out += !options.escapeAscii && code < 0x80 ? text[i] : `\\u${hex4(code)}`
  }
  return out
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * \uXXXX / \u{X...} → 文字。不是转义的部分原样保留。
 * 报错的情况：\u 后面跟的不是合法十六进制、码点超过 10FFFF、
 * 或者代理对不成对（只有半个 emoji，显示出来是乱码）。
 */
export function unescapeUnicode(input: string): CodecResult {
  let out = ''
  let i = 0
  while (i < input.length) {
    if (input[i] !== '\\' || input[i + 1] !== 'u') {
      out += input[i]
      i += 1
      continue
    }
    const braced = /^\\u\{([0-9a-fA-F]{1,6})\}/.exec(input.slice(i, i + 10))
    if (braced) {
      const code = parseInt(braced[1], 16)
      if (code > 0x10ffff) return fail(`第 ${i + 1} 个字符处的 \\u{${braced[1]}} 超出了 Unicode 范围（最大 10FFFF）`)
      out += String.fromCodePoint(code)
      i += braced[0].length
      continue
    }
    const plain = /^\\u([0-9a-fA-F]{4})/.exec(input.slice(i, i + 6))
    if (!plain) return fail(`第 ${i + 1} 个字符处的 \\u 后面应该是 4 位十六进制（如 \\u4F60）或 \\u{1F600}`)
    out += String.fromCharCode(parseInt(plain[1], 16))
    i += 6
  }
  // 检查代理对是否成对：高位后面必须紧跟低位，低位前面必须是高位
  for (let k = 0; k < out.length; k += 1) {
    const code = out.charCodeAt(k)
    if (isHigh(code) && isLow(out.charCodeAt(k + 1))) { k += 1; continue }
    if (isHigh(code) || isLow(code)) return fail('有不成对的代理项（\\uD800–\\uDFFF 必须高位 + 低位成对出现），结果会是乱码')
  }
  return ok(out)
}

// ---------- 十六进制 ----------

/** 字节 → 十六进制（小写）。separator 默认空格，便于人眼数字节 */
export function bytesToHex(bytes: Uint8Array, separator = ''): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(separator)
}

/** 文字 → UTF-8 字节的十六进制，如「你」→ "e4 bd a0" */
export function encodeHex(text: string, separator = ' '): string {
  return bytesToHex(utf8Encode(text), separator)
}

/**
 * 十六进制 → 文字。容忍空白、0x 前缀、逗号/冒号/连字符分隔（各种工具导出的格式都能直接贴）。
 */
export function decodeHex(input: string): CodecResult {
  const compact = input.replace(/0x/gi, '').replace(/[\s,:-]+/g, '')
  if (compact === '') return ok('')
  const bad = /[^0-9a-fA-F]/.exec(compact)
  if (bad) return fail(`不是有效的十六进制：「${bad[0]}」不是 0-9 / a-f`)
  if (compact.length % 2 !== 0) return fail('十六进制位数必须是偶数（每个字节两位），可能漏了一位')
  const bytes = new Uint8Array(compact.length / 2)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16)
  return utf8Decode(bytes)
}
