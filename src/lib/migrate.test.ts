import { describe, expect, it } from 'vitest'

import { DATA_VERSION } from '../types'
import {
  dataProblem,
  droppedEntries,
  emptyData,
  migrate,
  sanitizeDiary,
  sanitizeRecords,
  sanitizeSites,
  sanitizeTodos,
} from './migrate'

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

    expect(result.version).toBe(DATA_VERSION)
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

  it('url 算不出域名 → 保留原 id，不乱编一个', () => {
    // 输入用 'https://' 而不是空串：空串会被 sanitizeSites 的协议白名单
    // 提前丢弃，就走不到 rekeySitesToDomains 的 `?? site.id` 降级分支了。
    // 'https://' 协议合法但缺 host，siteIdFromUrl 算不出域名 —— 正是这条测试要的输入。
    const result = migrate({
      version: 2,
      sites: [{ id: 'weird', name: '怪', url: 'https://' }],
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

  it('丢弃 url 协议不安全的站点 —— 备份文件是外部输入', () => {
    // 攻击路径：给用户一个「备份 JSON」，里面塞 javascript: 地址，
    // 导入后渲染成 <a href>，用户一点卡片就执行脚本
    const sites = sanitizeSites([
      { id: 'jd-com', name: '京东', url: 'https://www.jd.com' },
      { id: 'evil-a', name: '注入 A', url: 'javascript:alert(1)' },
      { id: 'evil-b', name: '注入 B', url: 'data:text/html,<script>alert(1)</script>' },
      { id: 'evil-c', name: '注入 C', url: 'javascript:1234' },
      { id: 'evil-d', name: '注入 D', url: 'ftp://example.com' },
    ])
    expect(sites.map((s) => s.id)).toEqual(['jd-com'])
  })

  it('丢弃无协议的 url（正常路径的值必然已补过协议）', () => {
    expect(sanitizeSites([{ id: 'a', name: 'A', url: 'jd.com' }])).toEqual([])
  })
})

describe('v3 → v4：新增 todos 字段', () => {
  it('v3 数据升级后带上空的 todos（老用户不必清库）', () => {
    const result = migrate({
      version: 3,
      sites: [{ id: 'jd-com', name: '京东', url: 'https://www.jd.com' }],
      records: { '2026-10-01': ['jd-com'] },
    })
    expect(result.version).toBe(DATA_VERSION)
    expect(result.todos).toEqual({})
    // 关键：加字段不能顺手把已有的 sites / records 弄坏
    expect(result.sites).toHaveLength(1)
    expect(result.records).toEqual({ '2026-10-01': ['jd-com'] })
  })

  it('v1 数据一路升到 v4，同样带 todos', () => {
    // 守着「加字段不能只在某一档生效」：v4 的 todos 兜底写在梯子外面，
    // 对 v1 进来的数据也要成立
    const result = migrate({ version: 1, records: { '2026-10-01': ['bilibili'] } })
    expect(result.version).toBe(DATA_VERSION)
    expect(result.todos).toEqual({})
  })

  it('已有的 todos 被保留，不因再迁移一次而丢', () => {
    const result = migrate({
      version: 4,
      sites: [],
      records: {},
      todos: { '2026-10-07': [{ id: 't1', text: '写作业', done: true }] },
    })
    expect(result.todos).toEqual({
      '2026-10-07': [{ id: 't1', text: '写作业', done: true }],
    })
  })

  it('v4 数据再迁移一次是幂等的', () => {
    const once = migrate({ version: 3, sites: [], records: {} })
    expect(migrate(once)).toEqual(once)
  })
})

describe('sanitizeTodos', () => {
  it('非对象 → 空对象', () => {
    expect(sanitizeTodos(null)).toEqual({})
    expect(sanitizeTodos('oops')).toEqual({})
    expect(sanitizeTodos(undefined)).toEqual({})
  })

  it('非数组的天 key 被丢弃', () => {
    expect(sanitizeTodos({ '2026-10-07': 'not-array' })).toEqual({})
  })

  it('丢弃缺 id 或缺 text 的条目', () => {
    const result = sanitizeTodos({
      '2026-10-07': [
        { id: 't1', text: '好的', done: false },
        { text: '没有 id', done: false },
        { id: 't2', done: false },
        { id: 't3', text: 123, done: false },
        'not-an-object',
        42,
      ],
    })
    expect(result['2026-10-07']).toEqual([{ id: 't1', text: '好的', done: false }])
  })

  it('done 缺失或类型不对 → 按未完成处理，但**不丢整条**', () => {
    // 这是一条刻意的宽容：待办正文比勾选状态值钱。
    // 宁可把一个勾过的待办显示成没勾（用户再点一下就是了），
    // 也不能因为 done 字段坏了就把用户写下的字整条扔掉
    const result = sanitizeTodos({
      '2026-10-07': [
        { id: 't1', text: '缺 done' },
        { id: 't2', text: 'done 是字符串', done: 'yes' },
        { id: 't3', text: 'done 正常', done: true },
      ],
    })
    expect(result['2026-10-07']).toEqual([
      { id: 't1', text: '缺 done', done: false },
      { id: 't2', text: 'done 是字符串', done: false },
      { id: 't3', text: 'done 正常', done: true },
    ])
  })

  it('过滤后为空的天 key 不保留', () => {
    expect(sanitizeTodos({ '2026-10-07': [] })).toEqual({})
    expect(sanitizeTodos({ '2026-10-07': ['垃圾'] })).toEqual({})
  })
})

describe('emptyData', () => {
  it('返回当前版本 + 默认站点 + 空 records + 空 todos', () => {
    const data = emptyData()
    expect(data.version).toBe(DATA_VERSION)
    expect(data.sites.length).toBeGreaterThan(0)
    expect(data.records).toEqual({})
    expect(data.todos).toEqual({})
  })
})
describe('sanitizeDiary', () => {
  it('非对象输入返回 {}', () => {
    expect(sanitizeDiary(undefined)).toEqual({})
    expect(sanitizeDiary(null)).toEqual({})
    expect(sanitizeDiary('日记')).toEqual({})
  })

  it('非法日期 key 和非数组的值整组跳过', () => {
    expect(sanitizeDiary({
      broken: [{ id: 'a', text: '正文' }],
      '2026-02-30': [{ id: 'b', text: '正文' }],
      '2026-10-26': '不是数组',
    })).toEqual({})
  })

  it('id 或 text 缺失、类型不对的条目整条丢弃', () => {
    expect(sanitizeDiary({
      '2026-10-26': [
        { text: '没有 id' },
        { id: 'no-text' },
        { id: 1, text: 'id 是数字' },
        { id: 'num-text', text: 42 },
        null,
        '字符串',
        { id: 'ok', text: '留下' },
      ],
    })).toEqual({ '2026-10-26': [{ id: 'ok', text: '留下' }] })
  })

  it('纯空白正文的条目丢弃（正文必填）', () => {
    expect(sanitizeDiary({ '2026-10-26': [{ id: 'a', text: '  \n\t ', title: '只有标题' }] })).toEqual({})
  })

  it('空标题、纯空白标题、非字符串标题都不写 title 字段', () => {
    const result = sanitizeDiary({
      '2026-10-26': [
        { id: 'a', text: '正文', title: '' },
        { id: 'b', text: '正文', title: '   ' },
        { id: 'c', text: '正文', title: 123 },
        { id: 'd', text: '正文', title: '周会' },
      ],
    })
    expect(result['2026-10-26'].map((entry) => 'title' in entry)).toEqual([false, false, false, true])
    expect(result['2026-10-26'][3].title).toBe('周会')
  })

  it('缺 createdAt 或类型不对时保留条目，只是没有时间（正文比元数据值钱）', () => {
    expect(sanitizeDiary({
      '2026-10-26': [
        { id: 'a', text: '老数据' },
        { id: 'b', text: '坏时间', createdAt: 123 },
        { id: 'c', text: '有时间', createdAt: '2026-10-26T08:00:00.000Z' },
      ],
    })).toEqual({
      '2026-10-26': [
        { id: 'a', text: '老数据' },
        { id: 'b', text: '坏时间' },
        { id: 'c', text: '有时间', createdAt: '2026-10-26T08:00:00.000Z' },
      ],
    })
  })

  it('同一天重复 id 只保留第一条', () => {
    expect(sanitizeDiary({ '2026-10-26': [{ id: 'a', text: '第一条' }, { id: 'a', text: '第二条' }] }))
      .toEqual({ '2026-10-26': [{ id: 'a', text: '第一条' }] })
  })

  it('不保留未知字段', () => {
    expect(sanitizeDiary({ '2026-10-26': [{ id: 'a', text: '正文', extra: '多余' }] }))
      .toEqual({ '2026-10-26': [{ id: 'a', text: '正文' }] })
  })

  it('过滤后为空的天不留 key', () => {
    expect(sanitizeDiary({ '2026-10-25': [], '2026-10-26': [{ id: '', text: '空 id' }] })).toEqual({})
  })
})

describe('droppedEntries：日记', () => {
  const base = () => ({ ...emptyData(), diary: {} as Record<string, unknown[]> })

  it('一条读不回来的日记计 1', () => {
    expect(droppedEntries({ ...base(), diary: { '2026-10-26': [{ id: 'a', text: '好的' }, { id: 'b' }] } })).toBe(1)
  })

  it('纯空白正文的日记计入丢弃 —— 和 sanitizeDiary 同一把尺子', () => {
    // sanitizeDiary 会丢掉它；droppedEntries 若不计入，这条就是「静默丢失」：
    // 被洗掉了却没进保护模式，用户也不会被提醒先下载原始数据
    const raw = { ...base(), diary: { '2026-10-26': [{ id: 'a', text: '   \n ' }] } }
    expect(sanitizeDiary(raw.diary)).toEqual({})
    expect(droppedEntries(raw)).toBe(1)
  })

  it('重复 id 不算丢弃（内容还在，不能触发保护模式，见 MY-ISSUES #13）', () => {
    expect(droppedEntries({ ...base(), diary: { '2026-10-26': [{ id: 'a', text: '一' }, { id: 'a', text: '二' }] } })).toBe(0)
  })

  it('缺 createdAt / title 不算丢弃', () => {
    expect(droppedEntries({ ...base(), diary: { '2026-10-26': [{ id: 'a', text: '老数据' }, { id: 'b', text: '坏标题', title: 1 }] } })).toBe(0)
  })

  it('非法日期 key 下的条目整组计入', () => {
    expect(droppedEntries({ ...base(), diary: { broken: [{ id: 'a', text: '一' }, { id: 'b', text: '二' }] } })).toBe(2)
  })

  it('某天的值不是数组计 1', () => {
    expect(droppedEntries({ ...base(), diary: { '2026-10-26': '坏' } })).toBe(1)
  })
})

describe('dataProblem：日记字段', () => {
  const { diary: _drop, ...withoutDiary } = emptyData()

  it('v7 数据缺 diary 报错', () => {
    expect(dataProblem({ ...withoutDiary, version: 7 })).toBe('日记数据格式错误')
  })

  it('v7 数据 diary 是数组也报错', () => {
    expect(dataProblem({ ...withoutDiary, version: 7, diary: [] })).toBe('日记数据格式错误')
  })

  it('v6 数据没有 diary 是正常的', () => {
    expect(dataProblem({ ...withoutDiary, version: 6 })).toBeNull()
  })

  it('当前版本的完整空数据没有问题', () => {
    expect(dataProblem(emptyData())).toBeNull()
  })
})

describe('v6 → v7：新增 diary 字段', () => {
  it('v6 数据升级后 version 是 7，diary 是 {}，其余字段不变', () => {
    const { diary: _drop, ...v6 } = { ...emptyData(), version: 6, records: { '2026-10-25': ['jd-com'] } }
    const result = migrate(v6)
    expect(result.version).toBe(7)
    expect(result.diary).toEqual({})
    expect(result.records).toEqual({ '2026-10-25': ['jd-com'] })
  })

  it('v7 数据的日记原样保留', () => {
    const diary = {
      '2026-10-26': [
        { id: 'a', title: '周会', text: '  缩进\n\n空行', createdAt: '2026-10-26T08:00:00.000Z' },
        { id: 'b', text: '没有标题' },
      ],
    }
    expect(migrate({ ...emptyData(), diary }).diary).toEqual(diary)
  })

  it('v1 数据仍能一路升到当前版本，diary 为 {}', () => {
    const result = migrate({ version: 1, records: { '2026-10-01': ['bilibili'] } })
    expect(result.version).toBe(DATA_VERSION)
    expect(result.diary).toEqual({})
    expect(result.records).toEqual({ '2026-10-01': ['bilibili-com'] })
  })
})

describe('emptyData：日记', () => {
  it('带空的 diary', () => {
    expect(emptyData().diary).toEqual({})
  })
})
