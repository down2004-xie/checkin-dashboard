import { useCallback } from 'react'

import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 让一张卡片的高光跟随鼠标。
 *
 * 关键的性能决策：
 * 每张卡片各挂一个自己的 onPointerMove，而不是在 window 上统一监听、
 * 再去计算「鼠标在哪张卡上」。原因：
 * - 卡片的 pointermove 只在鼠标真的位于这张卡上时才触发，
 *   20 张卡同时存在也不会互相干扰。
 * - 如果挂在 window 上，每次移动都要遍历所有卡片做命中检测，
 *   而且要给每张卡写 CSS 变量（20 次样式失效），成本高得多。
 *
 * 另一个关键点：用 requestAnimationFrame 节流。
 * pointermove 在高刷屏上每秒能触发 120+ 次，每次都写 CSS 变量会
 * 让浏览器反复重算样式。合并到每帧一次，写入量降到 60 次/秒以下。
 *
 * 用 CSS 变量（--mx/--my）而不是直接改 style.background：
 * 只改变量，渐变的具体写法留在 CSS 里，改视觉不用动 JS。
 */
export function useCardHighlight() {
  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()

    // 记录待写入的值
    pending.set(target, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })

    if (frame !== 0) return
    frame = requestAnimationFrame(flush)
  }, [])

  const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    pending.delete(target)
    // 移除变量，CSS 里的默认值接管，高光淡出
    target.style.removeProperty('--mx')
    target.style.removeProperty('--my')
  }, [])

  return { handlePointerMove, handlePointerLeave }
}

/** 待写入的高光位置，按元素聚合 */
const pending = new Map<HTMLElement, { x: number; y: number }>()

let frame = 0

/** 每帧统一把待写入的值刷到 CSS 变量上 */
function flush() {
  frame = 0
  for (const [element, point] of pending) {
    element.style.setProperty('--mx', `${point.x}px`)
    element.style.setProperty('--my', `${point.y}px`)
  }
  pending.clear()
}
