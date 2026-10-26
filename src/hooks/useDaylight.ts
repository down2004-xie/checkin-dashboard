import { useEffect } from 'react'

import { resolvePalette } from '../lib/daylight'
import type { Preferences } from '../types'

/**
 * 时间驱动的配色 + 明暗外观 —— 沉浸光感的主力。
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
 *
 * v6 起 appearance 也在这里落：它同时
 * (1) 在 <html> 上写 data-appearance，让 CSS 切换玻璃/文字/输入框等整套变量；
 * (2) 参与 resolvePalette 选明暗色板。
 * 两者必须同时生效 —— 只改变量不换色板（或反之）都会得到「浅底白字」这种崩坏画面。
 */
export function useDaylight(
  theme: Preferences['theme'] = 'auto',
  appearance: Preferences['appearance'] = 'dark',
) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.appearance = appearance

    const apply = () => {
      const palette = resolvePalette(theme, appearance)
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
  }, [theme, appearance])
}
