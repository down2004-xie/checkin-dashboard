import { useMemo, useState } from 'react'
import type { DateKey, DiaryEntry } from '../types'
import type { CheckInAction } from '../lib/reducer'
import { addDays, isDateKey, parseDateKey } from '../lib/date'
import { createDiaryEntry, diaryDays, previewText, searchDiary, sortDiary } from '../lib/diary'
import { DiaryComposer } from './DiaryComposer'
import { DiaryEntryItem } from './DiaryEntryItem'

interface DiaryViewProps {
  diary: Record<DateKey, DiaryEntry[]>
  today: DateKey
  /** 数据保护模式：只能看，不能写 */
  readOnly: boolean
  /** 最近一次写入失败的原因（来自 useCheckInStore），日记视图里也要让用户看到 */
  error: string | null
  run: (action: CheckInAction) => Promise<boolean>
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const RECENT_DAYS = 7

/**
 * 电子日记视图（第三个视图，和签到、工具箱平级）。
 *
 * 「正在看哪一天」存成 `selected: DateKey | null`，null 表示「跟着今天走」：
 * 页面开着跨过零点时，没手动选过日期的用户会自然切到新的一天，
 * 不需要额外的 effect 去同步 today。
 */
export function DiaryView({ diary, today, readOnly, error, run }: DiaryViewProps) {
  const [selected, setSelected] = useState<DateKey | null>(null)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ day: DateKey; entry: DiaryEntry; index: number } | null>(null)

  // 不允许看/写未来的日记：选中的日期超过今天就按今天算
  const day = selected !== null && selected < today ? selected : today
  const entries = useMemo(() => sortDiary(diary[day] ?? []), [diary, day])
  const hits = useMemo(() => searchDiary(diary, query), [diary, query])
  const days = useMemo(() => diaryDays(diary), [diary])
  const total = useMemo(() => Object.values(diary).reduce((sum, items) => sum + items.length, 0), [diary])

  const goTo = (next: DateKey | null, focus: string | null = null) => {
    setSelected(next === null || next >= today ? null : next)
    setFocusId(focus)
  }

  const remove = async (entry: DiaryEntry) => {
    // 撤销要放回**存储里的原位置**，不是排序后的显示位置
    const index = (diary[day] ?? []).findIndex((item) => item.id === entry.id)
    if (await run({ type: 'diaryRemoved', day, id: entry.id })) setUndo({ day, entry, index })
  }

  const restore = async () => {
    if (!undo) return
    if (await run({ type: 'diaryRestored', ...undo })) {
      goTo(undo.day, undo.entry.id)
      setUndo(null)
    }
  }

  const weekday = WEEKDAYS[parseDateKey(day).getDay()]

  return (
    <section className="diary" aria-label="电子日记">
      <header className="diary__head">
        <div>
          <h1 className="diary__heading">电子日记</h1>
          <p className="diary__subtitle">实习日志、会议纪要、随手记都可以写在这里 · 共 {days.length} 天 {total} 条，只存在本机，记得定期导出备份</p>
        </div>
        <input type="search" className="site-form__input diary__search" aria-label="搜索日记" placeholder="搜索标题或正文…"
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </header>

      {readOnly && <p className="alert" role="alert">数据处于保护模式，日记暂时只能查看，不能新增或修改。请回到「签到」页处理。</p>}
      {error && !readOnly && <p className="alert" role="alert">{error}</p>}
      {undo && (
        <div className="notice" role="status">
          <span>已删除「{undo.entry.title ?? previewText(undo.entry.text, 20)}」</span>
          <button type="button" className="chip" disabled={readOnly} onClick={() => void restore()}>撤销</button>
          <button type="button" className="chip" onClick={() => setUndo(null)} aria-label="关闭撤销提示">×</button>
        </div>
      )}

      {query.trim() ? (
        <div className="diary__panel" aria-label="搜索结果">
          <h2 className="diary__panel-title">搜索「{query.trim()}」· {hits.length} 条</h2>
          {hits.length === 0 ? <p className="diary__empty">没有找到匹配的日记</p> : (
            <ul className="diary-hits">
              {hits.map(({ day: hitDay, entry }) => (
                <li key={entry.id}>
                  <button type="button" className="diary-hit" onClick={() => { goTo(hitDay, entry.id); setQuery('') }}>
                    <span className="diary-hit__day">{hitDay}</span>
                    {entry.title && <span className="diary-hit__title">{entry.title}</span>}
                    <span className="diary-hit__preview">{previewText(entry.text)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <nav className="diary-nav" aria-label="切换日期">
            <button type="button" className="chip" onClick={() => goTo(addDays(day, -1))}>← 前一天</button>
            <input type="date" className="site-form__input diary-nav__date" aria-label="选择日期" value={day} max={today}
              onChange={(event) => { if (isDateKey(event.target.value)) goTo(event.target.value) }} />
            <button type="button" className="chip" disabled={day >= today} onClick={() => goTo(addDays(day, 1))}>后一天 →</button>
            {day !== today && <button type="button" className="chip" onClick={() => goTo(null)}>回到今天</button>}
          </nav>
          {days.length > 0 && (
            <div className="filter diary-recent" role="group" aria-label="最近写过日记的日子">
              {days.slice(0, RECENT_DAYS).map((item) => (
                <button key={item} type="button" className={`chip${item === day ? ' chip--active' : ''}`} aria-pressed={item === day}
                  onClick={() => goTo(item)}>{item.slice(5)} · {diary[item].length}</button>
              ))}
            </div>
          )}

          <div className="diary__panel">
            <h2 className="diary__panel-title">{day === today ? '今天' : day} · {weekday} · {entries.length} 条</h2>
            {entries.length === 0 && <p className="diary__empty">{day === today ? '今天还没有写日记' : '这一天没有日记'}</p>}
            <div className="diary__list">
              {entries.map((entry) => (
                <DiaryEntryItem key={entry.id} entry={entry} readOnly={readOnly} focused={entry.id === focusId}
                  onSave={(patch) => run({ type: 'diaryUpdated', day, id: entry.id, patch })}
                  onRemove={() => void remove(entry)} />
              ))}
            </div>
            <DiaryComposer day={day} today={today} readOnly={readOnly}
              onAdd={(title, text) => run({ type: 'diaryAdded', day, entry: createDiaryEntry(text, title) })} />
          </div>
        </>
      )}
    </section>
  )
}
