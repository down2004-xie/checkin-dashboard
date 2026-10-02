import { describe, expect, it } from 'vitest'

import type { BookmarkGroup } from './bookmarks'
import { planImport } from './bookmarks'

/**
 * 只测 planImport。
 *
 * parseBookmarks 依赖 DOMParser，而 Vitest 默认跑在 node 环境，没有这个 API
 * （项目也刻意不引入 jsdom）。那一层靠浏览器里实际导一次书签来验收，
 * 样本见 fixtures/sample-bookmarks.html。
 * 这么拆的好处是：有风险的部分（DOM 解析）很小，剩下全是可回归的纯逻辑。
 */

const SELECT_ALL = new Set(['购物', '视频', ''])

function group(name: string, items: [string, string][]): BookmarkGroup {
  return { name, items: items.map(([n, url]) => ({ name: n, url })) }
}

const EMPTY = new Set<string>()

describe('planImport — 文件夹筛选', () => {
  const groups = [
    group('购物', [['京东', 'https://www.jd.com/']]),
    group('视频', [['哔哩哔哩', 'https://www.bilibili.com/']]),
  ]

  it('只导入勾选的文件夹', () => {
    const plan = planImport(groups, new Set(['购物']), EMPTY)
    expect(plan.sites.map((s) => s.name)).toEqual(['京东'])
  })

  it('一个都不勾 → 空结果', () => {
    const plan = planImport(groups, EMPTY, EMPTY)
    expect(plan.sites).toEqual([])
    expect(plan.duplicate).toBe(0)
  })

  it('文件夹名变成 category', () => {
    const plan = planImport(groups, SELECT_ALL, EMPTY)
    expect(plan.sites.every((s) => s.category !== undefined)).toBe(true)
    expect(plan.sites[0].category).toBe('购物')
  })

  it('未分类分组（name 为 ""）不带 category 字段', () => {
    const plan = planImport(
      [group('', [['某站', 'https://a.com/']])],
      new Set(['']),
      EMPTY,
    )
    expect(plan.sites).toHaveLength(1)
    // 关键：字段要整个不存在，而不是 category: undefined —— 保持一致才不多存垃圾
    expect('category' in plan.sites[0]).toBe(false)
  })
})

describe('planImport — 去重（按域名）', () => {
  it('域名已存在 → 跳过，并计入 duplicate', () => {
    const groups = [
      group('购物', [
        ['京东', 'https://www.jd.com/'],
        ['淘宝', 'https://www.taobao.com/'],
      ]),
    ]
    const plan = planImport(groups, new Set(['购物']), new Set(['jd-com']))

    expect(plan.sites.map((s) => s.name)).toEqual(['淘宝'])
    expect(plan.duplicate).toBe(1)
  })

  it('按域名去重，不按名字 —— 改了名的同一个站仍被跳过', () => {
    const groups = [group('购物', [['京东(签到)', 'https://www.jd.com/']])]
    const plan = planImport(groups, new Set(['购物']), new Set(['jd-com']))
    expect(plan.sites).toEqual([])
    expect(plan.duplicate).toBe(1)
  })

  it('域名相同但写法不同 → 是同一个站，只导一次', () => {
    // v3 之前这里靠「规范化过的地址集合」判重，还踩过
    // 「种子站点没结尾斜杠、书签有」的坑（见 MY-ISSUES #5）。
    // 改成域名身份后，斜杠 / path / www. 的差异被天然吞掉。
    const groups = [
      group('购物', [['京东首页', 'https://jd.com/']]),
      group('常用', [['京东商城', 'https://www.jd.com/index.html']]),
    ]
    const plan = planImport(groups, new Set(['购物', '常用']), EMPTY)
    expect(plan.sites).toHaveLength(1)
    expect(plan.sites[0].category).toBe('购物') // 先出现的文件夹赢
    expect(plan.duplicate).toBe(1)
  })

  it('带 www. 和不带 www. 是同一个站', () => {
    const groups = [group('视频', [['哔哩哔哩', 'https://bilibili.com/']])]
    const plan = planImport(groups, new Set(['视频']), EMPTY)
    expect(plan.sites[0].id).toBe('bilibili-com')
  })

  it('子域名是另一个站，不会被误合并', () => {
    const groups = [
      group('音乐', [['网易云音乐', 'https://music.163.com/']]),
      group('门户', [['网易', 'https://www.163.com/']]),
    ]
    const plan = planImport(groups, new Set(['音乐', '门户']), EMPTY)
    expect(plan.sites.map((s) => s.id)).toEqual(['music-163-com', '163-com'])
  })
})

describe('planImport — id 生成', () => {
  it('英文名也按域名算 id，不按名字', () => {
    const plan = planImport(
      [group('开发', [['GitHub', 'https://github.com/']])],
      new Set(['开发']),
      EMPTY,
    )
    expect(plan.sites[0].id).toBe('github-com')
  })

  it('中文名同样按域名算 id', () => {
    const plan = planImport(
      [group('购物', [['京东', 'https://www.jd.com/']])],
      new Set(['购物']),
      EMPTY,
    )
    expect(plan.sites[0].id).toBe('jd-com')
  })

  it('改名不影响 id —— 同一个站删掉再导回来仍拿到同一个 id', () => {
    // 这是 v3 改造要解决的核心问题：id 不能随名字变，
    // 否则「删掉再加能接回历史」就是空话
    const first = planImport(
      [group('购物', [['京东', 'https://www.jd.com/']])],
      new Set(['购物']),
      EMPTY,
    )
    const renamed = planImport(
      [group('购物', [['京东商城（每日签到）', 'https://www.jd.com/']])],
      new Set(['购物']),
      EMPTY,
    )
    expect(renamed.sites[0].id).toBe(first.sites[0].id)
  })

  it('不再有 -2 编号：域名撞车就是重复站，直接跳过', () => {
    const plan = planImport(
      [group('开发', [['GitHub', 'https://github.com/']])],
      new Set(['开发']),
      new Set(['github-com']),
    )
    expect(plan.sites).toEqual([])
    expect(plan.duplicate).toBe(1)
  })

  it('同名但域名不同的中文书签也能拿到不同 id', () => {
    const plan = planImport(
      [
        group('购物', [
          ['签到', 'https://www.jd.com/'],
          ['签到', 'https://www.taobao.com/'],
        ]),
      ],
      new Set(['购物']),
      EMPTY,
    )
    expect(plan.sites.map((s) => s.id)).toEqual(['jd-com', 'taobao-com'])
  })

  it('书签地址取不到域名 → 丢弃并计入 duplicate，不写非法 id', () => {
    // parseBookmarks 已经用 normalizeUrl 过滤过一轮，正常到不了这里；
    // 这条是兜底，防止 planImport 被直接调用时写进空 id
    const plan = planImport(
      [group('杂', [['坏地址', 'https://']])],
      new Set(['杂']),
      EMPTY,
    )
    expect(plan.sites).toEqual([])
    expect(plan.duplicate).toBe(1)
  })
})

describe('planImport — 不可变性', () => {
  it('不修改传入的 existingIds', () => {
    const existingIds = new Set(['github-com'])
    const before = [...existingIds]

    planImport(
      [group('开发', [['淘宝', 'https://www.taobao.com/']])],
      new Set(['开发']),
      existingIds,
    )

    expect([...existingIds]).toEqual(before)
  })
})
