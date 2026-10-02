import { useMemo, useState } from 'react'

import type { BookmarkParseResult } from '../lib/bookmarks'
import { planImport } from '../lib/bookmarks'

interface BookmarkImportProps {
  result: BookmarkParseResult
  /**
   * 现有站点的 id（= 域名派生）。
   * 书签的 id 也由域名派生，所以「id 撞车」恰好等价于「这个站已经有了」——
   * 一个集合就够了，不需要再单独传一份地址名单。
   */
  existingIds: ReadonlySet<string>
  onConfirm: (selected: ReadonlySet<string>) => void
  onCancel: () => void
}

/**
 * 书签导入的文件夹勾选面板。
 *
 * 为什么要有这一步，而不是「解析完直接全导」：
 * 书签里绝大多数不是每天要签到的站。有人存了几百条书签，
 * 全导进来页面就变成一个没法用的链接墙，签到看板本身就废了。
 * 按文件夹勾选让用户能只挑「购物」「签到」这类真正需要的，
 * 导入的意义是省去手输 URL，不是把整个书签库搬过来。
 */
export function BookmarkImport({
  result,
  existingIds,
  onConfirm,
  onCancel,
}: BookmarkImportProps) {
  // 默认全选：用户是主动点的「从书签导入」，全选符合预期，取消掉不要的更省事
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(result.groups.map((g) => g.name)),
  )

  /**
   * 每个文件夹实际能导入几条（已扣掉重复的）。
   *
   * 这里对每个分组单独调一次 planImport，而不是另写一套计数逻辑 ——
   * 计数口径必须和真正导入时完全一致，写第二套必然漂移。
   * 分组单独算和合并起来算，条数是一样的（去重只看域名，与先后顺序无关）。
   */
  const importableByGroup = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of result.groups) {
      const plan = planImport([group], new Set([group.name]), existingIds)
      counts.set(group.name, plan.sites.length)
    }
    return counts
  }, [result.groups, existingIds])

  /** 当前勾选下最终会新增多少 —— 和确认时用的是同一个函数，不会对不上 */
  const preview = useMemo(
    () => planImport(result.groups, selected, existingIds),
    [result.groups, selected, existingIds],
  )

  const toggleGroup = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const allNames = result.groups.map((g) => g.name)

  // 被丢弃的原因分开列，用户才知道该不该去浏览器里整理书签。
  // 注意括号要整体判断，不能跟着第一个条件开 —— 否则「重复」单独出现时会缺左括号。
  const skippedReasons = [
    result.invalid > 0 ? `${result.invalid} 条地址非法` : null,
    result.duplicated > 0 ? `${result.duplicated} 条重复` : null,
  ].filter((reason): reason is string => reason !== null)

  return (
    <div className="bookmark-import">
      <p className="bookmark-import__summary">
        共解析 {result.total} 条，可导入 <strong>{preview.sites.length}</strong> 个站点
        {skippedReasons.length > 0 && `（跳过 ${skippedReasons.join('、')}）`}
      </p>

      <div className="bookmark-import__folders">
        {result.groups.map((group) => {
          const importable = importableByGroup.get(group.name) ?? 0
          const disabled = importable === 0

          return (
            <label
              key={group.name}
              className={`bookmark-import__folder${disabled ? ' is-disabled' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(group.name) && !disabled}
                disabled={disabled}
                onChange={() => toggleGroup(group.name)}
              />
              <span className="bookmark-import__folder-name">
                {group.name === '' ? '未分类' : group.name}
              </span>
              <span className="bookmark-import__folder-count">
                {disabled ? `已全部存在（${group.items.length}）` : `${importable} 条`}
              </span>
            </label>
          )
        })}
      </div>

      <div className="bookmark-import__actions">
        <button
          type="button"
          className="btn"
          onClick={() => setSelected(new Set(allNames))}
        >
          全选
        </button>
        <button type="button" className="btn" onClick={() => setSelected(new Set())}>
          全不选
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={preview.sites.length === 0}
          onClick={() => onConfirm(selected)}
        >
          导入 {preview.sites.length} 个站点
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
