import { useState, type KeyboardEvent } from 'react'
import type { DateKey } from '../types'
import { countWords, hasUnsavedDraft } from '../lib/diary'
import { useLeaveGuard } from '../hooks/useLeaveGuard'

interface DiaryComposerProps {
  day: DateKey
  today: DateKey
  readOnly: boolean
  onAdd: (title: string, text: string) => Promise<boolean>
}

/**
 * 新建日记的表单。
 *
 * 草稿刻意**不随日期切换清空**：用户写到一半去翻了翻昨天，回来不该发现字没了。
 * 代价是草稿会写进「当前正在看的那一天」，所以按钮上明确写出日期。
 *
 * 保存成功才清空；失败保留草稿并提示（日记比签到勾珍贵，宁可多留不可丢）。
 */
export function DiaryComposer({ day, today, readOnly, onAdd }: DiaryComposerProps) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const canSave = !readOnly && !saving && text.trim() !== ''
  // 新建框不自动保存，正文写了字没点保存就关页会全丢 —— 这是最需要提醒的地方。
  // 保存成功会清空表单，提醒随之摘掉；保存失败草稿还在，提醒保留。
  useLeaveGuard(hasUnsavedDraft({ title, text }, { title: '', text: '' }))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setFailed(false)
    const ok = await onAdd(title, text)
    setSaving(false)
    if (ok) {
      setTitle('')
      setText('')
    } else {
      setFailed(true)
    }
  }

  // Ctrl+Enter（macOS 上是 Cmd+Enter）保存，和多数写作工具的习惯一致；单独回车留给换行
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void save()
    }
  }

  return (
    <form className="diary-composer" aria-label="写日记" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <input className="site-form__input diary__title-input" value={title} maxLength={100} disabled={readOnly}
        placeholder="标题（可选，比如「周会纪要」「实习第 12 天」）" aria-label="日记标题"
        onChange={(event) => setTitle(event.target.value)} onKeyDown={onKeyDown} />
      <textarea className="site-form__input diary__textarea" value={text} rows={5} disabled={readOnly}
        placeholder="今天发生了什么？会议、实习日志、随手记，写什么都行" aria-label="日记正文"
        onChange={(event) => { setText(event.target.value); setFailed(false) }} onKeyDown={onKeyDown} />
      <div className="diary-composer__actions">
        <span className={`diary__status${failed ? ' diary__status--warn' : ''}`} role="status">
          {failed ? '保存失败，草稿已保留，可以再试一次' : text ? `${countWords(text)} 字 · Ctrl+Enter 保存` : ''}
        </span>
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          {saving ? '保存中…' : day === today ? '保存到今天' : `保存到 ${day}`}
        </button>
      </div>
    </form>
  )
}
