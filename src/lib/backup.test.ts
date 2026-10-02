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
  return { version: DATA_VERSION, records, sites: [] }
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

    expect(result.backup.data.version).toBe(3)
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
    const a: CheckInData = { version: 1, records: {}, sites: [] }
    const b: CheckInData = { version: 2, records: {}, sites: [] }
    expect(mergeData(a, b).version).toBe(2)
  })

  it('sites 按 id 并集去重，a 的顺序在前', () => {
    const a: CheckInData = {
      version: 2,
      records: {},
      sites: [{ id: 'a', name: 'A', url: 'https://a' }],
    }
    const b: CheckInData = {
      version: 2,
      records: {},
      sites: [
        { id: 'b', name: 'B', url: 'https://b' },
        { id: 'a', name: 'A2', url: 'https://a2' }, // 与 a 里同 id，应被去重（保留 a 的）
      ],
    }
    const merged = mergeData(a, b)
    expect(merged.sites.map((s) => s.id)).toEqual(['a', 'b'])
  })
})
