import { useEffect, useLayoutEffect } from 'react'

/**
 * 「离开会丢东西」的两道提醒，由同一个 hook 管理：
 *
 * 1. **关页**（关标签页、刷新、地址栏跳走）：挂 `beforeunload`，弹浏览器自带的「确定离开？」。
 * 2. **切视图**（签到 / 日记 / 工具箱 / 以后新加的页面）：登记进一份模块级的「未保存名单」，
 *    `App` 里唯一的切视图入口 `navigate()` 调 `confirmLeaveView()` 查这份名单。
 *
 * 为什么切视图的提醒也放在这里，而不是让 `App` 判断「是不是从日记页离开」：
 * 「谁有未保存内容」只有组件自己知道。让 `App` 按页面名判断，以后每加一个带草稿的页面
 * 都得回来改 `App`，漏一处就静默丢字。反过来让组件**自己登记**，`App` 只问「名单里有没有人」，
 * 从哪页去哪页都不用关心 —— 新页面接入切视图确认的成本是零。
 *
 * 为什么**按需挂、用完就摘**，而不是一直挂着、在回调里判断：
 * - 只要挂着 beforeunload，浏览器就可能不把页面放进往返缓存（bfcache），后退 / 前进会整页重载。
 * - 正常情况下（没写东西、已经保存）名单是空的、监听也没挂，就不可能误弹。
 *
 * 「什么算未保存」不在这里判断，由调用方传进来（日记的判据在 `lib/diary.ts` 的 `hasUnsavedDraft`）。
 *
 * 浏览器限制，不是本项目能改的：beforeunload 的提示文字由浏览器决定，页面不能自定义；
 * 用户从没和页面交互过时浏览器不弹（这里不影响：能产生未保存内容，必然已经打过字）。
 * 写法参考 MDN「Window: beforeunload event」：`preventDefault()` 是标准写法，
 * `returnValue` 是给老版本 Chrome / Edge 的兼容写法，两个都写。
 */

export interface LeaveGuard {
  /** 关页 / 刷新时会不会丢东西 */
  pageClose: boolean
  /** 切到别的视图时会不会丢东西（组件被卸载） */
  viewSwitch: boolean
}

/** 当前「切视图会丢东西」的组件。每个组件登记一个独立的 token，互不覆盖 */
const viewBlockers = new Set<symbol>()

/**
 * 切视图前调用：没有未保存内容直接放行；有就弹确认，用户点「确定」才放行。
 *
 * 用 `window.confirm` 而不是自己画弹窗：它会阻塞，返回值就是用户的选择，
 * 调用方一行 `if (!confirmLeaveView()) return` 就能拦住；而且和关页提醒一样是浏览器原生的，
 * 用户一眼认得出这是「要离开了」。
 */
export function confirmLeaveView(): boolean {
  if (viewBlockers.size === 0) return true
  return window.confirm('还有没保存的内容，离开这个页面后会丢失。确定离开吗？')
}

export function useLeaveGuard({ pageClose, viewSwitch }: LeaveGuard): void {
  useEffect(() => {
    if (!pageClose) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pageClose])

  // 用 useLayoutEffect 而不是 useEffect：layout effect 在提交时同步执行，
  // 保证名单在用户能点下一个按钮之前就更新好了。
  // 普通 useEffect 在非用户事件触发的更新（比如异步保存失败后 setState）里会延后到绘制之后，
  // 中间有一小段空窗：这时点切视图，名单还没更新，就会放行、丢字。
  useLayoutEffect(() => {
    if (!viewSwitch) return
    const token = Symbol('leave-guard')
    viewBlockers.add(token)
    // 组件卸载（用户确认离开）或内容已保存时撤销登记
    return () => { viewBlockers.delete(token) }
  }, [viewSwitch])
}
