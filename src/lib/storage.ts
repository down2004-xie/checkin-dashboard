import type { CheckInData } from '../types'
import { emptyData, migrate } from './migrate'

/**
 * localStorage 读写层。
 *
 * 铁律：组件里不许直接碰 localStorage，一律走这里。
 * 原因：localStorage 只能存字符串，读出来要 JSON.parse，
 * 而用户可能手动改过、可能是旧版本格式、可能是别的网站写坏的值。
 * 这些防御逻辑必须收在一处，否则会散落到每个组件里。
 */

const STORAGE_KEY = 'checkin-dashboard:data'

/** 读取全部签到数据。任何异常都返回空数据，不抛错。 */
export function loadData(): CheckInData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return emptyData()
    return migrate(JSON.parse(raw))
  } catch {
    // JSON 坏了或 localStorage 被禁用（隐私模式），都当作没有数据
    return emptyData()
  }
}

/**
 * 写入全部签到数据。
 *
 * 返回是否成功。写失败时**不抛错**，因为调用方（React 渲染流程）
 * 无法有意义地处理它 —— 但要让调用方能知道、以便提示用户
 * 「数据没保存成功」。
 *
 * 常见失败原因：隐私模式、存储配额满、用户禁用了站点数据。
 */
export function saveData(data: CheckInData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/** 清空所有签到数据。用于「重置」功能，需二次确认后调用。 */
export function clearData(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

// emptyData 从 migrate.ts 迁来后继续从这里导出，外部引用不必改
export { emptyData }
export { STORAGE_KEY }
