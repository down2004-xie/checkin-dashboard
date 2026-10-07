import type { CheckInData, DateKey, Site, Todo } from '../types'

/**
 * 所有写操作的纯函数实现。
 *
 * 为什么收在这里而不是散在 hook 里：
 * 1. 纯函数可以直接单测，hook 不行（要 render）
 * 2. 每个分支（toggled / siteAdded / …）的边界条件写完后不会因为 React 重渲染逻辑被改坏
 * 3. 将来加操作（如「一键全签」）只是多加一个 action type，不影响 UI 层
 *
 * 核心原则：**任何操作都不变异入参**，每次都返回新的 CheckInData 对象，
 * React 靠引用变化判断要不要重渲染。
 */

export type CheckInAction =
  | { type: 'toggled'; day: DateKey; siteId: string }
  | { type: 'siteAdded'; site: Site }
  | { type: 'sitesAdded'; sites: Site[] }
  | { type: 'siteUpdated'; id: string; patch: Partial<Site> }
  | { type: 'siteRemoved'; id: string }
  | { type: 'todoAdded'; day: DateKey; todo: Todo }
  | { type: 'todoToggled'; day: DateKey; id: string }
  | { type: 'todoRemoved'; day: DateKey; id: string }
  | { type: 'replaced'; data: CheckInData }

export function applyAction(data: CheckInData, action: CheckInAction): CheckInData {
  switch (action.type) {
    case 'toggled':
      return handleToggle(data, action.day, action.siteId)
    case 'siteAdded':
      return handleSiteAdded(data, action.site)
    case 'sitesAdded':
      return handleSitesAdded(data, action.sites)
    case 'siteUpdated':
      return handleSiteUpdated(data, action.id, action.patch)
    case 'siteRemoved':
      return handleSiteRemoved(data, action.id)
    case 'todoAdded':
      return handleTodoAdded(data, action.day, action.todo)
    case 'todoToggled':
      return handleTodoToggled(data, action.day, action.id)
    case 'todoRemoved':
      return handleTodoRemoved(data, action.day, action.id)
    case 'replaced':
      return action.data
  }
}

/* ======================== 各 action 的纯函数实现 ======================== */

function handleToggle(data: CheckInData, day: DateKey, siteId: string): CheckInData {
  const ids = data.records[day] ?? []
  const nextIds = ids.includes(siteId)
    ? ids.filter((id) => id !== siteId)
    : [...ids, siteId]

  const records = { ...data.records }
  if (nextIds.length === 0) {
    // 当天全部取消勾选后删掉这个 key，保持存储干净
    delete records[day]
  } else {
    records[day] = nextIds
  }

  return { ...data, records }
}

function handleSiteAdded(data: CheckInData, site: Site): CheckInData {
  // 幂等：同 id 的站点已经存在就不加
  if (data.sites.some((s) => s.id === site.id)) return data
  return { ...data, sites: [...data.sites, site] }
}

/**
 * 批量新增（书签导入用）。
 *
 * 为什么不复用 handleSiteAdded 循环调用：
 * 循环 dispatch 会触发 N 次状态更新，而且「本次批次内部去重」这件事
 * 循环里做不了 —— 每条的 id 都是拿当时的状态算的，必须一次算完。
 *
 * 去重口径和 siteAdded 一致：同 id 已存在就跳过。但这里额外要把
 * **本批次内已加入的 id 也计入**，否则一批里两个同 id 的站点会双双写入。
 */
function handleSitesAdded(data: CheckInData, incoming: Site[]): CheckInData {
  const ids = new Set(data.sites.map((s) => s.id))
  const added: Site[] = []

  for (const site of incoming) {
    if (ids.has(site.id)) continue
    ids.add(site.id)
    added.push(site)
  }

  if (added.length === 0) return data // 无变化，原样返回，React 靠引用判断要不要重渲染
  return { ...data, sites: [...data.sites, ...added] }
}

function handleSiteUpdated(
  data: CheckInData,
  id: string,
  patch: Partial<Site>,
): CheckInData {
  const idx = data.sites.findIndex((s) => s.id === id)
  if (idx === -1) return data

  // id 字段禁止通过 patch 修改 —— 改了会丢掉这个站的全部历史
  const { id: _dropped, ...safePatch } = patch

  const sites = [...data.sites]
  sites[idx] = { ...sites[idx], ...safePatch }

  return { ...data, sites }
}

function handleSiteRemoved(data: CheckInData, id: string): CheckInData {
  const sites = data.sites.filter((s) => s.id !== id)
  if (sites.length === data.sites.length) return data // 没找到，无变化

  // 记录保留不动（孤儿记录不删，用户哪天加回同 id 的站点历史还在）
  return { ...data, sites }
}

/* ---- 待办 ---- */

/**
 * 三条待办操作都**不改站点、不碰 records**，只动 todos 这一天。
 * 待办和签到是两条平行的数据线，互不影响（见 types.ts 里的说明）。
 */

function handleTodoAdded(data: CheckInData, day: DateKey, todo: Todo): CheckInData {
  const items = data.todos[day] ?? []
  return { ...data, todos: { ...data.todos, [day]: [...items, todo] } }
}

function handleTodoToggled(data: CheckInData, day: DateKey, id: string): CheckInData {
  const items = data.todos[day]
  if (items === undefined) return data // 这天本来就没有待办

  const idx = items.findIndex((t) => t.id === id)
  if (idx === -1) return data // 没找到，无变化，原样返回

  // 不可变：复制数组、只替换命中的那一条，其余引用不变
  const next = [...items]
  next[idx] = { ...next[idx], done: !next[idx].done }

  return { ...data, todos: { ...data.todos, [day]: next } }
}

function handleTodoRemoved(data: CheckInData, day: DateKey, id: string): CheckInData {
  const items = data.todos[day]
  if (items === undefined) return data

  const next = items.filter((t) => t.id !== id)
  if (next.length === items.length) return data // 没找到，无变化

  const todos = { ...data.todos }
  if (next.length === 0) {
    // 这天删空了就删掉这个 key，和 handleToggle 对 records 的处理一致，
    // 免得存储里留下一堆 { '2026-10-07': [] } 这样的空壳
    delete todos[day]
  } else {
    todos[day] = next
  }

  return { ...data, todos }
}