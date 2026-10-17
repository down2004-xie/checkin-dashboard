import { useState } from 'react'

import { UNIT_GROUPS, convert, formatResult, type UnitCategory } from '../../lib/unit-convert'

/**
 * 单位换算工具面板。
 *
 * 状态：当前量纲 + 输入值 + 两个单位。换算结果**每次渲染现算**，不存 state ——
 * 派生值没有第二个真源，就不会出现「改了单位结果没跟着变」的失同步 bug。
 * 工具本身无持久化：刷新即清空，符合「工具箱不碰用户数据」的边界。
 */
export function UnitConverter() {
  const [category, setCategory] = useState<UnitCategory>('length')
  const [amount, setAmount] = useState('1')
  const [fromId, setFromId] = useState('m')
  const [toId, setToId] = useState('cm')

  const group = UNIT_GROUPS.find((item) => item.category === category) ?? UNIT_GROUPS[0]
  const parsed = amount.trim() === '' ? NaN : Number(amount)
  const result = convert(parsed, category, fromId, toId)

  // 切换量纲时，单位和输入都要重置成该量纲的合法值，否则 fromId 会指向别的量纲的单位
  const changeCategory = (next: UnitCategory) => {
    const nextGroup = UNIT_GROUPS.find((item) => item.category === next) ?? UNIT_GROUPS[0]
    setCategory(next)
    setFromId(nextGroup.units[0].id)
    setToId(nextGroup.units[1]?.id ?? nextGroup.units[0].id)
    setAmount('1')
  }

  const swap = () => {
    setFromId(toId)
    setToId(fromId)
  }

  return (
    <div className="tool-panel">
      <div className="filter" role="group" aria-label="换算类型">
        {UNIT_GROUPS.map((item) => (
          <button key={item.category} type="button"
            className={`chip${category === item.category ? ' chip--active' : ''}`}
            aria-pressed={category === item.category} onClick={() => changeCategory(item.category)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="unit-row">
        <label className="unit-field">
          <span className="unit-field__label">数值</span>
          <input className="site-form__input" inputMode="decimal" value={amount}
            aria-label="要换算的数值" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="unit-field">
          <span className="unit-field__label">从</span>
          <select aria-label="原单位" value={fromId} onChange={(event) => setFromId(event.target.value)}>
            {group.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn unit-swap" onClick={swap} aria-label="交换单位">⇄</button>
        <label className="unit-field">
          <span className="unit-field__label">到</span>
          <select aria-label="目标单位" value={toId} onChange={(event) => setToId(event.target.value)}>
            {group.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </select>
        </label>
      </div>

      <output className="unit-result" aria-live="polite">
        {formatResult(parsed)} {group.units.find((unit) => unit.id === fromId)?.label}
        {' = '}
        <strong>{formatResult(result)}</strong> {group.units.find((unit) => unit.id === toId)?.label}
      </output>
      <p className="hint">输入即时换算，刷新页面后清空。所有计算在浏览器本地完成。</p>
    </div>
  )
}
