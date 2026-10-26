import { describe, expect, it } from 'vitest'

import type { CheckInData, Site, Todo } from '../types'
import { DATA_VERSION, DEFAULT_PREFERENCES } from '../types'
import { applyAction } from './reducer'
import { siteIdFromUrl } from './site-form'
import { calcSiteStreak, calcStreak } from './streak'

/** 按 v3 规则生成站点：id 由域名派生 */
function site(url: string, name: string) {
  const id = siteIdFromUrl(url)
  if (id === null) throw new Error(`测试数据里的网址不合法：${url}`)
  return { id, name, url }
}

const SITE_A: Site = { id: 'a', name: 'A', url: 'https://a' }
const SITE_B: Site = { id: 'b', name: 'B', url: 'https://b' }

function makeData(
  records: Record<string, string[]>,
  sites = [SITE_A, SITE_B],
): CheckInData {
  return { version: DATA_VERSION, records, sites, todos: {}, targets: {}, preferences: { ...DEFAULT_PREFERENCES } }
}

/** 造只带待办的测试数据 —— 待办测试不关心站点和签到记录 */
function makeTodoData(todos: Record<string, Todo[]>): CheckInData {
  return { version: DATA_VERSION, records: {}, sites: [], todos, targets: {}, preferences: { ...DEFAULT_PREFERENCES } }
}

const TODO_A: Todo = { id: 't1', text: '写作业', done: false }
const TODO_B: Todo = { id: 't2', text: '买牛奶', done: false }

/**
 * 检查签到状态用 `checkedSet`（显式声明目标状态），**不用** `toggled`。
 *
 * 原来的 `toggled`（无条件翻转）在 v5 已经删掉了：它唯一的生产调用方
 * 早就换成了 `checkedSet`，而 `toggled` 没有「暂停站点不许签到」这条守卫。
 * 留着一个只有测试在用的 action，下一个人会以为它还能用，照着它写新功能。
 *
 * `checkedSet` 的两条语义值得单独守住：
 * 1. **幂等**——重复勾同一个站不会把它取消（`toggled` 会）
 * 2. **暂停的站点不许勾**——它不在当天的目标里，勾了会让进度环对不上
 */
describe('checkedSet', () => {
  it('添加签到', () => {
    const after = applyAction(makeData({}), { type: 'checkedSet', day: '2026-10-02', siteId: 'a', checked: true })
    expect(after.records['2026-10-02']).toEqual(['a'])
  })

  it('取消签到', () => {
    const after = applyAction(makeData({ '2026-10-02': ['a'] }), { type: 'checkedSet', day: '2026-10-02', siteId: 'a', checked: false })
    expect(after.records['2026-10-02']).toBeUndefined()
  })

  it('当天签多个站按顺序追加', () => {
    const after = applyAction(makeData({ '2026-10-02': ['a'] }), { type: 'checkedSet', day: '2026-10-02', siteId: 'b', checked: true })
    expect(after.records['2026-10-02']).toEqual(['a', 'b'])
  })

  it('幂等：已勾选的再设成 true 不取消，原样返回同一个引用', () => {
    const before = makeData({ '2026-10-02': ['a'] })
    expect(applyAction(before, { type: 'checkedSet', day: '2026-10-02', siteId: 'a', checked: true })).toBe(before)
  })

  it('暂停的站点勾不动', () => {
    const before = makeData({}, [{ ...SITE_A, paused: true }, SITE_B])
    expect(applyAction(before, { type: 'checkedSet', day: '2026-10-02', siteId: 'a', checked: true })).toBe(before)
  })

  it('不存在的站点勾不动（孤儿记录不该被无中生有）', () => {
    const before = makeData({})
    expect(applyAction(before, { type: 'checkedSet', day: '2026-10-02', siteId: 'ghost', checked: true })).toBe(before)
  })

  it('不可变：原 data 不被修改', () => {
    const before = makeData({ '2026-10-02': ['a'] })
    applyAction(before, { type: 'checkedSet', day: '2026-10-02', siteId: 'b', checked: true })
    expect(before.records['2026-10-02']).toEqual(['a']) // 仍是原来的值
  })
})

describe('siteAdded', () => {
  it('正常追加', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, { type: 'siteAdded', site: SITE_B })
    expect(after.sites.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('同 id 已存在 → 幂等，不重复', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'siteAdded',
      site: { id: 'a', name: 'A2', url: 'https://a2' },
    })
    expect(after).toBe(before) // 原样返回
    expect(after.sites).toHaveLength(1)
    expect(after.sites[0].name).toBe('A') // 不覆盖
  })
})

describe('sitesAdded', () => {
  it('批量追加', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'sitesAdded',
      sites: [SITE_B, { id: 'c', name: 'C', url: 'https://c' }],
    })
    expect(after.sites.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('已存在的 id 被跳过，只加新的', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'sitesAdded',
      sites: [{ id: 'a', name: 'A改', url: 'https://a-new' }, SITE_B],
    })
    expect(after.sites.map((s) => s.id)).toEqual(['a', 'b'])
    expect(after.sites[0].name).toBe('A') // 已存在的那个不被覆盖
  })

  it('本批次内部同 id → 只留第一个', () => {
    // 这是批量接口和「循环调用 siteAdded」的关键差别：
    // 循环时第二条拿到的 id 是算过的，但一批里如果调用方算错了就会双双写入
    const before = makeData({}, [])
    const after = applyAction(before, {
      type: 'sitesAdded',
      sites: [SITE_A, { id: 'a', name: 'A副本', url: 'https://a2' }],
    })
    expect(after.sites).toHaveLength(1)
    expect(after.sites[0].url).toBe('https://a')
  })

  it('全部已存在 → 原样返回同一个引用', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, { type: 'sitesAdded', sites: [SITE_A] })
    expect(after).toBe(before)
  })

  it('空数组 → 原样返回', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, { type: 'sitesAdded', sites: [] })
    expect(after).toBe(before)
  })

  it('不可变：原 data 的 sites 不被修改', () => {
    const before = makeData({}, [SITE_A])
    applyAction(before, { type: 'sitesAdded', sites: [SITE_B] })
    expect(before.sites).toHaveLength(1)
  })

  it('records 不为所动', () => {
    const before = makeData({ '2026-10-02': ['a'] }, [SITE_A])
    const after = applyAction(before, { type: 'sitesAdded', sites: [SITE_B] })
    expect(after.records).toBe(before.records)
  })
})

describe('siteUpdated', () => {
  it('按 id 修改 name / url / category', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'siteUpdated',
      id: 'a',
      patch: { name: 'A改', url: 'https://a-new' },
    })
    expect(after.sites[0]).toEqual({ id: 'a', name: 'A改', url: 'https://a-new' })
  })

  it('忽略 patch 里的 id —— id 不可改', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'siteUpdated',
      id: 'a',
      patch: { id: 'hacked', name: 'X' },
    })
    expect(after.sites[0].id).toBe('a')
    expect(after.sites[0].name).toBe('X')
  })

  it('找不到 id → 原样返回', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, {
      type: 'siteUpdated',
      id: 'nope',
      patch: { name: 'X' },
    })
    expect(after).toBe(before)
  })
})

describe('siteRemoved', () => {
  it('删掉站点', () => {
    const before = makeData({}, [SITE_A, SITE_B])
    const after = applyAction(before, { type: 'siteRemoved', id: 'a' })
    expect(after.sites.map((s) => s.id)).toEqual(['b'])
  })

  it('records 不为所动（孤儿记录保留）', () => {
    const before = makeData({ '2026-10-02': ['a', 'b'] }, [SITE_A, SITE_B])
    const after = applyAction(before, { type: 'siteRemoved', id: 'a' })
    expect(after.records['2026-10-02']).toEqual(['a', 'b'])
  })

  it('找不到 id → 原样返回', () => {
    const before = makeData({}, [SITE_A])
    const after = applyAction(before, { type: 'siteRemoved', id: 'nope' })
    expect(after).toBe(before)
  })
})

describe('replaced', () => {
  it('整体替换', () => {
    const before = makeData({})
    const next = makeData({ '2026-10-03': ['a'] }, [SITE_B])
    const after = applyAction(before, { type: 'replaced', data: next })
    expect(after).toBe(next)
  })
})

describe('端到端：删掉再加，历史能接回来（v3 身份改造的核心保证）', () => {
  it('删除站点后再按同样的网址加回来 → 同一个 id，这个站的历史没有丢', () => {
    const jd = site('https://www.jd.com', '京东')

    // 1. 有京东，且已连着签了三天
    let data = makeData(
      { '2026-09-30': [jd.id], '2026-10-01': [jd.id], '2026-10-02': [jd.id] },
      [jd],
    )
    expect(calcSiteStreak(data, jd.id, '2026-10-02')).toBe(3)

    // 2. 用户误删了它 —— 站点定义没了，历史记录刻意保留成孤儿
    data = applyAction(data, { type: 'siteRemoved', id: jd.id })
    expect(data.sites).toEqual([])
    expect(data.records['2026-10-02']).toEqual(['jd-com'])

    // 3. 再加回来。这次网址写的是不带 www. 的形式，还改了个名字 ——
    //    id 由域名派生，所以拿回的仍是同一个 id
    const reAdded = site('https://jd.com', '京东（每日签到）')
    expect(reAdded.id).toBe(jd.id)

    data = applyAction(data, { type: 'siteAdded', site: reAdded })

    // 4. 这个站的历史接上了，不是从零开始
    expect(data.sites).toHaveLength(1)
    expect(calcSiteStreak(data, jd.id, '2026-10-02')).toBe(3)
    expect(calcStreak(data, '2026-10-02')).toBe(3)
  })

  it('反面对照：id 一旦变了，这个站的历史就接不回来（v2 就是这么丢的）', () => {
    // 说明上面那条保证**靠的是 id 稳定**，不是别的什么巧合。
    //
    // 注意这里必须用 calcSiteStreak（单站）而不是 calcStreak（全局）：
    // 全局连续天数只判断「那天有没有签到记录」，孤儿记录照样算数，
    // 所以就算 id 变了、历史全接不上，calcStreak 仍然会返回 3 ——
    // 用它来验这条会得到一个假通过的测试。
    const jd = site('https://www.jd.com', '京东')
    let data = makeData({ '2026-09-30': [jd.id], '2026-10-01': [jd.id], '2026-10-02': [jd.id] }, [jd])

    data = applyAction(data, { type: 'siteRemoved', id: jd.id })
    // 用另一个 id 加回来，模拟 v2 时代「纯中文名重新添加拿到不同 site-N」
    data = applyAction(data, {
      type: 'siteAdded',
      site: { id: 'site-7', name: '京东', url: 'https://www.jd.com' },
    })

    expect(data.sites).toHaveLength(1)
    // 新 id 名下一条记录都没有
    expect(calcSiteStreak(data, 'site-7', '2026-10-02')).toBe(0)
    // 老 id 的三天历史还在存储里，但已经没有站点指向它了 —— 永远不会被显示
    expect(calcSiteStreak(data, jd.id, '2026-10-02')).toBe(3)
    // 而这正是它危险的地方：全局连续天数看起来一切正常
    expect(calcStreak(data, '2026-10-02')).toBe(3)
  })
})

describe('todoAdded', () => {
  it('追加到当天列表', () => {
    const after = applyAction(makeTodoData({}), {
      type: 'todoAdded',
      day: '2026-10-07',
      todo: TODO_A,
    })
    expect(after.todos['2026-10-07']).toEqual([TODO_A])
  })

  it('同一天多条按添加顺序累积', () => {
    let data = applyAction(makeTodoData({}), {
      type: 'todoAdded',
      day: '2026-10-07',
      todo: TODO_A,
    })
    data = applyAction(data, { type: 'todoAdded', day: '2026-10-07', todo: TODO_B })
    expect(data.todos['2026-10-07'].map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('不同天互不影响', () => {
    let data = applyAction(makeTodoData({}), {
      type: 'todoAdded',
      day: '2026-10-07',
      todo: TODO_A,
    })
    data = applyAction(data, { type: 'todoAdded', day: '2026-10-08', todo: TODO_B })
    expect(Object.keys(data.todos).sort()).toEqual(['2026-10-07', '2026-10-08'])
    expect(data.todos['2026-10-07']).toHaveLength(1)
  })

  it('不可变：原 data 的 todos 不被修改', () => {
    const before = makeTodoData({})
    applyAction(before, { type: 'todoAdded', day: '2026-10-07', todo: TODO_A })
    expect(before.todos).toEqual({})
  })

  it('records / sites 不为所动', () => {
    const before = makeTodoData({})
    const after = applyAction(before, {
      type: 'todoAdded',
      day: '2026-10-07',
      todo: TODO_A,
    })
    expect(after.records).toBe(before.records)
    expect(after.sites).toBe(before.sites)
  })
})

describe('todoToggled', () => {
  it('把未完成翻成完成', () => {
    const before = makeTodoData({ '2026-10-07': [TODO_A] })
    const after = applyAction(before, { type: 'todoToggled', day: '2026-10-07', id: 't1' })
    expect(after.todos['2026-10-07'][0].done).toBe(true)
  })

  it('再翻一次变回未完成', () => {
    const before = makeTodoData({ '2026-10-07': [{ ...TODO_A, done: true }] })
    const after = applyAction(before, { type: 'todoToggled', day: '2026-10-07', id: 't1' })
    expect(after.todos['2026-10-07'][0].done).toBe(false)
  })

  it('不动没被点中的那一条（兄弟项保持同一个引用）', () => {
    // 这条测的是不可变的粒度：只复制命中的那条，其余原样带过去。
    // 如果实现写成「整数组 map 出全新对象」，功能也对，
    // 但会让所有兄弟项在每次点击时都换引用、引发无谓的重渲染
    const before = makeTodoData({ '2026-10-07': [TODO_A, TODO_B] })
    const after = applyAction(before, { type: 'todoToggled', day: '2026-10-07', id: 't1' })

    expect(after.todos['2026-10-07'][1]).toBe(TODO_B) // 引用没变
    expect(after.todos['2026-10-07'][0]).not.toBe(TODO_A) // 命中的那条是新对象
  })

  it('这天没有待办 → 原样返回同一个引用', () => {
    const before = makeTodoData({})
    expect(applyAction(before, { type: 'todoToggled', day: '2026-10-07', id: 't1' })).toBe(before)
  })

  it('id 不存在 → 原样返回同一个引用', () => {
    const before = makeTodoData({ '2026-10-07': [TODO_A] })
    expect(applyAction(before, { type: 'todoToggled', day: '2026-10-07', id: 'nope' })).toBe(before)
  })
})

describe('todoRemoved', () => {
  it('删掉指定的一条，其余保留', () => {
    const before = makeTodoData({ '2026-10-07': [TODO_A, TODO_B] })
    const after = applyAction(before, { type: 'todoRemoved', day: '2026-10-07', id: 't1' })
    expect(after.todos['2026-10-07']).toEqual([TODO_B])
  })

  it('删空后整个天的 key 被移除，不留空数组', () => {
    // 和 handleToggle 对 records 的处理保持一致。
    // 留着 { '2026-10-07': [] } 会让存储里攒一堆空壳，
    // 也让「这天有没有待办」的判断多一种状态
    const before = makeTodoData({ '2026-10-07': [TODO_A] })
    const after = applyAction(before, { type: 'todoRemoved', day: '2026-10-07', id: 't1' })
    expect(after.todos['2026-10-07']).toBeUndefined()
    expect(Object.keys(after.todos)).toEqual([])
  })

  it('只删一天，别的天不受影响', () => {
    const before = makeTodoData({ '2026-10-07': [TODO_A], '2026-10-08': [TODO_B] })
    const after = applyAction(before, { type: 'todoRemoved', day: '2026-10-07', id: 't1' })
    expect(after.todos['2026-10-08']).toEqual([TODO_B])
  })

  it('id 不存在 → 原样返回同一个引用', () => {
    const before = makeTodoData({ '2026-10-07': [TODO_A] })
    expect(applyAction(before, { type: 'todoRemoved', day: '2026-10-07', id: 'nope' })).toBe(before)
  })

  it('待办变更不影响签到 records（两条数据线互相独立）', () => {
    const before: CheckInData = {
      version: DATA_VERSION,
      records: { '2026-10-07': ['a'] },
      sites: [SITE_A],
      todos: { '2026-10-07': [TODO_A] },
      targets: {}, preferences: { ...DEFAULT_PREFERENCES },
    }
    const after = applyAction(before, { type: 'todoRemoved', day: '2026-10-07', id: 't1' })
    expect(after.records).toEqual({ '2026-10-07': ['a'] })
  })
})

describe('orphansCleared', () => {
  it('只删已删站点的记录，现存站点的记录原样保留', () => {
    const before = makeData({ '2026-10-01': ['a', 'gone'], '2026-10-02': ['gone'] })
    const after = applyAction(before, { type: 'orphansCleared' })
    expect(after.records).toEqual({ '2026-10-01': ['a'] })
  })

  it('没有孤儿时返回同一个引用（不该触发无意义的重渲染和落盘）', () => {
    const before = makeData({ '2026-10-01': ['a', 'b'] })
    expect(applyAction(before, { type: 'orphansCleared' })).toBe(before)
  })
})

describe('siteReordered', () => {
  const SITE_C: Site = { id: 'c', name: 'C', url: 'https://c' }
  const SITE_PINNED: Site = { id: 'x', name: 'X', url: 'https://x', pinned: true }

  it('向下拖：被拖项落在目标原来的位置，中间的项整体上移', () => {
    const before = makeData({}, [SITE_A, SITE_B, SITE_C])
    const after = applyAction(before, { type: 'siteReordered', id: 'a', targetId: 'c' })
    // [a,b,c] → 抽走 a → [b,c] → 插到 c 原位置（1）→ [b,a,c]
    expect(after.sites.map((site) => site.id)).toEqual(['b', 'a', 'c'])
  })

  it('向上拖：被拖项落在目标原来的位置，目标及其后面的项后移', () => {
    const before = makeData({}, [SITE_A, SITE_B, SITE_C])
    const after = applyAction(before, { type: 'siteReordered', id: 'c', targetId: 'a' })
    expect(after.sites.map((site) => site.id)).toEqual(['c', 'a', 'b'])
  })

  it('跨置顶边界 → 原样返回同一个引用（不跨组移动）', () => {
    const before = makeData({}, [SITE_A, SITE_B, SITE_PINNED])
    expect(applyAction(before, { type: 'siteReordered', id: 'a', targetId: 'x' })).toBe(before)
    expect(applyAction(before, { type: 'siteReordered', id: 'x', targetId: 'a' })).toBe(before)
  })

  it('同一个 id → 原样返回同一个引用', () => {
    const before = makeData({}, [SITE_A, SITE_B])
    expect(applyAction(before, { type: 'siteReordered', id: 'a', targetId: 'a' })).toBe(before)
  })

  it('目标不存在 → 原样返回同一个引用', () => {
    const before = makeData({}, [SITE_A, SITE_B])
    expect(applyAction(before, { type: 'siteReordered', id: 'a', targetId: 'ghost' })).toBe(before)
  })

  it('只动 sites，其余字段保持同一个引用', () => {
    const before = makeData({ '2026-10-01': ['a'] }, [SITE_A, SITE_B, SITE_C])
    const after = applyAction(before, { type: 'siteReordered', id: 'a', targetId: 'b' })
    expect(after.sites).not.toBe(before.sites)
    expect(after.records).toBe(before.records)
    expect(after.todos).toBe(before.todos)
    expect(after.targets).toBe(before.targets)
    expect(after.preferences).toBe(before.preferences)
  })
})
