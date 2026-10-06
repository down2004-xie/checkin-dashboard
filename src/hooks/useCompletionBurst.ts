import { useEffect, useRef, useState } from 'react'

/**
 * 捕捉「今天从没签完 → 刚刚签完」的那一瞬间。
 *
 * 为什么不能直接用 `done === total`：
 * 那是个**状态**，不是**事件**。直接拿它当触发条件，
 * 结果会是「只要保持满签，花瓣就一直重新爆」——
 * 而且因为它同时是真值，页面一加载就满签的话会立刻炸一次烟花，
 * 用户什么都没做却收到了庆祝。
 *
 * 所以这里用 ref 记住上一次的值，只在 true/false **翻转**时自增计数。
 *
 * @returns 已经庆祝过几次。0 表示本次会话还没满签过。
 */
export function useCompletionBurst(done: number, total: number): number {
  const allDone = total > 0 && done === total

  const [burstId, setBurstId] = useState(0)

  // 初值就是当前状态，不是 false。
  // 这样「一进页面就是满签」不会被当成一次翻转 —— 那是回访，
  // 不是刚刚完成的动作，不该放烟花
  const wasDone = useRef(allDone)

  useEffect(() => {
    if (allDone && !wasDone.current) {
      setBurstId((n) => n + 1)
    }
    wasDone.current = allDone
  }, [allDone])

  return burstId
}
