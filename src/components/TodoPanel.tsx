import { useState, type FormEvent } from 'react'

import type { Todo } from '../types'
import { createTodo } from '../lib/todo'

interface TodoPanelProps {
  /** 今天的待办清单（已经按天取好，组件不管日期） */
  todos: Todo[]
  /** 新增一条。todo 由本组件用 createTodo 造好 */
  onAdd: (todo: Todo) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

/**
 * 今日待办面板。
 *
 * 只显示「今天」—— 待办按天存在 localStorage 里，但这一版不做历史浏览。
 * 理由：待办是「今天要做什么」的即时清单，翻昨天的待办没有意义
 * （没做完的应该今天重新记一条，而不是从昨天捞）。
 * 历史数据仍在存储里，以后想加「回顾」随时能加。
 *
 * 组件不 import 任何 lib 里的状态逻辑，只接收已算好的数据和回调 ——
 * 日期换算、dispatch 都留在 App 层，这里保持成纯展示 + 一个本地输入框状态。
 */
export function TodoPanel({ todos, onAdd, onToggle, onRemove }: TodoPanelProps) {
  const [text, setText] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    // 只存正文，不存空白。用户敲几个空格回车不该产生一条空待办
    const trimmed = text.trim()
    if (trimmed === '') return

    onAdd(createTodo(trimmed))
    setText('')
  }

  const doneCount = todos.filter((t) => t.done).length

  return (
    <section className="todo">
      <header className="todo__head">
        <h2 className="todo__title">今日待办</h2>
        {todos.length > 0 && (
          <span className="todo__count">
            {doneCount}/{todos.length}
          </span>
        )}
      </header>

      {/* 用 form 而不是「输入框 + 按钮各挂 onClick」：
          这样按回车也能提交，且语义正确（屏幕阅读器会念成表单） */}
      <form className="todo__form" onSubmit={handleSubmit}>
        <input
          className="todo__input"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="今天要做什么？回车添加"
          aria-label="新增待办"
        />
        <button className="btn btn--primary" type="submit">
          添加
        </button>
      </form>

      {todos.length === 0 ? (
        <p className="todo__empty">今天还没有待办</p>
      ) : (
        <ul className="todo__list">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`todo__item${todo.done ? ' todo__item--done' : ''}`}
            >
              <button
                type="button"
                className="todo__check"
                onClick={() => onToggle(todo.id)}
                aria-pressed={todo.done}
                aria-label={todo.done ? `取消完成 ${todo.text}` : `标记完成 ${todo.text}`}
              >
                {todo.done ? '✓' : ''}
              </button>

              <span className="todo__text">{todo.text}</span>

              <button
                type="button"
                className="todo__remove"
                onClick={() => onRemove(todo.id)}
                aria-label={`删除待办 ${todo.text}`}
                title="删除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
