import { useEffect, useMemo, useState } from 'react'

import { MAX_CHARS, MAX_LINES, diffText, type DiffRow } from '../../lib/diff'
import '../../styles/tools/text-diff.css'

/** 统一视图最多渲染多少行。两边各 5000 行全不同会有 1 万行，每行几个节点，一次全挂上去要卡一下 */
const MAX_RENDER_ROWS = 4000
/** 停止输入多久后才重新对比。对比在主线程同步算，大文本每敲一个字算一次会卡输入 */
const SETTLE_MS = 250

const SIGN: Record<DiffRow['kind'], string> = { equal: ' ', insert: '+', delete: '-' }

/**
 * 文本对比工具。
 *
 * 算法全在 lib/diff.ts（Myers 差分 + 行内字级差分，有单测），这里只做输入和渲染。
 * 输入框是即时的，对比结果跟的是「停顿后的」文本：输入不卡，结果晚 250 ms 到。
 * 大输入有三道闸：每边超过 MAX_CHARS 字不算；超过 MAX_LINES 行只比前面的；
 * 结果超过 MAX_RENDER_ROWS 行只显示前面的（统计数字仍按全部算）。
 * 无持久化：不保存用户输入的文本。
 */
export function TextDiff() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [settled, setSettled] = useState({ left: '', right: '' })
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled({ left, right }), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [left, right])

  const tooBig = settled.left.length > MAX_CHARS || settled.right.length > MAX_CHARS
  const result = useMemo(
    () => (tooBig ? null : diffText(settled.left, settled.right, { ignoreWhitespace, ignoreCase })),
    [settled, ignoreWhitespace, ignoreCase, tooBig],
  )
  const pending = left !== settled.left || right !== settled.right
  const empty = settled.left === '' && settled.right === ''
  const shownRows = result ? result.rows.slice(0, MAX_RENDER_ROWS) : []

  return (
    <div className="tool-panel text-diff">
      <div className="text-diff__inputs">
        <label className="unit-field text-diff__field">
          <span className="unit-field__label">原文本</span>
          <textarea className="site-form__input text-diff__textarea" aria-label="原文本" value={left} spellCheck={false}
            placeholder="粘贴修改前的文字" onChange={(event) => setLeft(event.target.value)} />
        </label>
        <label className="unit-field text-diff__field">
          <span className="unit-field__label">新文本</span>
          <textarea className="site-form__input text-diff__textarea" aria-label="新文本" value={right} spellCheck={false}
            placeholder="粘贴修改后的文字" onChange={(event) => setRight(event.target.value)} />
        </label>
      </div>

      <div className="text-diff__options">
        <label className="check-inline">
          <input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />
          忽略首尾空白
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />
          忽略大小写
        </label>
      </div>

      {tooBig && (
        <p className="site-form__error" role="alert">
          文本太大（单边超过 {MAX_CHARS.toLocaleString()} 字），浏览器里对比会卡住页面，请分段粘贴。
        </p>
      )}

      {result && !empty && (
        <div className="text-diff__summary" aria-live="polite">
          {result.added === 0 && result.removed === 0
            ? <span className="text-diff__same">两段文本相同{ignoreWhitespace || ignoreCase ? '（按当前忽略选项）' : ''}</span>
            : <>
              <span className="text-diff__stat text-diff__stat--insert">新增 {result.added} 行</span>
              <span className="text-diff__stat text-diff__stat--delete">删除 {result.removed} 行</span>
            </>}
          {pending && <span className="hint">对比中…</span>}
        </div>
      )}

      {result?.truncated && (
        <p className="site-form__error" role="alert">
          超过 {MAX_LINES} 行（原文本 {result.oldLines} 行、新文本 {result.newLines} 行），只对比了每边前 {MAX_LINES} 行。
        </p>
      )}
      {result && result.rows.length > MAX_RENDER_ROWS && (
        <p className="hint">结果共 {result.rows.length} 行，只显示前 {MAX_RENDER_ROWS} 行；上面的统计按全部计算。</p>
      )}

      {shownRows.length > 0 && (
        <div className="diff-view" role="table" aria-label="对比结果">
          {shownRows.map((row, index) => (
            <div key={index} role="row" className={`diff-row diff-row--${row.kind}`}>
              <span role="cell" className="diff-row__num">{row.oldLine ?? ''}</span>
              <span role="cell" className="diff-row__num">{row.newLine ?? ''}</span>
              <span role="cell" className="diff-row__sign" aria-hidden="true">{SIGN[row.kind]}</span>
              <span role="cell" className="diff-row__text">
                {row.segments.map((segment, s) => {
                  if (!segment.changed) return <span key={s}>{segment.text}</span>
                  return row.kind === 'delete'
                    ? <del key={s} className="diff-mark">{segment.text}</del>
                    : <ins key={s} className="diff-mark">{segment.text}</ins>
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="hint">
        按行对比，改动过的行再逐字标出具体改了哪几个字（红底删除、绿底新增）。
        每边最多对比 {MAX_LINES} 行。文本只在本机处理，不会上传，也不保存。
      </p>
    </div>
  )
}
