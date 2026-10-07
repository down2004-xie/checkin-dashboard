import type { CheckInData, DateKey, Site, Todo } from '../types'
import { DATA_VERSION } from '../types'
import { LEGACY_SEED_IDS, SITES } from '../data/sites'
import { isSafeHttpUrl, siteIdFromUrl } from './site-form'

/**
 * 版本迁移 + 校验的唯一入口。
 *
 * 为什么收在这里而不是 storage.ts：
 * 本机读取（storage.ts）和备份导入（backup.ts）面对的是同一种不可信输入
 * —— 可能是旧版本格式、可能是手改坏的的数据。两处各写一份校验
 * 迟早会漂移，必须收敛到同一条链上。
 *
 * 所有函数都不抛异常：坏数据就地归一化，页面照常能开。
 */

/** 校验 records：只保留「值是数组、且过滤后有字符串 id」的条目 */
export function sanitizeRecords(raw: unknown): Record<DateKey, string[]> {
  if (typeof raw !== 'object' || raw === null) return {}

  const records: Record<DateKey, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue
    const ids = value.filter((id): id is string => typeof id === 'string')
    // 空数组没有意义，删掉这个天 key 保持存储干净
    if (ids.length > 0) records[key] = ids
  }
  return records
}

/**
 * 校验 sites。
 *
 * 关键取舍：raw 是数组（哪怕是坏数组）说明用户维护过站点清单，
 * 过滤后即使为 [] 也返回 []（用户是故意删空的）；
 * raw 缺失或类型不对才播种默认站点 —— 这是对 v1 数据的「无字段」语义。
 */
export function sanitizeSites(raw: unknown): Site[] {
  if (!Array.isArray(raw)) return [...SITES]

  const sites: Site[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const site = item as Partial<Site>
    if (
      typeof site.id !== 'string' ||
      typeof site.name !== 'string' ||
      typeof site.url !== 'string' ||
      // 光判断类型不够：`"javascript:alert(1)"` 是合法字符串，会一路走到
      // <a href> 上被点击执行。备份文件是**外部输入**（别人给的 JSON），
      // localStorage 也可能被手改，所以这里必须再卡一道协议白名单。
      // 不安全的整条丢弃 —— 和上面几项的 continue 一致。
      // 丢弃不会丢历史：records 里的记录会变成孤儿记录（刻意保留的），
      // 用户重新添加同域名站点时能接回来。
      !isSafeHttpUrl(site.url)
    ) {
      continue
    }
    sites.push(
      typeof site.category === 'string'
        ? { id: site.id, name: site.name, url: site.url, category: site.category }
        : { id: site.id, name: site.name, url: site.url },
    )
  }
  return sites
}

/** 空数据，作为一切异常情况的兜底。每次返回新对象，防止调用方互相污染。 */
export function emptyData(): CheckInData {
  return { version: DATA_VERSION, sites: [...SITES], records: {}, todos: {} }
}

/**
 * 校验 todos。
 *
 * 和 sanitizeRecords 是同一套思路（非对象→{}，非数组的条目丢弃，
 * 空数组不留 key），但多了一层：**每条待办本身也逐字段校验**。
 * records 里存的是字符串，最多判断个 typeof；todos 里是对象，
 * 手改坏数据、旧版本残留都可能塞进缺字段的半成品。
 *
 * 一个刻意的宽容：id / text 缺失或类型不对时**整条丢弃**
 * （没有内容或没有身份，这条待办没法用），但 `done` 缺失或类型不对时
 * 只按 `false` 处理，**不丢整条** —— 待办的正文比勾选状态值钱，
 * 宁可把一个勾过的待办显示成没勾，也不能把用户写下的字弄丢。
 */
export function sanitizeTodos(raw: unknown): Record<DateKey, Todo[]> {
  if (typeof raw !== 'object' || raw === null) return {}

  const todos: Record<DateKey, Todo[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue

    const items: Todo[] = []
    for (const item of value) {
      if (typeof item !== 'object' || item === null) continue
      const todo = item as Partial<Todo>
      if (typeof todo.id !== 'string' || typeof todo.text !== 'string') continue
      items.push({ id: todo.id, text: todo.text, done: todo.done === true })
    }

    // 空数组没有意义，删掉这个天 key 保持存储干净（和 sanitizeRecords 一致）
    if (items.length > 0) todos[key] = items
  }
  return todos
}

/**
 * 还原 v2 时代的种子站点（id 还是「名字派生」那套）。
 *
 * 只给 v1 分支用。v1 数据的 records 里存的是这些旧 id，
 * 播种时必须用旧 id 才能让下一步 v2→v3 的映射表认得它们 ——
 * 直接播种当前 SITES 的话，v1 用户的历史全部映射不到、变成孤儿。
 */
function legacySeedSites(): Site[] {
  return SITES.map((site) => {
    const legacyId = LEGACY_SEED_IDS[site.id]
    return legacyId === undefined ? site : { ...site, id: legacyId }
  })
}

/**
 * v2 → v3：把站点 id 从「名字派生的 slug」重写成「域名派生」，并同步重写 records。
 *
 * 为什么必须连 records 一起改：
 * records 里存的是站点 id。只改 sites 不改 records，所有历史记录立刻变成
 * 指向不存在站点的孤儿 —— 看起来页面正常，实际连续天数全部归零。
 *
 * 为什么用「先建完整映射表、再统一重写」而不是边遍历边改：
 * 新旧 id 存在交叉的可能（某个站的旧 id 恰好等于另一个站的新 id），
 * 边改边写会读到已经改写过的值。全量映射是一次性快照，不受顺序影响。
 */
function rekeySitesToDomains(
  sites: Site[],
  records: Record<DateKey, string[]>,
): { sites: Site[]; records: Record<DateKey, string[]> } {
  /** 旧 id → 新 id */
  const idMap = new Map<string, string>()
  const nextSites: Site[] = []
  const seenIds = new Set<string>()

  for (const site of sites) {
    // url 解析不出来就保留原 id：没有域名就算不出新身份，
    // 硬编一个只会让这个站的历史对不上号
    const newId = siteIdFromUrl(site.url) ?? site.id

    // 每条都要记进映射表，**包括下面会被丢弃的重复站点** ——
    // 重写 records 时靠它把重复站点的历史并到保留者名下，一天都不丢
    idMap.set(site.id, newId)

    // 同域名的重复定义（比如用户手动加过两次 jd.com）：只保留先出现的那个
    if (seenIds.has(newId)) continue
    seenIds.add(newId)

    nextSites.push(site.id === newId ? site : { ...site, id: newId })
  }

  const nextRecords: Record<DateKey, string[]> = {}
  for (const [day, ids] of Object.entries(records)) {
    // 用 Set 求并集：两个站点塌成同一个 id 时，它们同一天的记录会合并；
    // 同一天重复签到同一个人也自动去重
    const merged = new Set<string>()
    for (const oldId of ids) {
      // 映射不到的是「已删站点的孤儿记录」：迁移时已经拿不到它的 url，
      // 算不出域名，只能原样留着。（真正清理留给 v3 的「清理孤儿记录」按钮）
      merged.add(idMap.get(oldId) ?? oldId)
    }
    nextRecords[day] = Array.from(merged)
  }

  return { sites: nextSites, records: nextRecords }
}

/**
 * 把任意输入迁移/修复成当前版本的 CheckInData。
 *
 * 不抛异常：所有识别不了的情况都退回 emptyData()，
 * 宁可丢数据也不能让坏数据进入渲染流程。
 */
export function migrate(raw: unknown): CheckInData {
  if (typeof raw !== 'object' || raw === null) return emptyData()

  const candidate = raw as Partial<CheckInData>

  // version 是迁移的分支依据，缺失就无法判断来源格式。
  // 只接受 1..DATA_VERSION 的整数：比当前新的版本不敢贸然解读，
  // 0、负数、小数说明数据本身已经坏了。
  //
  // 先存成局部常量再校验：`Number.isInteger` 不是类型守卫，
  // 直接写在 if 里不会把 `number | undefined` 收窄成 `number`。
  const rawVersion = candidate.version
  if (
    typeof rawVersion !== 'number' ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 1 ||
    rawVersion > DATA_VERSION
  ) {
    return emptyData()
  }

  // 版本梯子：每档只升一级，顺序往下走。
  // 写成链而不是「v1 直接跳到最新」，是为了以后加 v4 时
  // 只在末尾插一档，不用回头改前面的分支 —— 也保证升到最新
  // 和中间某一档的迁移逻辑不会各写一份。
  let version: number = rawVersion
  let sites: Site[]
  let records: Record<DateKey, string[]>

  if (version === 1) {
    // v1 没有 sites 字段，播种默认站点。
    // 注意用的是「v2 当时那套旧 id」，不是当前的 SITES ——
    // 这样下面 v2→v3 重写时才能把里 records 里的旧 id 认出来并映射过去。
    sites = legacySeedSites()
    records = sanitizeRecords(candidate.records)
    version = 2
  } else {
    sites = sanitizeSites(candidate.sites)
    records = sanitizeRecords(candidate.records)
  }

  if (version === 2) {
    const rekeyed = rekeySitesToDomains(sites, records)
    sites = rekeyed.sites
    records = rekeyed.records
    version = 3
  }

  // v3 → v4：新增 todos 字段。
  //
  // 这是整个梯子里最轻的一档 —— 它只**加字段**，不改动 sites / records 的
  // 任何语义，所以不需要像 v2→v3 那样重写历史。老数据没有 todos，
  // sanitizeTodos 会把 undefined 归一化成 {}，含义就是「这天还没有待办」。
  //
  // 刻意**不**写成 `if (version === 3)` 分支：那样会让人误以为只有 v3 数据
  // 才需要这一步，而实际上 v1 / v2 数据升级后同样要补上这个字段。
  // 同一句话对所有版本都成立，就在最后统一兜底，不放进版本梯子里。
  const todos = sanitizeTodos(candidate.todos)

  return { version: DATA_VERSION, sites, records, todos }
}
