/* MD5（RFC 1321）手写实现 —— 纯函数，可单测。
 *
 * 为什么要手写：浏览器的 crypto.subtle.digest 只支持 SHA 系列，**不支持 MD5**
 * （MD5 早已被证明可以人为构造碰撞，WebCrypto 标准刻意不收）。
 * 但很多下载站仍只给 MD5 校验值，所以「校验下载是否完整」这个场景还得有它。
 * MD5 在这里只用来检测「传输中意外损坏」，不能用来防「有人故意篡改」。
 *
 * 做成增量接口（update 可调多次）：大文件可以分块喂进来，每块之间让出主线程刷新进度，
 * 也不用为了补位再把整个文件拷贝一份。
 */

/** 每轮循环左移的位数（RFC 1321 §3.4，四轮各 4 个值循环使用） */
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

/**
 * 常量表 T[i] = floor(2^32 × |sin(i + 1)|)（RFC 1321 §3.4）。
 * 写死而不是运行时用 Math.sin 现算：ECMAScript 规范不要求 Math.sin 在各引擎间逐位一致，
 * 差一个末位就会让所有哈希全错。这张表由公式生成后和 RFC 原文首尾项（d76aa478 / eb86d391）核对过，
 * md5.test.ts 里还有一条测试用公式重算对照。
 */
const T = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

/** 导出给单测：拿它和按 RFC 公式重算的结果逐项对照 */
export const MD5_T_TABLE: readonly number[] = T

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))

export class Md5 {
  // 初始链值（RFC 1321 §3.3，按小端写出就是 01 23 45 67 89 ab cd ef …）
  private a = 0x67452301
  private b = 0xefcdab89
  private c = 0x98badcfe
  private d = 0x10325476
  /** 不满 64 字节、还没处理的尾巴 */
  private buffer = new Uint8Array(64)
  private buffered = 0
  /** 已喂入的总字节数。用 number：2^53 字节远超任何能读进内存的文件 */
  private length = 0
  private readonly words = new Uint32Array(16)

  update(data: Uint8Array): this {
    this.length += data.length
    let offset = 0
    // 先把上次剩的尾巴凑满一块
    if (this.buffered > 0) {
      const take = Math.min(64 - this.buffered, data.length)
      this.buffer.set(data.subarray(0, take), this.buffered)
      this.buffered += take
      offset = take
      if (this.buffered < 64) return this
      this.block(this.buffer, 0)
      this.buffered = 0
    }
    // 整块直接从输入里读，不拷贝
    for (; offset + 64 <= data.length; offset += 64) this.block(data, offset)
    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0)
      this.buffered = data.length - offset
    }
    return this
  }

  /** 补位 + 输出 32 位小写十六进制。调用后实例不应再用 */
  hex(): string {
    // 补位（RFC 1321 §3.1~3.2）：一个 0x80，再补 0 到「长度 ≡ 56 (mod 64)」，最后 8 字节是**位**长度（小端）
    const bitLength = this.length * 8
    const tail = new Uint8Array(this.buffered < 56 ? 64 : 128)
    tail.set(this.buffer.subarray(0, this.buffered))
    tail[this.buffered] = 0x80
    const view = new DataView(tail.buffer)
    // 位长度可能超过 32 位（≥ 512 MB 的文件），拆成低 32 位和高 32 位分别写
    view.setUint32(tail.length - 8, bitLength >>> 0, true)
    view.setUint32(tail.length - 4, Math.floor(bitLength / 2 ** 32) >>> 0, true)
    for (let offset = 0; offset < tail.length; offset += 64) this.block(tail, offset)

    const out = new Uint8Array(16)
    const outView = new DataView(out.buffer)
    ;[this.a, this.b, this.c, this.d].forEach((word, i) => outView.setUint32(i * 4, word, true))
    return Array.from(out, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  /** 处理一个 64 字节块（RFC 1321 §3.4 的四轮 64 步） */
  private block(data: Uint8Array, offset: number): void {
    const x = this.words
    // MD5 把每 4 字节按**小端**拼成一个 32 位字（SHA 系列是大端，这是两者最容易写错的差别）
    for (let i = 0; i < 16; i += 1) {
      const p = offset + i * 4
      x[i] = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24)
    }
    let a = this.a
    let b = this.b
    let c = this.c
    let d = this.d
    for (let i = 0; i < 64; i += 1) {
      let f: number
      let g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i } // F
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 } // G
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 } // H
      else { f = c ^ (b | ~d); g = (7 * i) % 16 } // I
      const next = d
      d = c
      c = b
      b = (b + rotl((a + f + T[i] + x[g]) | 0, SHIFTS[i])) | 0
      a = next
    }
    // | 0 / >>> 0：JS 的数是 64 位浮点，位运算后要手动截回 32 位，否则加法会越界成大数
    this.a = (this.a + a) >>> 0
    this.b = (this.b + b) >>> 0
    this.c = (this.c + c) >>> 0
    this.d = (this.d + d) >>> 0
  }
}

/** 一次性算 MD5，返回 32 位小写十六进制 */
export function md5Hex(data: Uint8Array): string {
  return new Md5().update(data).hex()
}
