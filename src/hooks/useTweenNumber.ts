import { useEffect, useRef, useState } from 'react'

import { easeOutCubic } from '../lib/tween'

/**
 * 数字补间：目标值变化时，返回值在 duration 内从旧值缓动到新值。
 *
 * 为什么用 JS 补间而不是 CSS transition：
 * 进度环是 conic-gradient，CSS 对渐变过渡基本不插值（直接跳变）；
 * 百分比文字更是纯文本，CSS 无能为力。弧和文字由同一个补间值驱动，
 * 永远同步 —— 这比「弧走 CSS、文字走 JS」少一种失步的可能。
 *
 * 三个刻意的行为：
 * 1. 首帧直接是 target（useState(target)）—— 页面加载时不从 0 滚上来，
 *    和勾选动画「加载不重播」是同一条原则。
 * 2. 目标中途再变，从当前显示值接着滚（displayRef），不会跳变。
 * 3. prefers-reduced-motion 下直接跳到终值，不播。
 */
export function useTweenNumber(target: number, duration = 450): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)

  useEffect(() => {
    const from = displayRef.current
    if (from === target) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    const start = performance.now()
    /** 每轮 effect 自己的 frame 句柄，cleanup 只取消自己这一轮 */
    let frame = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const value = from + (target - from) * easeOutCubic(t)
      displayRef.current = value
      setDisplay(value)
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return display
}
