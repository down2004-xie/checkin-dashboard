import { useEffect } from 'react'

import { paletteForNow } from '../lib/daylight'

/**
 * 时间驱动的配色 —— 沉浸光感的主力。
 *
 * 为什么这是「光感」的核心而不是传感器：
 * 环境光传感器（AmbientLightSensor）是实验性 API，
 * 桌面浏览器基本没有，手机上也要用户授权，靠不住。
 * 而「什么时间就什么色调」是纯客户端启发式，零依赖、全平台可用，
 * 用户对沉浸感的感知主要来自这里。
 *
 * 实现方式：把色板写进 :root 的 CSS 变量，
 * 由 tokens.css / global.css 里的规则消费。
 * 这样 JS 只负责「改几个变量」，具体怎么用是 CSS 的事。
 */
export function useDaylight() {
  useEffect(() => {
    const apply = () => {
      const palette = paletteForNow()
      const root = document.documentElement
      root.style.setProperty('--bg-1', palette.bg1)
      root.style.setProperty('--bg-2', palette.bg2)
      root.style.setProperty('--bg-3', palette.bg3)
      root.style.setProperty('--glow', palette.glow)
      root.style.setProperty('--accent', palette.accent)
    }

    apply()

    // 每 5 分钟检查一次时段是否变化。
    // 不需要更频繁：时段边界是按小时划分的，5 分钟粒度足够，
    // 而每次 apply 都会触发一次背景过渡动画，太频繁反而干扰。
    const id = window.setInterval(apply, 5 * 60_000)
    return () => window.clearInterval(id)
  }, [])
}
