import type { CheckInData } from '../types'
import { DATA_VERSION } from '../types'
import { migrate } from './migrate'

/**
 * 备份导出 / 导入。
 *
 * 为什么这是必需品而不是锦上添花：
 * 本项目不做跨设备同步，数据只存在浏览器 localStorage 里。
 * 用户清一次「浏览数据」、或浏览器在存储压力下回收，
 * 所有签到历史就没了 —— 而连续天数一旦清零是无法恢复的。
 * 导出 JSON 是唯一的数据保险。
 */

export interface Backup {
  /** 备份格式标识，导入时用来确认文件类型 */
  app: 'checkin-dashboard'
  /** 导出时间，ISO 字符串 */
  exportedAt: string
  /** 原始签到数据 */
  data: CheckInData
}

/** 生成备份对象 */
export function createBackup(data: CheckInData, now: Date = new Date()): Backup {
  return {
    app: 'checkin-dashboard',
    exportedAt: now.toISOString(),
    data,
  }
}

/** 把备份序列化成带缩进的 JSON 字符串（缩进是为了人眼可读、可手改） */
export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

/**
 * 备份文件名，格式 checkin-backup-YYYY-MM-DD.json。
 * 带日期是为了多次导出不会互相覆盖，也方便在文件管理器里认。
 */
export function backupFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `checkin-backup-${y}-${m}-${d}.json`
}

export type ParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; reason: string }

/**
 * 解析导入的 JSON 文本。
 *
 * 为什么返回结果对象而不是抛异常：
 * 调用方是 UI 层，需要把失败原因展示给用户（「这不是本应用的备份文件」），
 * 而不是让异常冒泡到 React 渲染里。用可辨识联合类型表达，
 * TypeScript 能强制调用方处理失败分支。
 *
 * 校验点：是不是合法 JSON → 是不是本应用的备份 → 结构是否符合预期。
 * 三者缺一不可，否则用户误选一个任意 JSON 文件就会写坏数据。
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: '文件不是合法的 JSON' }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: '文件内容不是对象' }
  }

  const candidate = raw as Partial<Backup>

  if (candidate.app !== 'checkin-dashboard') {
    return { ok: false, reason: '这不是本应用的备份文件' }
  }

  const data = candidate.data
  if (typeof data !== 'object' || data === null) {
    return { ok: false, reason: '备份文件缺少签到数据' }
  }
  if (typeof data.version !== 'number') {
    return { ok: false, reason: '备份文件缺少版本号' }
  }
  // 只拦「比当前应用新」的版本；旧版本走 migrate 升级
  if (data.version > DATA_VERSION) {
    return { ok: false, reason: '备份文件版本比当前应用新' }
  }
  if (typeof data.records !== 'object' || data.records === null) {
    return { ok: false, reason: '备份文件的签到记录格式不对' }
  }

  // 老版本备份（如 v1）在这里升级成当前版本的数据结构
  const migrated = migrate(data)

  // 显式列出字段而不是展开 candidate：
  // candidate 是 Partial<Backup>，展开后会带进 undefined 类型，
  // 不满足 Backup 里 app 必填的约束。
  return {
    ok: true,
    backup: {
      app: 'checkin-dashboard',
      exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
      data: migrated,
    },
  }
}

/**
 * 合并两份签到数据（导入时用）。
 *
 * 为什么是「合并」而不是「覆盖」：
 * 用户可能在一个新设备上导入旧备份，如果直接覆盖，
 * 新设备上已有的签到记录就丢了。合并是更安全的默认行为。
 *
 * 合并规则：records 同一天取并集（站点 id 去重）；
 * sites 同样按 id 取并集，a 的顺序在前、b 的新 id 追加在后，
 * 这样两边的站点都不会丢，页面顺序也保持稳定。
 */
export function mergeData(a: CheckInData, b: CheckInData): CheckInData {
  const records: Record<string, string[]> = {}

  for (const source of [a, b]) {
    for (const [day, ids] of Object.entries(source.records)) {
      const merged = new Set(records[day] ?? [])
      for (const id of ids) merged.add(id)
      records[day] = Array.from(merged)
    }
  }

  const seenIds = new Set<string>()
  const sites: CheckInData['sites'] = []
  for (const source of [a, b]) {
    for (const site of source.sites) {
      if (seenIds.has(site.id)) continue
      seenIds.add(site.id)
      sites.push(site)
    }
  }

  return { version: Math.max(a.version, b.version), sites, records }
}
