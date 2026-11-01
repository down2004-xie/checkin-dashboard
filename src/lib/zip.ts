/* 最小 ZIP 打包（store 模式，不压缩）—— 纯函数，可单测。
 *
 * 为什么手写：工具箱里「多文件下载」（九宫格 9 张、PDF 转图片 N 页、docx 本身）
 * 都需要打包。连续触发 N 次 a.click() 会被浏览器当成骚扰拦截（Chrome 弹「允许多个下载」，
 * Safari / 移动端常常只下第一个）。和手写 PDF 同一个思路：格式规范公开、结构简单。
 *
 * 为什么只做 store 不做 deflate：要打包的大多是 PNG / JPEG，本身已经压缩过，
 * 再 deflate 几乎不变小；docx 里的 XML 很小。省掉压缩算法，代码量少一个数量级。
 *
 * 结构（APPNOTE.TXT 4.3）：每个文件 = 本地文件头 + 原始数据；末尾是中央目录 + 目录结束记录。
 * 所有多字节整数都是小端序。文件名用 UTF-8，并置通用标志位 bit 11 告诉解压软件。
 */

export interface ZipEntry {
  /** 包内路径，用 / 分隔，如 "word/document.xml" */
  name: string
  data: Uint8Array
}

/** CRC32 查表（多项式 0xEDB88320，ZIP / PNG 通用的那一个） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** 把 Date 编成 DOS 时间/日期（ZIP 头里的修改时间字段，精度 2 秒，1980 年起） */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** 同一个包里不能有重名文件：重名时在扩展名前追加 (2)、(3)… */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((name) => {
    if (!used.has(name)) { used.add(name); return name }
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let n = 2
    while (used.has(`${base} (${n})${ext}`)) n++
    const next = `${base} (${n})${ext}`
    used.add(next)
    return next
  })
}

/**
 * 打包成 ZIP 字节。`now` 可注入，便于单测得到确定的输出。
 * 限制：不支持 ZIP64，单文件和总大小都必须小于 4 GB（浏览器里也装不下那么大的数组）。
 */
export function createZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const names = uniqueNames(entries.map((entry) => entry.name))
  const prepared = entries.map((entry, index) => ({
    name: encoder.encode(names[index]),
    data: entry.data,
    crc: crc32(entry.data),
  }))

  const localSize = prepared.reduce((sum, item) => sum + 30 + item.name.length + item.data.length, 0)
  const centralSize = prepared.reduce((sum, item) => sum + 46 + item.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let offset = 0
  const offsets: number[] = []

  for (const item of prepared) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true) // 本地文件头签名
    view.setUint16(offset + 4, 20, true) // 解压所需版本 2.0
    view.setUint16(offset + 6, 0x0800, true) // bit 11：文件名是 UTF-8
    view.setUint16(offset + 8, 0, true) // 压缩方法 0 = store
    view.setUint16(offset + 10, time, true)
    view.setUint16(offset + 12, date, true)
    view.setUint32(offset + 14, item.crc, true)
    view.setUint32(offset + 18, item.data.length, true) // 压缩后大小
    view.setUint32(offset + 22, item.data.length, true) // 原始大小
    view.setUint16(offset + 26, item.name.length, true)
    view.setUint16(offset + 28, 0, true) // 扩展字段长度
    out.set(item.name, offset + 30)
    out.set(item.data, offset + 30 + item.name.length)
    offset += 30 + item.name.length + item.data.length
  }

  const centralStart = offset
  prepared.forEach((item, index) => {
    view.setUint32(offset, 0x02014b50, true) // 中央目录签名
    view.setUint16(offset + 4, 20, true) // 创建版本
    view.setUint16(offset + 6, 20, true) // 解压所需版本
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint16(offset + 12, time, true)
    view.setUint16(offset + 14, date, true)
    view.setUint32(offset + 16, item.crc, true)
    view.setUint32(offset + 20, item.data.length, true)
    view.setUint32(offset + 24, item.data.length, true)
    view.setUint16(offset + 28, item.name.length, true)
    // 30 扩展字段长度、32 注释长度、34 磁盘号、36 内部属性、38 外部属性：全 0
    view.setUint32(offset + 42, offsets[index], true) // 本地文件头偏移
    out.set(item.name, offset + 46)
    offset += 46 + item.name.length
  })

  view.setUint32(offset, 0x06054b50, true) // 目录结束记录签名
  view.setUint16(offset + 8, prepared.length, true) // 本磁盘条目数
  view.setUint16(offset + 10, prepared.length, true) // 总条目数
  view.setUint32(offset + 12, offset - centralStart, true) // 中央目录大小
  view.setUint32(offset + 16, centralStart, true) // 中央目录偏移
  return out
}
