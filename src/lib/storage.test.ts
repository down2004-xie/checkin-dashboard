import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DATA_VERSION } from '../types'
import { commitAction, emptyData, readData, recoverData, RECOVERY_KEY, STORAGE_KEY } from './storage'

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

describe('protected persistence', () => {
  const today = '2026-10-12'
  let entries: Map<string, string>
  let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    entries = new Map()
    storage = {
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }),
      removeItem: vi.fn((key: string) => { entries.delete(key) }),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('navigator', {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not write while loading a new browser', () => {
    expect(readData().issue).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['{broken', JSON.stringify({ ...emptyData(), version: DATA_VERSION + 1 }), JSON.stringify({ ...emptyData(), records: [] })])('preserves malformed or unsupported storage', async (raw) => {
    entries.set(STORAGE_KEY, raw)
    expect(readData().issue).not.toBeNull()
    expect((await commitAction({ type: 'dayStarted', day: today }, today, raw)).ok).toBe(false)
    expect(entries.get(STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not enter protection mode for data that only needed dedupe', () => {
    // 老版本可能写下过重复的站点 id。去重后内容一点没少，页面必须照常可用 ——
    // 保护模式会禁用整个管理区并拒绝写入，代价很重，不能拿它当「洗过数据」的信号。
    const raw = JSON.stringify({ ...emptyData(), records: { [today]: ['a', 'a'] } })
    entries.set(STORAGE_KEY, raw)
    const snapshot = readData()
    expect(snapshot.data.records[today]).toEqual(['a'])
    expect(snapshot.issue).toBeNull()
    expect(entries.get(STORAGE_KEY)).toBe(raw)
  })

  it('enters protection mode when entries really could not be read', () => {
    // 对照上面：`5` 不是合法 id，这条记录**真的**取不回来了，
    // 必须停下来让用户先下载原始数据。
    entries.set(STORAGE_KEY, JSON.stringify({ ...emptyData(), records: { [today]: ['a', 5] } }))
    expect(readData().issue).not.toBeNull()
  })

  it('surfaces denied reads without attempting a write', () => {
    storage.getItem.mockImplementation(() => { throw new Error('denied') })
    expect(readData().issue).not.toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not show unsaved changes when quota is exhausted', async () => {
    const data = emptyData()
    const raw = JSON.stringify(data)
    entries.set(STORAGE_KEY, raw)
    storage.setItem.mockImplementation(() => { throw new Error('quota') })
    const result = await commitAction({ type: 'checkedSet', day: today, siteId: data.sites[0].id, checked: true }, today, raw)
    expect(result.ok).toBe(false)
    expect(result.snapshot.data.records).toEqual({})
    expect(entries.get(STORAGE_KEY)).toBe(raw)
  })

  it('refuses stale writes when the browser has no locks API', async () => {
    const original = JSON.stringify(emptyData())
    const next = emptyData()
    next.records[today] = [next.sites[0].id]
    entries.set(STORAGE_KEY, JSON.stringify(next))
    const result = await commitAction({ type: 'dayStarted', day: today }, today, original)
    expect(result.ok).toBe(false)
    expect(result.snapshot.data.records).toEqual(next.records)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('serializes concurrent tabs and rebases actions on the latest persisted state', async () => {
    let queue: Promise<unknown> = Promise.resolve()
    vi.stubGlobal('navigator', { locks: { request: (_name: string, operation: () => unknown) => {
      const next = queue.then(operation)
      queue = next.catch(() => undefined)
      return next
    } } })
    const data = emptyData()
    const raw = JSON.stringify(data)
    entries.set(STORAGE_KEY, raw)
    const results = await Promise.all(data.sites.slice(0, 2).map((site) => commitAction({ type: 'checkedSet', day: today, siteId: site.id, checked: true }, today, raw)))
    expect(results.every((result) => result.ok)).toBe(true)
    expect(readData().data.records[today]).toEqual(data.sites.slice(0, 2).map((site) => site.id))
  })

  it('archives the original before an explicit recovery', async () => {
    entries.set(STORAGE_KEY, '{broken')
    expect((await recoverData(emptyData(), '{broken')).ok).toBe(true)
    expect(entries.get(RECOVERY_KEY)).toBe('{broken')
    expect(readData().issue).toBeNull()
  })

  it('refuses recovery when the original changed after confirmation', async () => {
    entries.set(STORAGE_KEY, '{newer')
    expect((await recoverData(emptyData(), '{older')).ok).toBe(false)
    expect(entries.get(STORAGE_KEY)).toBe('{newer')
  })

  it('preserves original content if the safety copy cannot be stored', async () => {
    entries.set(STORAGE_KEY, '{broken')
    storage.setItem.mockImplementation(() => { throw new Error('quota') })
    expect((await recoverData(emptyData(), '{broken')).ok).toBe(false)
    expect(entries.get(STORAGE_KEY)).toBe('{broken')
  })

  it('does not persist day snapshots repeatedly if unchanged', async () => {
    const result = await commitAction({ type: 'dayStarted', day: today }, today, null)
    expect(result.ok).toBe(true)
    storage.setItem.mockClear()
    expect((await commitAction({ type: 'dayStarted', day: today }, today, result.snapshot.raw)).ok).toBe(true)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
