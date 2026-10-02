/**
 * 站点表单的纯逻辑：URL 校验 + 站点身份（id）生成。
 *
 * 为什么抽成纯函数：
 * 「页面内增删站点」的表单里，最容易写出 bug 的两处就是
 * id 撞车和 URL 不合法。这些规则放组件里没法测，放这里能逐条单测。
 */

/**
 * 把字符串转成小写连字符 slug。
 * 只保留 ASCII 字母和数字，其余字符（含中文、空格）转成连字符并折叠。
 * 纯中文名会得到空串。
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 连续的非法字符折叠成一个连字符
    .replace(/^-+|-+$/g, '') // 去掉首尾连字符
}

/**
 * 把用户输入的网址解析成 URL 对象，缺协议就补 https://。
 *
 * 为什么抽出来：`normalizeUrl` 和 `siteHost` 必须对「什么算合法网址」
 * 用**同一套判断**。分开写的结果是 normalizeUrl('not-a-url') 补上协议后
 * 接受了它，而 siteHost 却判它非法 —— 同一个模块两套标准，
 * 表现就是「能存进去但算不出身份」这种自相矛盾的行为。
 *
 * 为什么用 `new URL` 而不是正则：
 * URL 的合法形态太多（端口、路径、query、中文域名），
 * 手写正则几乎必然漏。浏览器内置的 URL 解析器才是权威。
 */
function parseUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    return new URL(withProtocol)
  } catch {
    return null
  }
}

/**
 * 校验并规范化 URL。
 *
 * 返回 null 表示不合法。
 * 合法但缺协议（如「bilibili.com」）会自动补上 https://。
 */
export function normalizeUrl(input: string): string | null {
  const url = parseUrl(input)
  if (url === null) return null

  // 协议只允许 http / https，避免 javascript: 之类
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.href
}

/**
 * 一个 URL 字符串能否**原样**放进 `<a href>` —— 只看字面量协议。
 *
 * ## 为什么不能写成 `normalizeUrl(input) !== null`
 *
 * 因为它检查的是「改写后的结果」，而调用方要判断的是「原值」。
 * 两者会分叉，反例是 `javascript:1234`（注意不带 `//`）：
 *
 *   1. `parseUrl` 的补协议正则要求 `://`，这里不匹配 → 补成 `https://javascript:1234`
 *   2. `new URL('https://javascript:1234')` 解析成功（host=`javascript`、port=`1234`）
 *   3. 协议是 `https:` → `normalizeUrl` 放行，返回 `https://javascript:1234/`
 *
 * 返回值本身是安全的，**但原值 `javascript:1234` 仍是可执行的 javascript: URL**。
 * 校验层如果只判断、不改写（`sanitizeSites` 就是如此），放行的就是危险值。
 *
 * 所以这里用字面量白名单，不经过 `new URL` 的协议推断。
 *
 * ## 为什么拒绝无协议的输入
 *
 * `jd.com` 也会被拒。这是刻意的：表单（`SiteForm`）和书签导入都已经用
 * `normalizeUrl` 补过协议，能进到存储层的值必然带协议。
 * 严格一点只会滤掉被手改坏的数据，不会误伤正常路径。
 */
export function isSafeHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim())
}

/**
 * 取 URL 的规范域名，作为站点的身份。
 *
 * 会去掉开头的 `www.`：`www.jd.com` 和 `jd.com` 是同一个站的两种写法，
 * 不归一化的话它们会被当成两个站，各记一份签到历史。
 *
 * 解析失败返回 null。调用方必须处理 —— 别把 null 当成空字符串往下传。
 * （注意「解析失败」只指语法上不成 URL，比如空串、`https://` 没有主机名；
 *  `not-a-url` 这种在 URL 标准里是合法主机名，和 normalizeUrl 的判断一致。）
 */
export function siteHost(url: string): string | null {
  const parsed = parseUrl(url)
  if (parsed === null) return null

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  return host === '' ? null : host
}

/**
 * 站点身份 id —— 由 URL 的域名派生，`https://www.jd.com` → `jd-com`。
 *
 * ## 为什么身份是域名而不是名字
 *
 * v2 用的是「名字派生的 slug」，这条路对中文名是坏的：
 * `slugify('淘宝')` 是空串，于是退回 `site-N` 分支，
 * 而 N 是「当前最小的没被占用的号」—— 它取决于**删除那一刻谁还占着号**，
 * 跟这个站本身毫无关系。实测：京东在时淘宝是 `site-2`，
 * 删掉京东后淘宝重新添加会变成 `site-1`，历史记录留在 `site-2` 里变孤儿。
 *
 * 域名派生之后，同一个站必然算出同一个 id，于是：
 * 1. 删掉再添加 → 拿回同一个 id → 历史自动接上
 * 2. id 撞车 == 域名重复，不需要 `-2` 后缀那套编号逻辑
 * 3. 手动添加和书签导入这两条路终于收敛到同一个身份
 *
 * ## 为什么连路径一起丢掉
 *
 * `jd.com/index.html` 和 `jd.com` 是同一个站。
 * 每日签到是按站点的，路径差异不该产生两张卡片。
 *
 * ## 代价
 *
 * 同一个域名只能有一张卡片 —— 没法把 `bilibili.com` 和
 * `bilibili.com/anime` 当两个独立签到项。这是刻意的取舍：
 * 对「每日签到看板」来说，一个站就是一张卡。
 *
 * 解析失败返回 null（调用方用它区分「URL 不合法」）。
 */
export function siteIdFromUrl(url: string): string | null {
  const host = siteHost(url)
  if (host === null) return null

  const slug = slugify(host)
  // 域名理论上能全被 slugify 吃掉（比如纯中文域名没被转成 punycode 时），
  // 真发生就退回原串，至少保证 id 非空
  return slug === '' ? host : slug
}
