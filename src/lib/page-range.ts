/* PDF 合并与拆分工具的纯逻辑 —— 纯函数，可单测：页码范围解析、拆分文件名、读取失败提示、列表上移下移。
 * 读写 PDF 本身交给 pdf-lib（只在 PdfMergeSplit 组件里 import）。
 *
 * 输入写法（用户习惯的打印对话框写法）：`1-3, 5, 8-`
 * - 页码从 1 开始（用户看到的页码），返回值也是 1 起始；组件交给 pdf-lib 时自己减 1。
 * - `8-` 表示第 8 页到末页。不支持 `-3`（开头省略）：打印对话框里也少见，
 *   而且 `-3` 容易被读成「负三」，不如让用户写 `1-3`。
 * - 分隔符认半角逗号、全角逗号、顿号；连字符认 - – — ~ 和全角～（中文输入法下常打出来）。
 *
 * 顺序规则：**按输入顺序输出，重复的页只保留第一次出现**。
 * 为什么不排序：`5, 1-3` 写成这样的用户多半就是想让第 5 页排最前（比如把封面挪前面），
 * 排序会悄悄违背他的意图；而重复页（`1-3, 2`）几乎都是手误，保留会让新 PDF 多出一页重复内容。
 *
 * 越界、反向、非法字符一律报错而不是「尽量理解」：拆分结果是要交出去的文件，
 * 悄悄丢掉一段范围比报错更难发现。
 */

export type PageRangeResult =
  | { ok: true; pages: number[] }
  | { ok: false; error: string }

/** 连字符的各种写法统一成 - */
const DASHES = /[–—~～－]/g
/** 段与段之间的分隔符 */
const SEPARATORS = /[,，、]/

/**
 * 把 `1-3, 5, 8-` 解析成页码数组（1 起始，按输入顺序去重）。
 * totalPages 是文档总页数，用来展开 `8-` 和判越界。
 */
export function parsePageRange(input: string, totalPages: number): PageRangeResult {
  if (!Number.isInteger(totalPages) || totalPages < 1) return { ok: false, error: '文档没有可提取的页面' }
  const segments = input.replace(DASHES, '-').split(SEPARATORS).map((part) => part.trim()).filter(Boolean)
  if (segments.length === 0) return { ok: false, error: '请输入页码范围，例如 1-3, 5, 8-' }

  const pages: number[] = []
  const seen = new Set<number>()
  const push = (page: number) => {
    if (seen.has(page)) return
    seen.add(page)
    pages.push(page)
  }

  for (const segment of segments) {
    // 段内允许空格（`1 - 3`），但只能是「数字」「数字-数字」「数字-」三种形状
    const match = /^(\d+)\s*(?:(-)\s*(\d*))?$/.exec(segment)
    if (!match) return { ok: false, error: `「${segment}」看不懂：只能写数字、连字符和逗号，例如 1-3, 5, 8-` }
    const start = Number(match[1])
    const end = match[2] ? (match[3] ? Number(match[3]) : totalPages) : start
    if (start < 1 || end < 1) return { ok: false, error: `「${segment}」无效：页码从 1 开始` }
    if (start > totalPages || end > totalPages) {
      return { ok: false, error: `「${segment}」超出范围：这个 PDF 只有 ${totalPages} 页` }
    }
    if (start > end) return { ok: false, error: `「${segment}」是反向范围，请写成 ${end}-${start}` }
    for (let page = start; page <= end; page++) push(page)
  }
  return { ok: true, pages }
}

/** 去掉 .pdf 扩展名（大小写不敏感），名字为空时退回 document */
export function pdfBaseName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').trim()
  return base || 'document'
}

/**
 * 「每页拆成单独文件」的文件名：`报告-p01.pdf`。
 * 页码按总页数补零，这样解压后在文件管理器里按名字排序就是页序
 * （不补零的话 p10 会排在 p2 前面）。
 */
export function splitPageFileName(fileName: string, page: number, totalPages: number): string {
  const width = String(totalPages).length
  return `${pdfBaseName(fileName)}-p${String(page).padStart(width, '0')}.pdf`
}

/**
 * pdf-lib 读 PDF 失败时的人话提示。
 *
 * 加密判断只能靠**错误文案**，不能用 `instanceof EncryptedPDFError`：pdf-lib 编译到 ES5，
 * 继承 Error 的类在 ES5 下 `super()` 返回的是一个普通 Error 实例，原型链断了，
 * 实测 `e instanceof EncryptedPDFError === false`、`e.constructor.name === 'Error'`。
 * 不用 `ignoreEncryption: true` 硬读：密码保护的 PDF 内容流是加密的，复制出来的页面是乱码或空白。
 */
export function pdfLoadErrorMessage(fileName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/is encrypted/i.test(message)) return `「${fileName}」有密码保护，暂不支持`
  return `「${fileName}」读取失败：文件可能已损坏，或者不是 PDF`
}

/** 把数组里 index 位置的元素和相邻元素对调（上移 -1 / 下移 +1）。越界时原样返回新数组 */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  const next = [...items]
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
