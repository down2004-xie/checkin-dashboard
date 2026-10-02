import type { Site } from '../types'
import { normalizeUrl, siteIdFromUrl } from './site-form'

/**
 * 浏览器书签导入。
 *
 * 为什么走「导出 HTML 文件」而不是直接读书签：
 * 网页读不到浏览器的书签列表，这是浏览器的安全边界 —— 任何页面若能读全部书签，
 * 等于把用户的浏览习惯、内网地址、私人收藏全交出去。只有浏览器扩展有这个权限
 * （`chrome.bookmarks` + manifest 里声明 `bookmarks`）。
 * 所以唯一可行的路径是：用户在浏览器里「导出书签」得到一份 HTML，再喂给页面。
 *
 * 解析目标格式：Netscape Bookmark File，Chrome / Edge / Firefox 导出都是它。
 * 形态是大致的 `<DT><H3>文件夹名</H3><DL><DT><A HREF="...">名字</A>...</DL>`。
 *
 * 这一层为什么拆成两个函数：
 * `parseBookmarks` 依赖 `DOMParser`（浏览器 API），在 Vitest 的 node 环境里不存在，
 * 没法单测；`planImport` 是纯字符串/数组逻辑，可以单测。
 * 把不可测的部分圈到最小，是这里拆分的唯一理由。
 */

/** 解析出的单条书签（还没变成 Site，因为 id 要等确定插入哪些之后才能生成） */
export interface BookmarkEntry {
  name: string
  url: string
}

/** 一个书签文件夹，以及它**直接包含**的书签 */
export interface BookmarkGroup {
  /** 文件夹名。'' 表示「未分类」（书签直接放在根目录下） */
  name: string
  items: BookmarkEntry[]
}

export interface BookmarkParseResult {
  groups: BookmarkGroup[]
  /** 文件里一共有多少条 <A> */
  total: number
  /** 因地址非法被丢弃的条数（javascript: 小工具、chrome:// 内部页、空 href） */
  invalid: number
  /** 因同一文件夹内地址重复被丢弃的条数 */
  duplicated: number
}

/**
 * 这些是浏览器自己造的「根文件夹」，不是用户建的分类。
 *
 * 为什么必须拉黑：Chrome 里直接放在书签栏的书签，父文件夹名就是「书签栏」。
 * 照搬的话每个顶层书签都会被打上一个毫无意义的分类「书签栏」，
 * 筛选 chips 里会冒出一个点不点都一样的按钮。
 */
const ROOT_FOLDER_NAMES = new Set([
  '书签栏',
  '书签工具栏',
  '书签菜单',
  '其他书签',
  '其他收藏夹',
  '收藏夹栏',
  'bookmarks bar',
  'bookmarks toolbar',
  'bookmarks menu',
  'other bookmarks',
  'favorites bar',
  'favorites',
])

/**
 * 解析浏览器导出的书签 HTML。
 *
 * 为什么用 `DOMParser` 解析 `text/html` 而不是 XML 解析器：
 * Netscape 格式是「不合法但浏览器一律容忍」的 HTML（`<DT>` 全是未闭合标签，
 * `<DL><P>` 这种嵌套也不规范）。XML 解析器会直接报错，
 * 而 HTML 解析器本来就是为容错设计的，正好能吃下。
 */
export function parseBookmarks(html: string): BookmarkParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const anchors = Array.from(doc.querySelectorAll('a[href]'))

  // 用 Map 保序：文件夹按在文件里出现的先后排列，用户看到的顺序和浏览器里一致
  const buckets = new Map<string, BookmarkEntry[]>()
  const seenUrls = new Map<string, Set<string>>()
  let invalid = 0
  let duplicated = 0

  for (const anchor of anchors) {
    const normalized = normalizeUrl(anchor.getAttribute('href') ?? '')
    if (normalized === null) {
      // javascript: 书签小工具、chrome:// 内部页都在这里被挡掉
      invalid++
      continue
    }

    const folder = folderNameOf(anchor)

    // 去重按 URL 而不是名字：书签名常被用户改（「京东」→「京东(签到)」），
    // 只有地址是可靠身份。范围限定在同一文件夹内 ——
    // 同一个站出现在两个文件夹里是用户有意的分组，不该在这里合并。
    let urls = seenUrls.get(folder)
    if (urls === undefined) {
      urls = new Set()
      seenUrls.set(folder, urls)
    }
    if (urls.has(normalized)) {
      duplicated++
      continue
    }
    urls.add(normalized)

    const text = (anchor.textContent ?? '').trim()
    const bucket = buckets.get(folder) ?? []
    bucket.push({ name: text === '' ? hostOf(normalized) : text, url: normalized })
    buckets.set(folder, bucket)
  }

  const groups = Array.from(buckets, ([name, items]) => ({ name, items }))
  return { groups, total: anchors.length, invalid, duplicated }
}

/**
 * 找出某个书签所属的文件夹名。
 *
 * 在 HTML 解析器构建出的树里，Netscape 格式会变成这样的嵌套：
 *   <dt><h3>购物</h3><dl><dt><a>京东</a></dt></dl></dt>
 * 也就是「文件夹的 <h3>」和「装书签的 <dl>」都在同一个 <dt> 里。
 * 所以从 <a> 往上找到最近的 <dl>，它的父元素里的 <h3> 就是文件夹名。
 *
 * 只取**直接父文件夹**，不拼全路径：
 * 拼出来是「书签栏/技术/前端」这种长串，会把分类筛选的 chips 撑爆。
 */
function folderNameOf(anchor: Element): string {
  const dl = anchor.closest('dl')
  const dt = dl?.parentElement
  // 用 :scope > h3 只认直接子元素：若往下找，可能命中更深层的子文件夹名
  const h3 = dt?.tagName === 'DT' ? dt.querySelector(':scope > h3') : null
  const raw = (h3?.textContent ?? '').trim()

  if (raw === '') return ''
  return ROOT_FOLDER_NAMES.has(raw.toLowerCase()) ? '' : raw
}

/** 书签没有可见文字时，退回用域名当名字（'https://www.jd.com/' → 'jd.com'） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export interface ImportPlan {
  /** 合并进现有站点后要新增的部分 */
  sites: Site[]
  /** 因为是重复站点（域名已存在）而跳过的条数 */
  duplicate: number
}

/**
 * 把选中的文件夹变成可以写进存储的站点列表。
 *
 * 两件事，顺序不能换：
 * 1. 只处理用户勾选的文件夹
 * 2. 跳过域名已存在的 —— 现有的、以及本次批次内先出现的都要查
 *
 * 去重按**域名**（`siteIdFromUrl` 算出的 id），不按完整 URL，
 * 也不按名字：书签名用户随时会改（「京东」→「京东(签到)」），
 * 而 `www.jd.com`、`jd.com`、`jd.com/index.html` 都是同一个站。
 *
 * 这里曾经需要调用方额外传一个规范化过的地址集合来判重，还有个
 * 「种子站点没结尾斜杠、bookmarks 有」的隐蔽坑（见 MY-ISSUES #5）。
 * 改成域名身份之后整个参数都删掉了：域名相等就是重复，
 * 斜杠和路径的差异被天然吞掉，那类 bug 从根上不存在了。
 */
export function planImport(
  groups: readonly BookmarkGroup[],
  selected: ReadonlySet<string>,
  existingIds: ReadonlySet<string>,
): ImportPlan {
  const ids = new Set(existingIds)
  const sites: Site[] = []
  let duplicate = 0

  for (const group of groups) {
    if (!selected.has(group.name)) continue

    for (const item of group.items) {
      const id = siteIdFromUrl(item.url)
      // id 为 null 说明地址取不到域名。parseBookmarks 已经用 normalizeUrl
      // 过滤过一轮，正常到不了这里，兜一下防止把非法 id 写进存储
      if (id === null || ids.has(id)) {
        duplicate++
        continue
      }
      ids.add(id)

      const site: Site = { id, name: item.name, url: item.url }
      // 分类为空就不带这个字段，和 SiteForm 保持一致，保持存储干净
      if (group.name !== '') site.category = group.name
      sites.push(site)
    }
  }

  return { sites, duplicate }
}
