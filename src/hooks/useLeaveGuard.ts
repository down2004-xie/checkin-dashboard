import { useEffect } from 'react'

/**
 * 有未保存内容时，关页 / 刷新前弹浏览器自带的「确定离开？」提醒。
 *
 * 为什么**按需挂、用完就摘**，而不是一直挂着、在回调里判断要不要弹：
 * 1. 只要页面上挂着 beforeunload 监听，浏览器就可能不把它放进往返缓存（bfcache），
 *    后退/前进会变成整页重载。只在「真的有未保存内容」那一小段时间挂，代价就只落在那一段。
 * 2. 正常关页（没写东西、或自动保存已完成）时根本没有监听，就不可能误弹。
 *
 * 「什么算未保存」不在这里判断，由调用方传进来（判据在 `lib/diary.ts` 的 `hasUnsavedDraft`）。
 * 这个 hook 只管「挂 / 摘」这一件事。
 *
 * 两个浏览器限制，不是本项目能改的：
 * - 提示文字是浏览器固定的，页面不能自定义（防钓鱼，现代浏览器都忽略自定义文字）。
 * - 用户从没和页面交互过时浏览器不弹。这里不影响：能产生未保存内容，必然已经打过字。
 *
 * 写法参考 MDN「Window: beforeunload event」：`preventDefault()` 是标准写法，
 * `returnValue` 是给老版本 Chrome / Edge 的兼容写法，两个都写。
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
