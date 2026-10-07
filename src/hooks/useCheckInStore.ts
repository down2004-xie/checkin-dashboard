import { useCallback, useEffect, useReducer, useState } from 'react'

import type { CheckInData, DateKey, Site, Todo } from '../types'
import { applyAction } from '../lib/reducer'
import { loadData, saveData } from '../lib/storage'

/**
 * 签到状态的唯一数据源。
 *
 * 设计要点：
 * 1. 读用 useReducer 的惰性初始化 —— 首次渲染才读一次 localStorage，
 *    而不是每次渲染都读（localStorage 是同步 API，频繁调用会阻塞主线程）。
 * 2. 写收敛到 lib/reducer.ts 的纯函数里：applyAction 的签名恰好就是
 *    (state, action) => newState，可以直接当 React 的 reducer 用。
 * 3. 对外只暴露语义化操作，不暴露 dispatch，防止组件绕过纯函数直接改状态。
 *
 * saveError 为什么需要：localStorage 在隐私模式下写入会抛异常。
 * 静默失败最糟 —— 用户签了一整天，关掉浏览器全没了还以为存上了。
 */
export function useCheckInStore() {
  const [data, dispatch] = useReducer(
    applyAction,
    undefined,
    () => loadData(),
  )
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    const ok = saveData(data)
    setSaveError(!ok)
  }, [data])

  const toggle = useCallback(
    (day: DateKey, siteId: string) => dispatch({ type: 'toggled', day, siteId }),
    [],
  )

  /** 新增站点（表单校验通过后调用）。 */
  const addSite = useCallback(
    (site: Site) => dispatch({ type: 'siteAdded', site }),
    [],
  )

  /** 批量新增站点（书签导入）。一次 dispatch 写完，不做 N 次循环。 */
  const addSites = useCallback(
    (sites: Site[]) => dispatch({ type: 'sitesAdded', sites }),
    [],
  )

  /** 修改站点。id 不可改，patch 里带 id 会被忽略（见 reducer）。 */
  const updateSite = useCallback(
    (id: string, patch: Partial<Site>) => dispatch({ type: 'siteUpdated', id, patch }),
    [],
  )

  /** 删除站点。历史签到记录保留，见 reducer 注释。 */
  const removeSite = useCallback(
    (id: string) => dispatch({ type: 'siteRemoved', id }),
    [],
  )

  /** 整体替换数据。用于导入备份。 */
  const replaceAll = useCallback(
    (next: CheckInData) => dispatch({ type: 'replaced', data: next }),
    [],
  )

  /**
   * 新增待办。传入的 todo 由调用方用 `createTodo()` 造好（id 在里面生成）——
   * 这里不代劳，是为了让「怎么造一条待办」这件事只有一个出处（lib/todo.ts），
   * hook 只负责把它 dispatch 出去。
   */
  const addTodo = useCallback(
    (day: DateKey, todo: Todo) => dispatch({ type: 'todoAdded', day, todo }),
    [],
  )

  /** 勾选 / 取消勾选一条待办 */
  const toggleTodo = useCallback(
    (day: DateKey, id: string) => dispatch({ type: 'todoToggled', day, id }),
    [],
  )

  /** 删除一条待办 */
  const removeTodo = useCallback(
    (day: DateKey, id: string) => dispatch({ type: 'todoRemoved', day, id }),
    [],
  )

  return {
    data,
    toggle,
    addSite,
    addSites,
    updateSite,
    removeSite,
    replaceAll,
    addTodo,
    toggleTodo,
    removeTodo,
    saveError,
  }
}