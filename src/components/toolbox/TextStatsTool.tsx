import { useMemo, useState } from 'react'

import { analyzeText } from '../../lib/text-stats'

/**
 * 文本字数统计工具。
 *
 * 逻辑全在 lib/text-stats.ts（有单测），这里只做受控 textarea + 结果展示。
 * 用 useMemo 而不是 useState 存统计结果：结果是文本的**派生值**，
 * 存进 state 就有了第二个真源，会出现「改了文本统计没跟上」的失同步。
 * 无持久化：不保存用户输入的文本。
 */
export function TextStatsTool() {
  const [text, setText] = useState('')
  const stats = useMemo(() => analyzeText(text), [text])

  const cards: { label: string; value: number }[] = [
    { label: '字符数', value: stats.chars },
    { label: '汉字', value: stats.chinese },
    { label: '英文单词', value: stats.words },
    { label: '数字串', value: stats.numbers },
    { label: '行数', value: stats.lines },
    { label: '段落', value: stats.paragraphs },
  ]

  return (
    <div className="tool-panel">
      <label className="unit-field text-stats-input">
        <span className="unit-field__label">粘贴或输入文本</span>
        <textarea className="site-form__input random-textarea" aria-label="待统计文本" value={text}
          placeholder="在此粘贴文本，实时统计…" onChange={(event) => setText(event.target.value)} />
      </label>

      <div className="stat-grid" aria-live="polite">
        {cards.map((card) => (
          <div key={card.label} className="stat-tile">
            <span className="stat-tile__value">{card.value}</span>
            <span className="stat-tile__label">{card.label}</span>
          </div>
        ))}
        <div className="stat-tile stat-tile--wide">
          <span className="stat-tile__value">{stats.readingMinutes}</span>
          <span className="stat-tile__label">分钟（预计阅读时长）</span>
        </div>
      </div>

      <p className="hint">中文按字计、英文按词计（中英混排会分开统计）。文本只在本机处理，不会上传，也不保存。</p>
    </div>
  )
}
