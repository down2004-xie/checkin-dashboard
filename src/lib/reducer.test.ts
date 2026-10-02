import { describe, expect, it } from 'vitest'

import type { CheckInData } from '../types'
import { DATA_VERSION } from '../types'
import { applyAction } from './reducer'
import { siteIdFromUrl } from './site-form'
import { calcSiteStreak, calcStreak } from './streak'

/** 按 v3 规则生成站点：id 由域名派生 */
function site(url: string, name: string) {
  const id = siteIdFromUrl(url)
  if (id === null) throw new Error(`测试数据里的网址不合法：${url}`)
  return { id, name, url }
}

const SITE_A = { id: 'a', name: 'A', url: 'https://a' }
const SITE_B = { id: 'b', name: 'B', url: 'https://b' }

function makeData(
  records: Record<string, string[]>,
  sites = [SITE_A, SITE_B],
): CheckInData {
  return { version: DATA_VERSION, records, sites }
}

describe('toggled', () => {
  it('添加签到', () => {
    const before = makeData({})
    const after = applyAction(before, { type: 'toggled', day: '2026-10-02', siteId: 'a' })
    expect(after.records['2026-10-02']).toEqual(['a'])
  })

  it('再次签到同一站 → 取消', () => {
    const before = makeData({ '2026-10-02': ['a'] })
    const after = applyAction(before, { type: 'toggled', day: '2026-10-02', siteId: 'a' })
    expect(after.records['2026-10-02']).toBeUndefined()
  })

  it('当天签多个站按顺序追加', () => {
    const before = makeData({ '2026-10-02': ['a'] })
    const after = applyAction(before, { type: 'toggled', day: '2026-10-02', siteId: 'b' })
    expect(after.records['2026-10-02']).toEqual(['a', 'b'])
  })

  it('不可变：原 data 不被修改', () => {
    const before = makeData({ '2026-10-02': ['a'] })
    applyAction(before, { type: 'toggled', day: '2026-10-02', siteId: 'b' })
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