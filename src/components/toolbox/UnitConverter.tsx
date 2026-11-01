import { useState } from 'react'

import {
  SYSTEM_LABELS,
  UNIT_GROUPS,
  checkPhysical,
  convert,
  formatResult,
  parseAmount,
  type UnitCategory,
  type UnitDef,
  type UnitSystem,
} from '../../lib/unit-convert'
import '../../styles/tools/unit-convert.css'

const SYSTEM_ORDER: UnitSystem[] = ['metric', 'imperial', 'chinese']

/**
 * 单位下拉框的选项。分了制式的量纲用 <optgroup> 分组：
 * 「尺」和「英尺」、「两」和「盎司」挤在一个平铺列表里很容易选错。
 */
function UnitOptions({ units }: { units: UnitDef[] }) {
  if (units.every((unit) => unit.system === undefined)) {
    return <>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</>
  }
  return (
    <>
      {SYSTEM_ORDER.map((system) => {
        const members = units.filter((unit) => unit.system === system)
        if (members.length === 0) return null
        return (
          <optgroup key={system} label={SYSTEM_LABELS[system]}>
            {members.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}

/**
 * 单位换算工具面板。
 *
 * 状态：当前量纲 + 输入值 + 两个单位。解析、校验、换算结果都**每次渲染现算**，不存 state ——
 * 派生值没有第二个真源，就不会出现「改了单位结果没跟着变」的失同步 bug。
 * 工具本身无持久化：刷新即清空。
 */
export function UnitConverter() {
  const [category, setCategory] = useState<UnitCategory>('length')
  const [amount, setAmount] = useState('1')
  const [fromId, setFromId] = useState('m')
  const [toId, setToId] = useState('cm')

  const group = UNIT_GROUPS.find((item) => item.category === category) ?? UNIT_GROUPS[0]
  const fromLabel = group.units.find((unit) => unit.id === fromId)?.label
  const toLabel = group.units.find((unit) => unit.id === toId)?.label

  // 先判「是不是数」，再判「物理上成不成立」，两层原因分开给，用户才知道该改哪儿
  const parsed = parseAmount(amount)
  const problem = parsed.ok ? checkPhysical(parsed.value, category, fromId) : parsed.reason
  const result = parsed.ok && !problem ? formatResult(convert(parsed.value, category, fromId, toId)) : null

  // 切换量纲时只重置单位（fromId 不能指向别的量纲的单位），输入值保留：
  // 用户往往是「同一个数换个量纲再看看」，被重置成 1 还得重新敲
  const changeCategory = (next: UnitCategory) => {
    const nextGroup = UNIT_GROUPS.find((item) => item.category === next) ?? UNIT_GROUPS[0]
    setCategory(next)
    setFromId(nextGroup.defaultFrom)
    setToId(nextGroup.defaultTo)
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
          {/* 温度要能输负号，iOS 的 decimal 小键盘没有负号键，所以温度退回普通键盘 */}
          <input className="site-form__input" inputMode={category === 'temperature' ? 'text' : 'decimal'}
            value={amount} aria-label="要换算的数值" aria-invalid={problem !== null}
            onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="unit-field">
          <span className="unit-field__label">从</span>
          <select aria-label="原单位" value={fromId} onChange={(event) => setFromId(event.target.value)}>
            <UnitOptions units={group.units} />
          </select>
        </label>
        <button type="button" className="btn unit-swap" onClick={swap} aria-label="交换单位">⇄</button>
        <label className="unit-field">
          <span className="unit-field__label">到</span>
          <select aria-label="目标单位" value={toId} onChange={(event) => setToId(event.target.value)}>
            <UnitOptions units={group.units} />
          </select>
        </label>
      </div>

      {result !== null ? (
        <output className="unit-result" aria-live="polite">
          {/* 左边回显用户原样输入，不经过格式化：格式化会把 1234567 之类的输入改写，用户会以为没输对 */}
          {amount.trim()} {fromLabel}
          {' = '}
          <strong>{result}</strong> {toLabel}
        </output>
      ) : (
        <output className="unit-result unit-result--error" role="alert">{problem}</output>
      )}
      <p className="hint">
        输入即时换算，支持小数和科学计数法（如 1e3）。市制：1 尺 = 1/3 米，1 斤 = 0.5 千克，1 亩 ≈ 666.67 平方米。
        刷新页面后清空，计算在浏览器本地完成。
      </p>
    </div>
  )
}
