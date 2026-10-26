import type { CheckInData, DateKey, Preferences, Site, Todo } from '../types'
import { DATA_VERSION, DEFAULT_PREFERENCES } from '../types'
import { isDateKey } from './date'
import { LEGACY_SEED_IDS, SITES } from '../data/sites'
import { isSafeHttpUrl, siteHost, siteIdFromUrl } from './site-form'

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

/** records 里一个条目本身是否可用：非空字符串。「重复」不算不可用。 */
function isRecordId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 一个站点条目本身是否可用（不看是否重复）。
 *
 * 抽成独立判断是为了让 `sanitizeSites` 和 `droppedEntries` 共用同一把尺子 ——
 * 两处各写一份校验必然漂移，那正是 MY-ISSUES #7 的教训。
 */
function isUsableSite(item: unknown): item is Site {
  if (typeof item !== 'object' || item === null) return false
  const site = item as Partial<Site>
  return (
    typeof site.id === 'string' && typeof site.name === 'string' && typeof site.url === 'string' &&
    site.id.trim() !== '' && site.name.trim() !== '' &&
    // 光判断类型不够：`"javascript:alert(1)"` 是合法字符串，会一路走到
    // <a href> 上被点击执行。备份文件是**外部输入**（别人给的 JSON），
    // localStorage 也可能被手改，所以这里必须再卡一道协议白名单。
    isSafeHttpUrl(site.url)
  )
}

/** 校验 records：只保留「值是数组、且过滤后有字符串 id」的条目 */
export function sanitizeRecords(raw: unknown): Record<DateKey, string[]> {
  if (typeof raw !== 'object' || raw === null) return {}

  const records: Record<DateKey, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isDateKey(key) || !Array.isArray(value)) continue
    const ids = [...new Set(value.filter(isRecordId))]
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
 *
 * 这里**不重算 id**（不调 `siteIdFromUrl`）：id 是历史记录的锚，
 * 重算等于悄悄改写用户的历史。所以它只判「条目能不能用」和「id 是否重复」。
 *
 * **同域名不同 id 的重复不在这一层处理**，见 `dedupeSitesByHost` ——
 * 原因很具体：v2 数据必须让 `rekeySitesToDomains` 看到全部重复项，
 * 才能把两个 id 的历史**合并**到保留者名下。在这里提前丢掉一个，
 * 它的记录就变成孤儿，静默少一天签到（`migrate.test.ts` 的
 * 「塌陷时同一天的记录合并去重」就是守着这条）。
 */
export function sanitizeSites(raw: unknown): Site[] {
  if (!Array.isArray(raw)) return [...SITES]

  const sites: Site[] = []
  const seenIds = new Set<string>()
  for (const item of raw) {
    if (!isUsableSite(item) || seenIds.has(item.id)) continue
    seenIds.add(item.id)
    sites.push({
      id: item.id, name: item.name, url: item.url,
      ...(typeof item.category === 'string' ? { category: item.category } : {}),
      ...(typeof item.paused === 'boolean' ? { paused: item.paused } : {}),
      ...(typeof item.pinned === 'boolean' ? { pinned: item.pinned } : {}),
    })
  }
  return sites
}

/**
 * 把「同一个域名、不同 id」的站点塌成一个（保留先出现的）。
 *
 * ## 为什么需要它
 *
 * 全项目的身份铁律是「`site.id` 由域名派生」，所以「id 相同」和「域名相同」
 * 本该是同一件事。但 `sanitizeSites` 面对的是**外部输入** ——
 * 手改的 localStorage、别人给的备份 JSON。一份
 * `{id:'a', url:'https://jd.com'}` + `{id:'b', url:'https://www.jd.com'}`
 * 能双双通过 id 去重，于是「一个域名只能有一张卡片」被绕过，
 * 同一个站出现两张卡、各记一份历史。**id 可以被人为造出来，域名不会。**
 *
 * ## 为什么放在 migrate 的梯子**之后**，不放进 sanitizeSites
 *
 * v2 数据要先经 `rekeySitesToDomains`，它会把重复站点的记录**合并**过来。
 * 在那之前丢掉一个，它的历史就变成孤儿、静默少一天签到。
 * 梯子跑完时 sites 的 id 已经全是域名形态，这时的同域重复只可能是坏输入，
 * 丢掉一个、让它记成孤儿（刻意保留、加回同域名可恢复）是可以接受的。
 */
export function dedupeSitesByHost(sites: Site[]): Site[] {
  const seenHosts = new Set<string>()
  const kept: Site[] = []
  for (const site of sites) {
    // 算不出域名（如 'https://' 这种缺 host 的）就没法判重，只能放行：
    // 硬编一个身份只会让历史对不上号（同一个理由见 rekeySitesToDomains）
    const host = siteHost(site.url)
    if (host !== null && seenHosts.has(host)) continue
    if (host !== null) seenHosts.add(host)
    kept.push(site)
  }
  return kept
}

/** 空数据，作为一切异常情况的兜底。每次返回新对象，防止调用方互相污染。 */
export function emptyData(): CheckInData {
  return { version: DATA_VERSION, sites: [...SITES], records: {}, todos: {}, targets: {}, preferences: { ...DEFAULT_PREFERENCES } }
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
    if (!isDateKey(key) || !Array.isArray(value)) continue

    const items: Todo[] = []
    const seenIds = new Set<string>()
    for (const item of value) {
      if (typeof item !== 'object' || item === null) continue
      const todo = item as Partial<Todo>
      if (typeof todo.id !== 'string' || typeof todo.text !== 'string') continue
      if (!todo.id.trim() || !todo.text.trim() || seenIds.has(todo.id)) continue
      seenIds.add(todo.id)
      items.push({ id: todo.id, text: todo.text, done: todo.done === true,
        ...(typeof todo.carriedFrom === 'string' && isDateKey(todo.carriedFrom) ? { carriedFrom: todo.carriedFrom } : {}),
      })
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

  const targets: CheckInData['targets'] = {}
  if (isObject(candidate.targets)) {
    for (const [day, snapshot] of Object.entries(candidate.targets)) {
      // 目标快照是**每天的展示用副本**，不是身份来源，所以这里可以安全地按域名去重；
      // 而 sites 主列表要等梯子跑完（v2 的重复项还得靠 rekeySitesToDomains 合并记录）
      if (isDateKey(day) && Array.isArray(snapshot)) targets[day] = dedupeSitesByHost(sanitizeSites(snapshot))
    }
  }
  return { version: DATA_VERSION, sites: dedupeSitesByHost(sites), records, todos, targets, preferences: sanitizePreferences(candidate.preferences) }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 从候选值里挑出合法的偏好选项。
 *
 * 为什么必须先 `typeof` 再 `includes`：
 * `String(['auto'])` 恰好是 `'auto'`，所以「用 String 包一层再 includes」
 * 会让**数组**通过校验，而返回值仍是数组本身。类型断言 `as` 只让编译器
 * 闭嘴，运行时不做任何转换 —— 于是 `preferences.theme` 变成 `['auto']`，
 * 下游 `PALETTES[theme]` 取到 undefined，`palette.bg1` 直接抛异常，
 * **整页白屏，且用户没法在界面里修**（设置面板此刻也读不出合法值）。
 * 先 typeof 收窄成 string，判断和返回值就是同一个东西了。
 */
function pickOption<T extends string>(raw: unknown, options: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (options as readonly string[]).includes(raw) ? raw as T : fallback
}

export function sanitizePreferences(raw: unknown): Preferences {
  if (!isObject(raw)) return { ...DEFAULT_PREFERENCES }
  return {
    theme: pickOption(raw.theme, ['auto', 'dawn', 'day', 'dusk', 'night'] as const, 'auto'),
    effects: pickOption(raw.effects, ['full', 'light', 'static'] as const, 'full'),
    compact: raw.compact === true,
    // v6 新增。老数据没有这个字段 → pickOption 退回默认 'dark'，即升级后外观不变。
    appearance: pickOption(raw.appearance, ['dark', 'light'] as const, 'dark'),
  }
}

export function dataProblem(raw: unknown): string | null {
  if (!isObject(raw)) return '数据内容不是对象'
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) return '数据版本号无效'
  if (raw.version > DATA_VERSION) return '数据来自更新版本，请更新页面，不要重置数据'
  if (!isObject(raw.records)) return '签到记录格式错误'
  if (raw.version >= 2 && !Array.isArray(raw.sites)) return '站点列表格式错误'
  if (raw.version >= 4 && !isObject(raw.todos)) return '待办列表格式错误'
  if (raw.version >= 5 && (!isObject(raw.targets) || !isObject(raw.preferences))) return '目标快照或偏好设置格式错误'
  return null
}

/**
 * 数据里有多少条**真正坏掉、只能丢弃**的条目。
 *
 * 这个数字唯一的用途是决定「要不要进保护模式」（只读、停写）——
 * 而保护模式对用户是很重的代价（整个管理区被禁用），所以判据必须窄：
 * **只数「洗干净之后就没了」的条目，不数「撞车了但内容还在」的条目。**
 *
 * 为什么不能沿用「过滤前后长度差」这种写法：
 * `['a','a']` 这种**重复**既没有损坏、也没有丢失信息（去重后还是那条记录），
 * 旧写法却把它算成「丢弃 1 条」→ 一进页面就锁死，用户只能手动导出、
 * 手改 JSON、再导回。安全修复（把 `javascript:` 站点整条丢掉）会把
 * 已存在的存量脏数据变成这种情况 —— 那是**修复应有的效果**，
 * 不该被当成损坏。
 *
 * 判据因此定成「**单条**是否可用」，和 sanitize 用同一把尺子：
 * - records/todos：非空字符串 / 合法对象且 id、text 非空 → 可用，重复不算
 * - sites/targets：能过 `isUsableSite` → 可用，重复 id 不算
 * - 日期 key 本身不合法（如 `'broken'`）→ 当天整组数不回来，全部计入
 */
export function droppedEntries(raw: unknown): number {
  if (!isObject(raw)) return 0
  let dropped = 0
  const isUsableTodo = (item: unknown): boolean => isObject(item) &&
    typeof item.id === 'string' && item.id.trim() !== '' &&
    typeof item.text === 'string' && item.text.trim() !== ''

  if (Array.isArray(raw.sites)) dropped += raw.sites.filter((item) => !isUsableSite(item)).length

  for (const [field, usable] of [
    ['records', (item: unknown) => isRecordId(item)],
    ['todos', isUsableTodo],
  ] as const) {
    if (!isObject(raw[field])) continue
    for (const [day, entries] of Object.entries(raw[field])) {
      if (!Array.isArray(entries)) { dropped++; continue }
      if (!isDateKey(day)) { dropped += entries.length; continue }
      dropped += entries.filter((item) => !usable(item)).length
    }
  }
  if (isObject(raw.targets)) {
    for (const [day, entries] of Object.entries(raw.targets)) {
      if (!Array.isArray(entries)) { dropped++; continue }
      if (!isDateKey(day)) { dropped += entries.length; continue }
      dropped += entries.filter((item) => !isUsableSite(item)).length
    }
  }
  return dropped
}
