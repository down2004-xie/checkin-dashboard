import { useEffect } from 'react'

/**
 * 页面级指针光源。
 *
 * 与卡片高光的区别：
 * - 卡片高光用 pointermove（鼠标停在卡上才触发），只更新那一张卡
 * - 页面光源要跟随鼠标到处移动，所以监听 window 的 pointermove
 *
 * 同样的 rAF 节流：pointermove 在高刷屏每秒 120+ 次，
 * 每次都写 documentElement 的 CSS 变量会让整个页面重算样式。
 * 合并到每帧一次。
 *
 * 移动端没有指针：pointermove 在触摸时也会触发，但手指移开后
 * 光源会停在最后位置。这里在触摸设备上直接不启用，
 * 由 CSS 的 media 查询负责给移动端一个静态的居中光源。
 */
export function usePointerLight() {
  useEffect(() => {
    // 触屏设备跳过：没有持续跟随的指针，跟随效果无意义还费性能
    if (window.matchMedia('(hover: none)').matches) return

    // 尊重「减少动效」偏好
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let x = 0
    let y = 0

    const flush = () => {
      frame = 0
      const root = document.documentElement
      root.style.setProperty('--pointer-x', `${x}px`)
      root.style.setProperty('--pointer-y', `${y}px`)
    }

    const onPointerMove = (event: PointerEvent) => {
      x = event.clientX
      y = event.clientY
      if (frame !== 0) return
      frame = requestAnimationFrame(flush)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])
}
