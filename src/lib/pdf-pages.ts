/* PDF 页码相关的纯函数 —— 页码范围解析、导出文件名、DPI 换算。可单测。
 *
 * 为什么单独一个文件：「PDF 转图片」要解析用户输入的页码范围，
 * 「PDF 提取文字」要把没有文字层的页列给用户看，两者都是页码 ↔ 文本的换算，
 * 和 pdf.js 无关，放在一起好测。
 */

export type PageRangeResult =
  | { ok: true; pages: number[] }
  | { ok: false; error: string }

/** 分隔符：英文逗号、中文逗号、顿号、空格都当分隔（用户从聊天里复制来的范围常带中文标点） */
const SEPARATOR_RE = /[,，、\s]+/
/** 区间连字符：- 和中文输入法常打出的 –、—、～、~ */
const RANGE_RE = /^(\d+)\s*[-–—~～]\s*(\d+)$/

/**
 * 解析「1-3,5」这样的页码范围，返回升序去重后的页码（从 1 开始）。
 * 规则刻意严格：写错的范围直接报错、不猜。猜错了用户导出的是另一批页，还以为是对的。
 * - 页码越界（< 1 或 > total）→ 报错并指出是哪一段
 * - 倒序区间（5-3）→ 报错（大概率是手误，自动翻转会掩盖它）
 * - 重复（1-3,2）→ 去重，不报错（结果唯一，没有歧义）
 */
export function parsePageRange(input: string, total: number): PageRangeResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, error: '请输入页码，例如 1-3,5' }
  const pages = new Set<number>()
  for (const token of trimmed.split(SEPARATOR_RE)) {
    if (token === '') continue
    const range = RANGE_RE.exec(token)
    let from: number
    let to: number
    if (range) {
      from = Number(range[1])
      to = Number(range[2])
    } else if (/^\d+$/.test(token)) {
      from = Number(token)
      to = from
    } else {
      return { ok: false, error: `看不懂「${token}」，请用 1-3,5 这样的格式` }
    }
    if (from > to) return { ok: false, error: `「${token}」是倒序的，请写成 ${to}-${from}` }
    if (from < 1 || to > total) return { ok: false, error: `「${token}」超出范围，这份 PDF 只有 ${total} 页` }
    for (let page = from; page <= to; page++) pages.add(page)
  }
  if (pages.size === 0) return { ok: false, error: '请输入页码，例如 1-3,5' }
  return { ok: true, pages: [...pages].sort((a, b) => a - b) }
}

/** 1..total 的全部页码 */
export function allPages(total: number): number[] {
  return Array.from({ length: Math.max(0, total) }, (_, index) => index + 1)
}

/**
 * 把页码列表压成人读的范围文本：[1,2,3,5,7,8] → "1-3、5、7-8"。
 * 用于「第 N 页没有文字层」这类提示，几十页挨个列出来没人看得完。
 */
export function formatPageList(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = -1
  let prev = -1
  for (const page of sorted) {
    if (page === prev + 1) { prev = page; continue }
    if (start !== -1) parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = page
    prev = page
  }
  if (start !== -1) parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return parts.join('、')
}

/** 去掉 .pdf 扩展名（不区分大小写）；剩下空串时退回 "document" */
export function pdfBaseName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').trim()
  return base === '' ? 'document' : base
}

/**
 * 导出文件名：`<原名>-p01.png`。页码按总页数补零（至少两位），
 * 这样解压后在文件管理器里按名字排序就是页序（不补零会排成 p1、p10、p2）。
 */
export function pageFileName(base: string, page: number, total: number, ext: string): string {
  const width = Math.max(2, String(total).length)
  return `${base}-p${String(page).padStart(width, '0')}.${ext}`
}

/** PDF 的用户空间单位是 1/72 英寸，所以按 DPI 渲染时 scale = dpi / 72 */
export function dpiToScale(dpi: number): number {
  return dpi / 72
}

/** 超过这个页数时提示「耗时和内存」：每页一张全尺寸位图，几百页在手机上会撑爆内存 */
export const MANY_PAGES_THRESHOLD = 200
