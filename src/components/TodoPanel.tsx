import { useState, type FormEvent } from 'react'
import type { Todo } from '../types'
import { createTodo } from '../lib/todo'

interface TodoPanelProps {
  todos: Todo[]
  carryCount: number
  onAdd: (todo: Todo) => Promise<boolean>
  onToggle: (id: string, done: boolean) => void
  onRemove: (todo: Todo, index: number) => void
  onEdit: (id: string, text: string) => Promise<boolean>
  onCarry: () => void
}

export function TodoPanel({ todos, carryCount, onAdd, onToggle, onRemove, onEdit, onCarry }: TodoPanelProps) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const doneCount = todos.filter((todo) => todo.done).length

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (text.trim() && await onAdd(createTodo(text.trim()))) setText('')
  }

  return (
    <section className="todo" aria-label="今日待办">
      <header className="todo__head"><h2 className="todo__title">今日待办</h2><span className="todo__count">{doneCount}/{todos.length}</span></header>
      <form className="todo__form" onSubmit={(event) => void submit(event)}>
        <input className="todo__input" value={text} onChange={(event) => setText(event.target.value)}
          maxLength={500} placeholder="今天要做什么？回车添加" aria-label="新增待办" />
        <button className="btn btn--primary" type="submit">添加</button>
      </form>
      <div className="toolbar todo-toolbar">
        {carryCount > 0 && <button type="button" className="chip" onClick={onCarry}>带入昨天未完成的 {carryCount} 项</button>}
        {doneCount > 0 && <button type="button" className="chip" aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)}>{hideDone ? '显示' : '折叠'}已完成 ({doneCount})</button>}
      </div>
      {!todos.length && <p className="todo__empty">今天还没有待办</p>}
      {!!todos.length && hideDone && doneCount === todos.length && <p className="todo__empty">今天的待办全部完成了</p>}
      <ul className="todo__list">
        {todos.map((todo, index) => hideDone && todo.done ? null : (
          <li key={todo.id} className={`todo__item${todo.done ? ' todo__item--done' : ''}`}>
            <button type="button" className="todo__check" aria-pressed={todo.done}
              aria-label={todo.done ? `取消完成 ${todo.text}` : `标记完成 ${todo.text}`} onClick={() => onToggle(todo.id, !todo.done)}>{todo.done ? '✓' : ''}</button>
            {editing === todo.id ? (
              <form className="todo-edit" onSubmit={async (event) => { event.preventDefault(); if (await onEdit(todo.id, draft)) setEditing(null) }}>
                <input className="site-form__input" autoFocus aria-label="编辑待办内容" maxLength={500} value={draft}
                  onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }} />
                <button className="chip" type="submit" disabled={!draft.trim()}>保存</button>
                <button className="chip" type="button" onClick={() => setEditing(null)}>取消</button>
              </form>
            ) : <span className="todo__text">{todo.text}{todo.carriedFrom && <small className="hint">（从 {todo.carriedFrom} 带入）</small>}</span>}
            <button className="todo-edit-button" type="button" aria-label={`编辑待办 ${todo.text}`} onClick={() => { setEditing(todo.id); setDraft(todo.text) }}>✎</button>
            <button className="todo__remove" type="button" aria-label={`删除待办 ${todo.text}`} onClick={() => onRemove(todo, index)}>×</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
