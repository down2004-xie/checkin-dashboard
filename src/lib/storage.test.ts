import { describe, expect, it } from 'vitest'

import { DATA_VERSION } from '../types'
import { emptyData } from './storage'

/**
 * 这里只测纯函数部分（emptyData）。
 *
 * loadData / saveData 依赖 localStorage，属于浏览器环境。
 * 测试它们需要 jsdom 环境或手动 mock globalThis.localStorage，
 * 留到接入测试环境时再补 —— 先把纯逻辑覆盖住。
 */
describe('emptyData', () => {
  it('返回当前版本号、默认站点和空 records', () => {
    const data = emptyData()
    expect(data.version).toBe(DATA_VERSION)
    expect(data.sites.length).toBeGreaterThan(0) // 新用户第一次打开能看到示例站点
    expect(data.records).toEqual({})
  })

  it('每次调用返回新对象，不共享引用', () => {
    // 如果共享同一个对象，一处修改会污染所有「空数据」
    const a = emptyData()
    const b = emptyData()
    a.records['2026-10-02'] = ['x']
    expect(b.records).toEqual({})
  })
})
