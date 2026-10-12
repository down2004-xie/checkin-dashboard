import { useCallback, useEffect, useRef, useState } from 'react'
import type { CheckInData, DateKey } from '../types'
import type { CheckInAction } from '../lib/reducer'
import { commitAction, readData, recoverData, STORAGE_KEY, type SaveResult } from '../lib/storage'

export function useCheckInStore(today: DateKey) {
  const [snapshot, setSnapshot] = useState(readData)
  const current = useRef(snapshot)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const queue = useRef(Promise.resolve())

  const accept = useCallback((result: SaveResult) => {
    current.current = result.snapshot
    setSnapshot(result.snapshot)
    setError(result.error ?? null)
    return result.ok
  }, [])

  const run = useCallback((action: CheckInAction): Promise<boolean> => {
    setPending((count) => count + 1)
    const operation = queue.current.then(async () => {
      try {
        /**
         * `current.current.raw` 是**在队列闭包执行时**读的，不是 `run()` 被调用时 ——
         * 这一点必须保住。队列是串行的，连着点两下时第二次 `run()` 会在第一次
         * 还没写盘前就被调用；如果在那时就把 raw 取出来当「期望值」，
         * 没有 `navigator.locks` 的浏览器上 `commitAction` 的陈旧写入检查
         * 会把第二次操作判成「其他页面更新了数据」而静默不保存。
         * 改动这里时别把参数提到 `.then()` 外面去。
         */
        return accept(await commitAction(action, today, current.current.raw))
      } catch {
        setError('未能获取存储写入权限，本次操作没有保存，请重试')
        return false
      } finally {
        setPending((count) => count - 1)
      }
    })
    queue.current = operation.then(() => undefined)
    return operation
  }, [accept, today])

  const refresh = useCallback(() => {
    const next = readData()
    current.current = next
    setSnapshot(next)
    setError(null)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!current.current.issue) void run({ type: 'dayStarted', day: today })
  }, [run, today])

  const recover = useCallback(async (data: CheckInData, expectedRaw: string | null) => {
    setPending((count) => count + 1)
    try {
      await queue.current
      return accept(await recoverData(data, expectedRaw))
    } catch {
      setError('恢复失败，请保留原始文件并检查浏览器权限')
      return false
    } finally {
      setPending((count) => count - 1)
    }
  }, [accept])

  return { data: snapshot.data, issue: snapshot.issue, raw: snapshot.raw, error, busy: pending > 0, run, recover, refresh }
}
