import type { CheckInData, DateKey } from '../types'
import { dataProblem, droppedEntries, emptyData, migrate } from './migrate'
import { applyAction, snapshotDay, type CheckInAction } from './reducer'

export const STORAGE_KEY = 'checkin-dashboard:data'
export const RECOVERY_KEY = 'checkin-dashboard:recovery'

export interface StorageSnapshot {
  data: CheckInData
  raw: string | null
  issue: string | null
}

export interface SaveResult {
  ok: boolean
  snapshot: StorageSnapshot
  error?: string
}

export function readData(): StorageSnapshot {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { data: emptyData(), raw, issue: null }
    const parsed: unknown = JSON.parse(raw)
    const problem = dataProblem(parsed)
    if (problem) return { data: emptyData(), raw, issue: problem }
    const dropped = droppedEntries(parsed)
    return {
      data: migrate(parsed), raw,
      issue: dropped > 0 ? `检测到 ${dropped} 条无法读取的数据，已停止自动保存，请先下载原始数据` : null,
    }
  } catch {
    return { data: emptyData(), raw, issue: raw === null ? '无法读取浏览器存储，请检查站点权限' : '存储内容不是有效 JSON，原始数据已保留' }
  }
}

export function loadData(): CheckInData {
  return readData().data
}

export function saveData(data: CheckInData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

async function withStorageLock(operation: () => SaveResult): Promise<SaveResult> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(STORAGE_KEY, operation)
  }
  return operation()
}

export async function commitAction(action: CheckInAction, day: DateKey, expectedRaw: string | null): Promise<SaveResult> {
  return withStorageLock(() => {
    const snapshot = readData()
    if (snapshot.issue) return { ok: false, snapshot, error: snapshot.issue }
    if ((typeof navigator === 'undefined' || !navigator.locks) && snapshot.raw !== expectedRaw) {
      return { ok: false, snapshot, error: '其他页面更新了数据，已刷新当前页面，请重试本次操作' }
    }
    const next = snapshotDay(applyAction(snapshot.data, action), day)
    const raw = JSON.stringify(next)
    if (raw === snapshot.raw) return { ok: true, snapshot }
    if (!saveData(next)) return { ok: false, snapshot, error: '保存失败，操作未生效。请检查存储空间或浏览器权限，并导出备份' }
    return { ok: true, snapshot: { data: next, raw, issue: null } }
  })
}

export async function recoverData(data: CheckInData, expectedRaw: string | null): Promise<SaveResult> {
  return withStorageLock(() => {
    const snapshot = readData()
    if (snapshot.raw !== expectedRaw) return { ok: false, snapshot, error: '数据已被其他页面更改，请重新检查后再恢复' }
    try {
      if (snapshot.raw !== null) localStorage.setItem(RECOVERY_KEY, snapshot.raw)
      if (!saveData(data)) throw new Error('save failed')
      return { ok: true, snapshot: { data, raw: JSON.stringify(data), issue: null } }
    } catch {
      return { ok: false, snapshot, error: '无法安全保存恢复数据，原始数据未被主动清除。请下载备份后检查存储权限' }
    }
  })
}

export function clearData(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export { emptyData }
