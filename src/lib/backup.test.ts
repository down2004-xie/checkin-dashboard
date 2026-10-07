import { describe, expect, it } from 'vitest'

import type { CheckInData } from '../types'
import { DATA_VERSION } from '../types'
import {
  backupFilename,
  createBackup,
  mergeData,
  parseBackup,
  serializeBackup,
} from './backup'

function makeData(records: Record<string, string[]>): CheckInData {
  return { version: DATA_VERSION, records, sites: [], todos: {} }
}

describe('createBackup / serializeBackup', () => {
  it('生成的备份带应用标识和导出时间', () => {
    const backup = createBackup(makeData({}), new Date('2026-10-02T00:00:00Z'))
    expect(backup.app).toBe('checkin-dashboard')
    expect(backup.exportedAt).toBe('2026-10-02T00:00:00.000Z')
  })

  it('序列化后能被 JSON.parse 还原', () => {
    const data = makeData({ '2026-10-02': ['a'] })
    const text = serializeBackup(createBackup(data))
    expect(JSON.parse(text).data).toEqual(data)
  })
})

describe('backupFilename', () => {
  it('包含补零后的日期', () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe('checkin-backup-2026-01-05.json')
  })

  it('用本地日期而不是 UTC', () => {
    // 本地 10 月 2 日凌晨，UTC 还是 10 月 1 日
    expect(backupFilename(new Date(2026, 9, 2, 1, 0))).toBe(
      'checkin-backup-2026-10-02.json',
    )
  })
})

describe('parseBackup', () => {
  it('合法备份解析成功', () => {
    const data = makeData({ '2026-10-02': ['a'] })
    const text = serializeBackup(createBackup(data))
    const result = parseBackup(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.data).toEqual(data)
  })

  it('非 JSON 文本被拒绝', () => {
    const result = parseBackup('这不是 json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('JSON')
  })

  it('合法 JSON 但不是本应用的备份 → 拒绝', () => {
    // 关键场景：用户误选了一个别的 JSON 文件
    const result = parseBackup('{"foo": 1}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('本应用')
  })

  it('缺少 data 字段 → 拒绝', () => {
    const result = parseBackup('{"app":"checkin-dashboard"}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('缺少')
  })

  it('缺少 version → 拒绝', () => {
    const result = parseBackup(
      '{"app":"checkin-dashboard","data":{"records":{}}}',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('版本号')
  })

  it('records 不是对象 → 拒绝', () => {
    const result = parseBackup(
      '{"app":"checkin-dashboard","data":{"version":1,"records":"oops"}}',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('记录')
  })

  it('顶层是数组 → 拒绝', () => {
    const result = parseBackup('[1,2,3]')
    expect(result.ok).toBe(false)
  })

  it('version 1 老备份能被迁移导入，且历史记录的 id 被正确接续', () => {
    // v1 备份里没有 sites 字段（站点是硬编码的），导入时要播种默认站点。
    // 关键是 records 里的旧 id（'bilibili'）必须被映射成新身份（'bilibili-com'）。
    //
    // 这条测试守着一条很容易写错的链：如果 v1→v2 那一步直接播种**当前**的
    // SITES（id 已经是域名形态），后面的 v2→v3 重写映射表就认不出 'bilibili'，
    // 这条记录会变成孤儿 —— v1 用户升级后历史全部归零，而且不报任何错。
    const legacy = JSON.stringify({
      app: 'checkin-dashboard',
      exportedAt: '2026-09-30T00:00:00.000Z',
      data: { version: 1, records: { '2026-10-01': ['bilibili'] } },
    })
    const result = parseBackup(legacy)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.backup.data.version).toBe(DATA_VERSION)
    expect(result.backup.data.sites.length).toBeGreaterThan(0)
    expect(result.backup.data.records).toEqual({ '2026-10-01': ['bilibili-com'] })

    // 光看 records 不够 —— 还得确认这个 id 真的对得上一个存在的站点，
    // 否则「没变成孤儿」只是巧合
    const ids = result.backup.data.sites.map((s) => s.id)
    expect(ids).toContain('bilibili-com')
  })

  it('备份版本比当前应用新 → 拒绝', () => {
    const result = parseBackup(
      '{"app":"checkin-dashboard","data":{"version":99,"records":{},"sites":[]}}',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('新')
  })
})

describe('mergeData', () => {
  it('合并两份不重叠的数据', () => {
    const a = makeData({ '2026-10-01': ['x'] })
    const b = makeData({ '2026-10-02': ['y'] })
    expect(mergeData(a, b).records).toEqual({
      '2026-10-01': ['x'],
      '2026-10-02': ['y'],
    })
  })

  it('同一天的站点 id 取并集并去重', () => {
    const a = makeData({ '2026-10-01': ['x', 'y'] })
    const b = makeData({ '2026-10-01': ['y', 'z'] })
    const merged = mergeData(a, b).records['2026-10-01']
    expect(merged.sort()).toEqual(['x', 'y', 'z'])
  })

  it('合并不会丢失任何一边的记录', () => {
    const a = makeData({ '2026-09-01': ['a'], '2026-09-02': ['a'] })
    const b = makeData({ '2026-09-03': ['b'] })
    const merged = mergeData(a, b)
    expect(Object.keys(merged.records).sort()).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
  })

  it('空数据合并不改变原数据', () => {
    const a = makeData({ '2026-10-01': ['x'] })
    expect(mergeData(a, makeData({})).records).toEqual(a.records)
  })

  it('版本号取较大值', () => {
    const a: CheckInData = { version: 1, records: {}, sites: [], todos: {} }
    const b: CheckInData = { version: 2, records: {}, sites: [], todos: {} }
    expect(mergeData(a, b).version).toBe(2)
  })

  it('sites 按 id 并集去重，a 的顺序在前', () => {
    const a: CheckInData = {
      version: 2,
      records: {},
      sites: [{ id: 'a', name: 'A', url: 'https://a' }],
      todos: {},
    }
    const b: CheckInData = {
      version: 2,
      records: {},
      sites: [
        { id: 'b', name: 'B', url: 'https://b' },
        { id: 'a', name: 'A2', url: 'https://a2' }, // 与 a 里同 id，应被去重（保留 a 的）
      ],
      todos: {},
    }
    const merged = mergeData(a, b)
    expect(merged.sites.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('mergeData 合并待办', () => {
  const todo = (id: string, text: string, done = false) => ({ id, text, done })

  function withTodos(todos: Record<string, { id: string; text: string; done: boolean }[]>) {
    return { version: DATA_VERSION, records: {}, sites: [], todos }
  }

  it('两边不同天的待办都保留', () => {
    const a = withTodos({ '2026-10-07': [todo('t1', 'A')] })
    const b = withTodos({ '2026-10-08': [todo('t2', 'B')] })
    expect(Object.keys(mergeData(a, b).todos).sort()).toEqual([
      '2026-10-07',
      '2026-10-08',
    ])
  })

  it('同一天的待办取并集，不是一边覆盖另一边', () => {
    const a = withTodos({ '2026-10-07': [todo('t1', 'A')] })
    const b = withTodos({ '2026-10-07': [todo('t2', 'B')] })
    expect(mergeData(a, b).todos['2026-10-07'].map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('同 id 去重', () => {
    const a = withTodos({ '2026-10-07': [todo('t1', 'A')] })
    const b = withTodos({ '2026-10-07': [todo('t1', 'A')] })
    expect(mergeData(a, b).todos['2026-10-07']).toHaveLength(1)
  })

  it('一边没有 todos → 不改变另一边', () => {
    const a = withTodos({ '2026-10-07': [todo('t1', 'A')] })
    const b = withTodos({})
    expect(mergeData(a, b).todos).toEqual(a.todos)
    expect(mergeData(b, a).todos).toEqual(a.todos)
  })

  it('端到端：导出再导入，待办一条不少', () => {
    // 这条守着「给 CheckInData 加字段时，别忘了 mergeData 也要合并它」。
    // 漏掉的后果是静默丢数据：导入成功、页面正常，但待办全没了。
    const data = withTodos({
      '2026-10-07': [todo('t1', '写作业', true), todo('t2', '买牛奶')],
    })
    const result = parseBackup(serializeBackup(createBackup(data)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.data.todos).toEqual(data.todos)
  })
})
