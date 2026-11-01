import { useEffect, useRef, useState } from 'react'
import type { DiaryEntry } from '../types'
import { countWords, formatEntryTime, hasUnsavedDraft } from '../lib/diary'
import { useLeaveGuard } from '../hooks/useLeaveGuard'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

interface Draft {
  title: string
  text: string
}

interface DiaryEntryItemProps {
  entry: DiaryEntry
  readOnly: boolean
  /** 搜索结果跳转过来时高亮并滚到这一条 */
  focused: boolean
  onSave: (patch: Draft) => Promise<boolean>
  onRemove: () => void
}

/** 停止输入多久后自动保存。太短等于逐字写盘，太长又容易在关页面时丢字 */
const AUTOSAVE_MS = 600

/**
 * 一条日记：查看态 + 编辑态。
 *
 * 编辑态的草稿**只存在本地 state**，只在点「编辑」那一刻从 entry 初始化一次。
 * 原因：useCheckInStore 在窗口获得焦点时会重新读存储、换掉 data 引用，
 * 如果草稿跟着 props 走，用户切个窗口回来，正在写的字就被存储里的旧版本顶掉了。
 *
 * 保存走防抖：每次输入只改内存，停手 600ms（或失焦）才提交一次 diaryUpdated。
 * 每次提交都会把整份数据序列化写进 localStorage，逐字提交会让打字明显卡顿。
 */
export function DiaryEntryItem({ entry, readOnly, focused, onSave, onRemove }: DiaryEntryItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>({ title: '', text: '' })
  const [state, setState] = useState<SaveState>('idle')
  /**
   * 「上次成功保存之后，有没有失败过」。和 state 分开记：失败后用户接着打字，
   * update() 会把 state 改回 'idle'（界面显示「有改动」），但存储问题多半还在。
   * 只看 state 的话，这时切视图会放行，卸载时补交再失败，草稿就没了。
   */
  const [failedSinceSave, setFailedSinceSave] = useState(false)
  const itemRef = useRef<HTMLElement>(null)

  // 下面几个 ref 给定时器、失焦、卸载这些「拿不到最新 state 的回调」用
  const draftRef = useRef(draft)
  const savedRef = useRef<Draft>({ title: '', text: '' })
  const editingRef = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const seq = useRef(0)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const isDirty = () => draftRef.current.title !== savedRef.current.title || draftRef.current.text !== savedRef.current.text

  const commit = async (): Promise<boolean> => {
    window.clearTimeout(timer.current)
    if (!isDirty()) return true
    const snapshot = draftRef.current
    // 正文清空时不提交（reducer 也会拒绝）：留在编辑态，提示用户
    if (!snapshot.text.trim()) return false
    const id = ++seq.current
    setState('saving')
    const ok = await onSaveRef.current(snapshot)
    if (ok) savedRef.current = snapshot
    // 只让最后一次提交决定状态，避免慢的旧请求把新状态盖掉
    if (id === seq.current) {
      setState(ok ? (isDirty() ? 'idle' : 'saved') : 'failed')
      setFailedSinceSave(!ok)
    }
    return ok
  }

  const update = (patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    setState('idle')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void commit(), AUTOSAVE_MS)
  }

  const startEdit = () => {
    const initial = { title: entry.title ?? '', text: entry.text }
    draftRef.current = initial
    savedRef.current = initial
    editingRef.current = true
    setDraft(initial)
    setState('idle')
    setFailedSinceSave(false)
    setEditing(true)
  }

  const finish = async () => {
    if (await commit()) {
      editingRef.current = false
      setEditing(false)
      setState('idle')
    }
  }

  // 卸载（切走视图、换日期）前把没提交的草稿交出去；页面被隐藏/关闭时也尽力提交一次
  useEffect(() => {
    const flush = () => { if (editingRef.current && isDirty()) void commit() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
    // commit / isDirty 只读 ref，挂一次就够
  }, [])

  // 两种离开的风险不一样，所以分开判断：
  // - 关页：页面马上被销毁，卸载时补交的那次异步保存浏览器不保证等完，所以只要草稿和
  //   已保存版本不同就提醒（停笔等自动保存的 600ms、保存进行中、保存失败）。
  // - 切视图：页面还活着，卸载时补交的保存能跑完（见下面卸载时的 flush），正常情况下不丢字，
  //   不需要打扰用户。只有**上次成功保存后失败过**才拦 —— 补交大概率还会失败，切走草稿就没了。
  // 自动保存一成功 savedRef 就追上草稿，提醒随之摘掉。
  // savedRef 在 commit 成功后、setState 之前更新，所以这里在渲染时读到的总是最新值。
  const unsaved = editing && hasUnsavedDraft(draft, savedRef.current)
  useLeaveGuard({ pageClose: unsaved, viewSwitch: unsaved && failedSinceSave })

  useEffect(() => {
    if (focused) itemRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])
  const time = formatEntryTime(entry.createdAt)
  const shown = editing ? draft.text : entry.text
  const emptyText = editing && !draft.text.trim()
  const status = emptyText ? '正文不能为空，清空后不会保存（想删请点删除）'
    : state === 'saving' ? '保存中…'
    : state === 'saved' ? '已保存'
    : state === 'failed' ? '未保存'
    : isDirty() ? '有改动，停笔后自动保存' : ''

  return (
    <article ref={itemRef} className={`diary-entry${focused ? ' diary-entry--focused' : ''}`} data-entry-id={entry.id}>
      <header className="diary-entry__head">
        <div className="diary-entry__meta">
          {!editing && entry.title && <h3 className="diary-entry__title">{entry.title}</h3>}
          <span className="diary-entry__info">{time ?? '时间未知'} · {countWords(shown)} 字</span>
        </div>
        {!editing && (
          <div className="diary-entry__actions">
            <button type="button" className="chip" disabled={readOnly} onClick={startEdit} aria-label={`编辑日记 ${entry.title ?? ''}`.trim()}>编辑</button>
            <button type="button" className="chip" disabled={readOnly} onClick={onRemove} aria-label={`删除日记 ${entry.title ?? ''}`.trim()}>删除</button>
          </div>
        )}
      </header>
      {editing ? (
        <div className="diary-entry__editor">
          <input className="site-form__input diary__title-input" value={draft.title} maxLength={100} placeholder="标题（可选）"
            aria-label="编辑日记标题" disabled={readOnly}
            onChange={(event) => update({ title: event.target.value })} onBlur={() => void commit()} />
          <textarea className="site-form__input diary__textarea" value={draft.text} rows={6} autoFocus
            aria-label="编辑日记正文" disabled={readOnly}
            onChange={(event) => update({ text: event.target.value })} onBlur={() => void commit()} />
          <div className="diary-entry__status-row">
            <span className={`diary__status${state === 'failed' || emptyText ? ' diary__status--warn' : ''}`} role="status">{status}</span>
            {state === 'failed' && <button type="button" className="chip" onClick={() => void commit()}>重试</button>}
            <button type="button" className="btn btn--primary" disabled={readOnly || emptyText || state === 'saving'} onClick={() => void finish()}>完成</button>
          </div>
        </div>
      ) : <p className="diary-entry__text">{entry.text}</p>}
    </article>
  )
}
