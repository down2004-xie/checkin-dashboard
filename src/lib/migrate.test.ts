import { describe, expect, it } from 'vitest'

import { DATA_VERSION } from '../types'
import { emptyData, migrate, sanitizeRecords, sanitizeSites } from './migrate'

describe('migrate', () => {
  it('v1 数据能一路升到当前版本，且历史记录的旧 id 被接续而不是变成孤儿', () => {
    // 这条守着一个极易写错的链：v1→v2 播种站点时如果直接用**当前**的 SITES
    // （id 已经是域名形态），下一步 v2→v3 的重写映射表就认不出 'bilibili'，
    // 这条记录会静默变成孤儿 —— v1 用户升级后历史全部归零，还不报错。
    const v1 = { version: 1, records: { '2026-10-01': ['bilibili'] } }
    const result = migrate(v1)

    expect(result.version).toBe(DATA_VERSION)
    expect(result.sites.length).toBeGreaterThan(0)
    expect(result.records).toEqual({ '2026-10-01': ['bilibili-com'] })

    // 确认这个 id 真的对得上一个存在的站点，否则「没变孤儿」只是巧合
    expect(result.sites.map((s) => s.id)).toContain('bilibili-com')
  })

  it('v2 的 sites 顺序被保留（id 会被重写，但先后不变）', () => {
    const result = migrate({
      version: 2,
      sites: [
        { id: 'z-first', name: 'A', url: 'https://a.com' },
        { id: 'a-second', name: 'B', url: 'https://b.com' },
      ],
      records: {},
    })
    // 名字的字母序和数组顺序故意做成相反，确保是按原顺序保留而不是重排
    expect(result.sites.map((s) => s.name)).toEqual(['A', 'B'])
    expect(result.sites.map((s) => s.id)).toEqual(['a-com', 'b-com'])
  })

  it('v2 的 records 里非法值被过滤', () => {
    const result = migrate({
      version: 2,
      sites: [],
      records: {
        '2026-10-01': ['a', 123, null], // 非字符串元素被丢弃
        '2026-10-02': 'not-array', // 非数组被丢弃
        '2026-10-03': [], // 空数组被丢弃
        '2026-10-04': ['b'],
      },
    })
    // sites 是空数组，所以 a / b 都映射不到，作为孤儿原样留下
    expect(result.records).toEqual({
      '2026-10-01': ['a'],
      '2026-10-04': ['b'],
    })
  })

  it('v2 的 sites 是坏数组 → 过滤为 []', () => {
    // 数组存在（哪怕全是坏的）说明用户维护过清单，过滤后可以为空
    const result = migrate({ version: 2, sites: ['oops', 42], records: {} })
    expect(result.sites).toEqual([])
  })

  it('v2 缺少 sites 字段 → 播种默认站点', () => {
    const result = migrate({ version: 2, records: {} })
    expect(result.sites.length).toBeGreaterThan(0)
  })

  it('未知版本（0 / 99）→ emptyData', () => {
    expect(migrate({ version: 0, records: {} })).toEqual(emptyData())
    expect(migrate({ version: 99, sites: [], records: {} })).toEqual(emptyData())
  })

  it('非对象输入（null / 字符串 / 数字）→ emptyData', () => {
    expect(migrate(null)).toEqual(emptyData())
    expect(migrate('oops')).toEqual(emptyData())
    expect(migrate(42)).toEqual(emptyData())
  })
})

describe('v2 → v3：站点身份改为域名派生', () => {
  it('id 重写成域名派生形式，records 同步重写', () => {
    const result = migrate({
      version: 2,
      sites: [{ id: 'jd', name: '京东', url: 'https://www.jd.com', category: '购物' }],
      records: { '2026-10-01': ['jd'] },
    })

    expect(result.version).toBe(3)
    expect(result.sites).toEqual([
      { id: 'jd-com', name: '京东', url: 'https://www.jd.com', category: '购物' },
    ])
    expect(result.records).toEqual({ '2026-10-01': ['jd-com'] })
  })

  it('只改 sites 不改 records 会让历史全变孤儿 —— 这条钉住两者必须同步', () => {
    const result = migrate({
      version: 2,
      sites: [
        { id: 'site-2', name: '淘宝', url: 'https://www.taobao.com' },
        { id: 'site-1', name: '京东', url: 'https://www.jd.com' },
      ],
      records: { '2026-10-01': ['site-2'], '2026-10-02': ['site-1'] },
    })

    const siteIds = result.sites.map((s) => s.id)
    for (const id of Object.values(result.records).flat()) {
      expect(siteIds).toContain(id)
    }
  })

  it('同域名的重复站点塌成一个：定义留先出现的，两个站的历史都并过来', () => {
    const result = migrate({
      version: 2,
      sites: [
        { id: 'jd', name: '京东', url: 'https://www.jd.com' },
        { id: 'site-1', name: '京东商城', url: 'https://jd.com/index.html' },
      ],
      records: { '2026-10-01': ['jd'], '2026-10-02': ['site-1'] },
    })

    expect(result.sites).toHaveLength(1)
    expect(result.sites[0]).toEqual({ id: 'jd-com', name: '京东', url: 'https://www.jd.com' })
    expect(result.records).toEqual({
      '2026-10-01': ['jd-com'],
      '2026-10-02': ['jd-com'],
    })
  })

  it('塌陷时同一天的记录合并去重', () => {
    const result = migrate({
      version: 2,
      sites: [
        { id: 'jd', name: '京东', url: 'https://www.jd.com' },
        { id: 'site-1', name: '京东商城', url: 'https://jd.com' },
      ],
      records: { '2026-10-01': ['jd', 'site-1'] }, // 同一天两个 id 都要签
    })

    expect(result.records).toEqual({ '2026-10-01': ['jd-com'] })
  })

  it('已删站点的孤儿记录映射不到，原样保留（交给以后的清理功能）', () => {
    const result = migrate({
      version: 2,
      sites: [{ id: 'jd', name: '京东', url: 'https://www.jd.com' }],
      records: { '2026-10-01': ['jd', '已删掉的站'] },
    })

    // 迁移时已经拿不到这个站的 url，算不出域名，只能原样留着。
    // 不在这里删：删用户数据得用户自己决定，而且以后要加清理按钮
    expect(result.records).toEqual({ '2026-10-01': ['jd-com', '已删掉的站'] })
  })

  it('url 解析不出域名 → 保留原 id，不乱编一个', () => {
    const result = migrate({
      version: 2,
      sites: [{ id: 'weird', name: '怪', url: '' }],
      records: { '2026-10-01': ['weird'] },
    })

    expect(result.sites[0].id).toBe('weird')
    expect(result.records).toEqual({ '2026-10-01': ['weird'] })
  })

  it('新旧 id 交叉时不会互相污染：先建全量映射，不是边遍历边改', () => {
    // A 的旧 id 是 'jd'、新 id 是 'jd-com'；而 B 的旧 id 恰好就是 'jd-com'。
    // 如果边遍历边改，A 写进 'jd-com' 之后 B 再去读 'jd-com' 就会读到脏值。
    const result = migrate({
      version: 2,
      sites: [
        { id: 'jd', name: '京东', url: 'https://www.jd.com' },
        { id: 'jd-com', name: 'GitHub（早期随手起的 id）', url: 'https://github.com' },
      ],
      records: { '2026-10-01': ['jd'], '2026-10-02': ['jd-com'] },
    })

    expect(result.sites.map((s) => s.id)).toEqual(['jd-com', 'github-com'])
    // 'jd-com' 这个 key 原本属于 B，必须跟着 B 走到 'github-com'，不能被 A 抢走
    expect(result.records).toEqual({
      '2026-10-01': ['jd-com'],
      '2026-10-02': ['github-com'],
    })
  })

  it('已经是 v3 的数据再迁移一次是幂等的', () => {
    const once = migrate({
      version: 2,
      sites: [{ id: 'jd', name: '京东', url: 'https://www.jd.com' }],
      records: { '2026-10-01': ['jd'] },
    })
    expect(migrate(once)).toEqual(once)
  })

  it('非整数版本号 → emptyData（1.5 这种不该被当成 v3）', () => {
    expect(migrate({ version: 1.5, sites: [], records: {} })).toEqual(emptyData())
    expect(migrate({ version: -1, sites: [], records: {} })).toEqual(emptyData())
  })
})

describe('sanitizeRecords', () => {
  it('非对象 → 空对象', () => {
    expect(sanitizeRecords(null)).toEqual({})
    expect(sanitizeRecords('oops')).toEqual({})
  })
})

describe('sanitizeSites', () => {
  it('undefined → 默认站点', () => {
    expect(sanitizeSites(undefined).length).toBeGreaterThan(0)
  })

  it('空数组 → 空数组（用户故意删空，不补默认）', () => {
    expect(sanitizeSites([])).toEqual([])
  })
})

describe('emptyData', () => {
  it('返回当前版本 + 默认站点 + 空 records', () => {
    const data = emptyData()
    expect(data.version).toBe(DATA_VERSION)
    expect(data.sites.length).toBeGreaterThan(0)
    expect(data.records).toEqual({})
  })
})