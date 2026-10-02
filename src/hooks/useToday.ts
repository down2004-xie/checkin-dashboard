import { useEffect, useState } from 'react'

import type { DateKey } from '../types'
import { todayKey } from '../lib/date'

/**
 * 返回「今天」的日期 key，并在跨零点时自动更新。
 *
 * 为什么需要这个 hook：
 * 签到应用最典型的 bug 是「页面开着过了一夜，昨天的勾还在」。
 * 用户晚上没关标签页，第二天早上打开看到昨天全部签完，
 * 以为今天也签了 —— 实际没签，连续记录就断了。
 *
 * 实现取舍：
 * - 用 setInterval 每分钟检查一次，而不是精确计算到零点的 setTimeout。
 *   原因：系统休眠/唤醒、时区变更、用户手动改系统时间，
 *   都会让「距离零点还有多少毫秒」这个计算失准。
 *   每分钟轮询一次的成本可以忽略，但能天然容忍这些情况。
 * - 日期没变时返回同一个引用（prev），React 会跳过重渲染。
 */
export function useToday(): DateKey {
  const [today, setToday] = useState<DateKey>(() => todayKey())

  useEffect(() => {
    const id = window.setInterval(() => {
      setToday((prev) => {
        const next = todayKey()
        // 返回同一引用 → React bail out，不触发重渲染
        return next === prev ? prev : next
      })
    }, 60_000)

    return () => window.clearInterval(id)
  }, [])

  return today
}
