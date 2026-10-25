import { describe, expect, it } from 'vitest'

import type { ShareSite } from '../data/share-sites'
import { filterShareSites, groupByCategory } from './share-sites'

/** 造一条测试数据：只有 id/category 必填，其余给默认值，让用例聚焦在被测行为上 */
function make(id: string, category: string, name = id, description = ''): ShareSite {
  return { id, name, url: `https://${id}.com`, description, category }
}

// 分类刻意交叉排列（设计、开发、设计、灵感、开发），用来验证「组顺序首次出现」和「组内原序」
const sample: ShareSite[] = [
  make('a', '设计', 'Alpha', '配色工具'),
  make('b', '开发', 'Beta', '在线编辑器'),
  make('c', '设计', 'Gamma', '图片处理'),
  make('d', '灵感', 'Delta', '灵感收藏'),
  make('e', '开发', 'Epsilon', '代码试验场'),
]

describe('groupByCategory', () => {
  it('按分类分组：同类归到同一组', () => {
    const groups = groupByCategory(sample)
    const design = groups.find((group) => group.category === '设计')
    expect(design?.sites.map((site) => site.id)).toEqual(['a', 'c'])
  })

  it('组顺序按分类首次出现的顺序（不是字典序）', () => {
    const groups = groupByCategory(sample)
    expect(groups.map((group) => group.category)).toEqual(['设计', '开发', '灵感'])
  })

  it('组内保持原始顺序', () => {
    const groups = groupByCategory(sample)
    const dev = groups.find((group) => group.category === '开发')
    expect(dev?.sites.map((site) => site.id)).toEqual(['b', 'e'])
  })

  it('空数组返回空分组', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('filterShareSites', () => {
  it('命中名称（大小写不敏感）', () => {
    expect(filterShareSites(sample, 'alpha').map((site) => site.id)).toEqual(['a'])
  })

  it('命中描述', () => {
    expect(filterShareSites(sample, '配色').map((site) => site.id)).toEqual(['a'])
  })

  it('命中分类', () => {
    expect(filterShareSites(sample, '开发').map((site) => site.id)).toEqual(['b', 'e'])
  })

  it('空查询返回全部', () => {
    expect(filterShareSites(sample, '')).toEqual(sample)
  })

  it('纯空白查询也返回全部', () => {
    expect(filterShareSites(sample, '   ')).toEqual(sample)
  })

  it('大小写不敏感：大写关键词也能命中', () => {
    expect(filterShareSites(sample, 'BETA').map((site) => site.id)).toEqual(['b'])
  })

  it('无命中返回空数组', () => {
    expect(filterShareSites(sample, 'zzz')).toEqual([])
  })
})
