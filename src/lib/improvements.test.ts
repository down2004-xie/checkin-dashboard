import { describe, expect, it } from 'vitest'
import { DATA_VERSION } from '../types'
import { droppedEntries, emptyData, migrate, sanitizePreferences, sanitizeRecords, sanitizeSites, sanitizeTodos } from './migrate'
import { applyAction, snapshotDay } from './reducer'
import { createBackup, mergeData, parseBackup, serializeBackup } from './backup'
import { filterSites, moveNeighbor, type SiteFilters } from './sites'
import { isDateKey } from './date'

const today = '2026-10-12'
const yesterday = '2026-10-11'
const site = { id: 'alpha-com', name: 'Alpha', url: 'https://alpha.com' }
const todo = { id: 'task-1', text: 'Write report', done: false }

describe('version 5 migration and input validation', () => {
  it('migrates v4 without fabricating historical targets', () => {
    const data = migrate({ version: 4, sites: [site], records: { [yesterday]: [site.id] }, todos: { [today]: [todo] } })
    expect(data.version).toBe(DATA_VERSION)
    expect(data.targets).toEqual({})
    expect(data.todos[today]).toEqual([todo])
    expect(data.preferences).toEqual({ theme: 'auto', effects: 'full', compact: false })
    expect(migrate(data)).toEqual(data)
  })

  it.each(['2026-02-30', '2025-02-29', '2026-1-01', '__proto__', 'garbage'])('rejects invalid date %s', (value) => {
    expect(isDateKey(value)).toBe(false)
    expect(sanitizeRecords({ [value]: ['a'] })).toEqual({})
    expect(sanitizeTodos({ [value]: [todo] })).toEqual({})
  })

  it('accepts leap days and removes duplicate identities', () => {
    expect(isDateKey('2024-02-29')).toBe(true)
    expect(sanitizeRecords({ [today]: ['a', 'a', '', 1] })).toEqual({ [today]: ['a'] })
    expect(sanitizeSites([site, site, { ...site, id: '' }])).toEqual([site])
    expect(sanitizeTodos({ [today]: [todo, todo] })).toEqual({ [today]: [todo] })
  })

  it('collapses same-host sites that were smuggled in with different ids', () => {
    // sanitizeSites 是**第四个写站点的入口**（手改的 localStorage、别人给的备份）。
    // 一份 `{id:'a',url:'jd.com'}` + `{id:'b',url:'www.jd.com'}` 能通过 id 去重，
    // 于是「一个域名只能有一张卡片」被绕过，同一个站出现两张卡、各记一份历史。
    const smuggled = migrate({
      version: 5, sites: [
        { id: 'a', name: '京东', url: 'https://jd.com' },
        { id: 'b', name: '京东商城', url: 'https://www.jd.com' },
      ], records: { [today]: ['a', 'b'] }, todos: {}, targets: {}, preferences: { theme: 'auto', effects: 'full', compact: false },
    })
    expect(smuggled.sites).toHaveLength(1)
    expect(smuggled.sites[0].id).toBe('a')
    // 被丢掉那张卡的历史变成孤儿记录（刻意保留），统计时靠 countCheckedValid 排除
    expect(smuggled.records[today]).toEqual(['a', 'b'])
  })

  it('does not collapse before the v2 rekey step, or history would be lost', () => {
    // 反面守：如果按域名去重被提前放进 sanitizeSites，v2 数据里那两个 id
    // 会在 rekeySitesToDomains 之前就少一个，它的签到记录变成孤儿 ——
    // 用户升级后静默少一天签到。这条和 migrate.test.ts 的
    // 「塌陷时同一天的记录合并去重」是同一个坑的两面。
    const v2 = migrate({
      version: 2,
      sites: [
        { id: 'jd', name: '京东', url: 'https://www.jd.com' },
        { id: 'site-1', name: '京东商城', url: 'https://jd.com' },
      ],
      records: { [today]: ['jd', 'site-1'] },
    })
    expect(v2.sites).toHaveLength(1)
    expect(v2.records[today]).toEqual(['jd-com']) // 两个 id 的历史都并过来了，一个没丢
  })

  it('falls back when preferences are not plain strings', () => {
    // 这里守的是一个会**白屏**的坑：`String(['auto'])` 恰好是 `'auto'`，
    // 所以「用 String 包一层再 includes」会让数组通过校验，而返回值仍是数组。
    // 下游 `PALETTES[['auto']]` 取到 undefined → `palette.bg1` 抛异常 → 整页白屏，
    // 且用户没法在界面里修（设置面板此刻也读不出合法值）。
    // 但凡 `as` 断言的校验都要问一句：判断用的值和返回的值是同一个吗？
    expect(sanitizePreferences({ theme: ['auto'], effects: ['full'] })).toEqual({ theme: 'auto', effects: 'full', compact: false })
    expect(sanitizePreferences({ theme: { toString: () => 'night' }, effects: 1 })).toEqual({ theme: 'auto', effects: 'full', compact: false })
    expect(sanitizePreferences({ theme: 'night', effects: 'static', compact: 'true' })).toEqual({ theme: 'night', effects: 'static', compact: false })
    expect(sanitizePreferences(null)).toEqual({ theme: 'auto', effects: 'full', compact: false })
  })

  it.each([0, -1, 1.5, DATA_VERSION + 1])('rejects invalid backup version %s', (version) => {
    const data = { ...emptyData(), version }
    expect(parseBackup(JSON.stringify({ app: 'checkin-dashboard', data })).ok).toBe(false)
  })

  it('reports only data that is actually lost, not harmless duplicates', () => {
    // 这份备份里：1 条重复站点、1 条重复记录、1 条类型不对的记录、1 个坏日期 key。
    // 只有后两者是**真的读不出来**（`5` 不是字符串、`broken` 不是合法日期），
    // 前两者去重后内容还在，不该被算成「丢失」。
    // 判据如果宽一档，用户一打开页面就会被锁进只读的保护模式，
    // 而这批数据其实一点没坏 —— 这是本次改动要防的正事。
    const data = { ...emptyData(), sites: [site, site], records: { [today]: ['a', 'a', 5], broken: ['a'] } }
    const result = parseBackup(JSON.stringify({ app: 'checkin-dashboard', data }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dropped).toBe(2)
    expect(droppedEntries(data)).toBe(2)
  })

  it('treats sanitized-away data as dropped so the page can warn about it', () => {
    // `javascript:` 站点会被 sanitizeSites 整条丢掉（安全修复的本意），
    // 这类「修复时真的放弃了内容」的情况必须仍计入，否则用户的数据
    // 会一声不响地少掉一张卡片。
    const unsafe = { id: 'bad-com', name: 'Bad', url: 'javascript:alert(1)' }
    expect(droppedEntries({ ...emptyData(), sites: [site, unsafe] })).toBe(1)
  })

  it('round trips settings, snapshots, paused and pinned sites', () => {
    const data = emptyData()
    data.sites = [{ ...site, paused: true, pinned: true }]
    data.preferences = { theme: 'night', effects: 'static', compact: true }
    data.targets[yesterday] = [site]
    const result = parseBackup(serializeBackup(createBackup(data)))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.data).toEqual(data)
  })
})

describe('daily operations', () => {
  it('snapshots only active sites and preserves previous days', () => {
    let data = { ...emptyData(), sites: [site] }
    data = snapshotDay(data, yesterday)
    data = applyAction(data, { type: 'siteUpdated', id: site.id, patch: { paused: true } })
    data = snapshotDay(data, today)
    expect(data.targets[yesterday]).toEqual([site])
    expect(data.targets[today]).toEqual([])
    expect(snapshotDay(data, today)).toBe(data)
    expect(applyAction(data, { type: 'checkedSet', day: today, siteId: site.id, checked: true })).toBe(data)
  })

  it('sets checkin state idempotently rather than toggling twice', () => {
    const data = { ...emptyData(), sites: [site] }
    const action = { type: 'checkedSet' as const, day: today, siteId: site.id, checked: true }
    const once = applyAction(data, action)
    expect(applyAction(once, action)).toBe(once)
  })

  it('carries unfinished tasks once and keeps yesterday unchanged', () => {
    const data = emptyData()
    data.todos[yesterday] = [todo, { ...todo, id: 'done', done: true }]
    const action = { type: 'todosCarried' as const, from: yesterday, day: today }
    const once = applyAction(data, action)
    expect(once.todos[today]).toEqual([{ ...todo, carriedFrom: yesterday }])
    expect(once.todos[yesterday]).toEqual(data.todos[yesterday])
    expect(applyAction(once, action)).toBe(once)
  })

  it('edits, deletes and restores a task at its original position', () => {
    let data = emptyData()
    data.todos[today] = [{ ...todo, id: 'first' }, todo, { ...todo, id: 'last' }]
    data = applyAction(data, { type: 'todoEdited', day: today, id: todo.id, text: ' Updated ' })
    const edited = data.todos[today][1]
    expect(edited.text).toBe('Updated')
    data = applyAction(data, { type: 'todoRemoved', day: today, id: todo.id })
    const action = { type: 'todoRestored' as const, day: today, todo: edited, index: 1 }
    data = applyAction(data, action)
    expect(data.todos[today][1]).toEqual(edited)
    expect(applyAction(data, action)).toBe(data)
  })

  it('moves sites by explicit neighbour instead of by stored index', () => {
    const beta = { ...site, id: 'beta', url: 'https://beta.com' }
    const gamma = { ...site, id: 'gamma', url: 'https://gamma.com' }
    const data = { ...emptyData(), sites: [site, beta, gamma] }

    // 和显式指定的那个站换位（可见列表可能就是 [gamma]，那 gamma 前移应换 beta）
    expect(applyAction(data, { type: 'siteMoved', id: gamma.id, targetId: beta.id }).sites.map((s) => s.id)).toEqual([site.id, gamma.id, beta.id])
    // 自己和自己换、或者有一方已经不存在 → 原样返回（引用不变，React 跳过重渲染）
    expect(applyAction(data, { type: 'siteMoved', id: site.id, targetId: site.id })).toBe(data)
    expect(applyAction(data, { type: 'siteMoved', id: site.id, targetId: 'missing' })).toBe(data)
  })

  it('merges import data without erasing current settings or day snapshots', () => {
    const local = snapshotDay({ ...emptyData(), sites: [site] }, today)
    const incoming = emptyData()
    incoming.targets[today] = []
    incoming.targets[yesterday] = [site]
    incoming.preferences.effects = 'static'
    const merged = mergeData(local, incoming)
    expect(merged.targets[today]).toEqual([site])
    expect(merged.targets[yesterday]).toEqual([site])
    expect(merged.preferences).toEqual(local.preferences)
  })
})

describe('site discovery', () => {
  const sites = [site, { ...site, id: 'beta', name: 'Beta', url: 'https://beta.com', category: 'Work', pinned: true }, { ...site, id: 'paused', name: 'Paused', paused: true }]
  const filters: SiteFilters = { query: '', category: null, status: 'all', sort: 'manual' }

  it('searches names and domains case insensitively', () => {
    expect(filterSites(sites, new Set(), { ...filters, query: ' BETA.COM ' }).map((item) => item.id)).toEqual(['beta'])
  })
  it('separates paused sites from pending sites', () => {
    expect(filterSites(sites, new Set([site.id]), { ...filters, status: 'pending' }).map((item) => item.id)).toEqual(['beta'])
    expect(filterSites(sites, new Set(), { ...filters, status: 'paused' }).map((item) => item.id)).toEqual(['paused'])
  })
  it('pins first without mutating the stored manual order', () => {
    expect(filterSites(sites, new Set(), filters)[0].id).toBe('beta')
    expect(sites[0].id).toBe(site.id)
  })
  it('filters uncategorized sites', () => {
    expect(filterSites(sites, new Set(), { ...filters, category: '' })).toHaveLength(2)
  })
  it('computes move neighbours from the visible list, not the stored order', () => {
    // 关键场景：用户筛出只显示 [paused]，它在存储里是最后一个，
    // 但它上面那个可见邻居是 beta，不是存储里的 site。
    // 旧实现用「未筛选的 allSites 索引 ±1」算，会在这种列表里
    // 亮起一个点了没效果的按钮，还悄悄改掉屏幕外的顺序。
    const visible = filterSites(sites, new Set(), { ...filters, status: 'paused' })
    expect(visible.map((item) => item.id)).toEqual(['paused'])
    expect(moveNeighbor(visible, 'paused', -1)).toBeNull() // 单元素列表，两边都没得换

    const all = filterSites(sites, new Set(), filters) // 置顶的 beta 排在最前
    expect(all.map((item) => item.id)).toEqual(['beta', site.id, 'paused'])
    expect(moveNeighbor(all, 'beta', 1)).toBeNull() // beta 是置顶，下一个是普通站 → 不许换
    expect(moveNeighbor(all, site.id, -1)).toBeNull() // 同上，反方向也不许
    expect(moveNeighbor(all, site.id, 1)).toBe('paused') // 同组，可以换
    expect(moveNeighbor(all, 'paused', 1)).toBeNull() // 已是同组末位
    expect(moveNeighbor(all, 'missing', 1)).toBeNull()
  })
  it('allows swapping two pinned sites with each other', () => {
    const pinned = [
      { ...site, id: 'p1', pinned: true },
      { ...site, id: 'p2', pinned: true },
      { ...site, id: 'n1' },
    ]
    expect(moveNeighbor(pinned, 'p1', 1)).toBe('p2') // 两个置顶可以互换
    expect(moveNeighbor(pinned, 'p2', 1)).toBeNull() // 下一个是普通站 → 不许跨组
  })
})
