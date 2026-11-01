/* 哈希计算 —— MD5 / SHA-1 / SHA-256 / SHA-512。
 *
 * SHA 系列用浏览器自带的 crypto.subtle.digest（原生实现，比 JS 手写快一个数量级）；
 * MD5 WebCrypto 不提供，用 lib/md5.ts 手写的版本。
 * 不 import React，Node 22 的 vitest 里 globalThis.crypto.subtle 同样可用，所以能直接单测。
 */
import { bytesToHex } from './encoding'
import { Md5 } from './md5'

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']

/** 各算法十六进制结果的长度（= 位数 / 4）。用来从用户粘贴的期望值反推是哪种算法 */
export const HASH_HEX_LENGTH: Readonly<Record<HashAlgorithm, number>> = {
  MD5: 32, 'SHA-1': 40, 'SHA-256': 64, 'SHA-512': 128,
}

export type HashResults = Record<HashAlgorithm, string>

/** MD5 分块大小：每 4 MB 让出一次主线程，大文件算的时候进度条能动、页面不假死 */
const MD5_CHUNK = 4 * 1024 * 1024

const yieldToBrowser = () => new Promise<void>((done) => setTimeout(done, 0))

/** 单个算法，返回小写十六进制 */
export async function digestHex(algorithm: HashAlgorithm, data: Uint8Array<ArrayBuffer>): Promise<string> {
  if (algorithm === 'MD5') return new Md5().update(data).hex()
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm, data)))
}

/**
 * 四种算法一起算。onProgress 收到 0~1 的完成度（按「已完成的工作量」估算，只用于进度条）。
 * MD5 是 JS 写的、在主线程上跑，最慢，所以单独分块并在块之间让出主线程。
 */
export async function digestAll(data: Uint8Array<ArrayBuffer>, onProgress?: (done: number) => void): Promise<HashResults> {
  const md5 = new Md5()
  // MD5 占总工作量的一半，三个原生 SHA 合起来占另一半（经验估计，进度条只求「在动」，不求精确）
  for (let offset = 0; offset < data.length; offset += MD5_CHUNK) {
    md5.update(data.subarray(offset, offset + MD5_CHUNK))
    onProgress?.(0.5 * Math.min(1, (offset + MD5_CHUNK) / data.length))
    if (data.length > MD5_CHUNK) await yieldToBrowser()
  }
  const results: HashResults = { MD5: md5.hex(), 'SHA-1': '', 'SHA-256': '', 'SHA-512': '' }
  onProgress?.(0.5)
  const shas = ['SHA-1', 'SHA-256', 'SHA-512'] as const
  for (let i = 0; i < shas.length; i += 1) {
    results[shas[i]] = await digestHex(shas[i], data)
    onProgress?.(0.5 + (0.5 * (i + 1)) / shas.length)
  }
  return results
}

/**
 * 文件大小上限：1 GB。
 *
 * 为什么要有上限：crypto.subtle.digest **不支持流式**，只接受一整块内存里的数据，
 * 所以只能 file.arrayBuffer() 把整个文件读进内存再算。几个 GB 的文件会让标签页内存暴涨，
 * 浏览器要么 arrayBuffer() 直接失败，要么把标签页杀掉（「喔唷，崩溃啦」），用户什么提示都看不到。
 * 1 GB 是多数电脑上能稳定读进来的量；超过就明确告诉用户，而不是让页面崩掉。
 */
export const MAX_HASH_FILE_BYTES = 1024 ** 3

/** 文件太大时返回提示文案，否则 null */
export function fileTooLargeMessage(size: number): string | null {
  if (size <= MAX_HASH_FILE_BYTES) return null
  const gb = (size / 1024 ** 3).toFixed(2)
  return `文件有 ${gb} GB，超过了 1 GB 上限。浏览器算哈希必须把整个文件读进内存，太大会让页面崩溃；这么大的文件建议用系统命令（Windows：certutil -hashfile 文件名 SHA256）`
}

/** 期望值归一化：去首尾空白、转小写。下载站有的给大写有的给小写，复制时还常带空格换行 */
export function normalizeHash(input: string): string {
  return input.trim().toLowerCase()
}

export type HashMatch =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'match'; algorithm: HashAlgorithm }
  | { status: 'mismatch'; algorithm: HashAlgorithm }

/**
 * 把用户粘贴的期望值和计算结果对比，自动认出是哪种算法（靠十六进制长度）。
 * 有的下载站给的是「哈希值 + 两个空格 + 文件名」（sha256sum 的输出格式），只取第一段。
 */
export function matchExpected(expected: string, results: HashResults): HashMatch {
  const value = normalizeHash(expected).split(/\s+/)[0] ?? ''
  if (value === '') return { status: 'empty' }
  if (!/^[0-9a-f]+$/.test(value)) return { status: 'invalid', message: '期望值只能包含 0-9 和 a-f' }
  const algorithm = HASH_ALGORITHMS.find((name) => HASH_HEX_LENGTH[name] === value.length)
  if (!algorithm) {
    return { status: 'invalid', message: `长度 ${value.length} 位对不上任何算法（MD5 32 位、SHA-1 40 位、SHA-256 64 位、SHA-512 128 位），可能复制少了` }
  }
  return results[algorithm] === value ? { status: 'match', algorithm } : { status: 'mismatch', algorithm }
}
