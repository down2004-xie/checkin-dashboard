import { useState } from 'react'

import {
  MAX_COUNT,
  MAX_GROUPS,
  MAX_SIDES,
  flipCoins,
  parseCount,
  parseNames,
  pickOne,
  rollDice,
  splitGroups,
} from '../../lib/random-pick'

type Mode = 'dice' | 'coin' | 'pick' | 'group'

const MODES: { id: Mode; label: string }[] = [
  { id: 'dice', label: '掷骰子' },
  { id: 'coin', label: '抛硬币' },
  { id: 'pick', label: '抽签' },
  { id: 'group', label: '随机分组' },
]

/** 输入不合法时的提示行；没问题时不渲染 */
function InputError({ reason }: { reason: string | null }) {
  if (!reason) return null
  return <p className="site-form__error" role="alert">{reason}</p>
}

/**
 * 随机抽签工具面板。四种玩法共用一个组件，靠 mode 切换。
 *
 * 所有随机结果只存在组件 state 里，不落盘。真正的随机算法在 lib/random-pick.ts
 * （默认用 crypto 安全随机数），这里只负责收集输入、校验、展示结果。
 * 输入不合法时按钮禁用，并在旁边写明原因 —— 以前是按钮能点但静默无反应。
 */
export function RandomPick() {
  const [mode, setMode] = useState<Mode>('dice')

  // 骰子
  const [diceCount, setDiceCount] = useState('2')
  const [diceSides, setDiceSides] = useState('6')
  const [diceResult, setDiceResult] = useState<number[]>([])
  // 硬币
  const [coinCount, setCoinCount] = useState('1')
  const [coinResult, setCoinResult] = useState<('正' | '反')[]>([])
  // 名单（抽签 / 分组共用）
  const [namesText, setNamesText] = useState('')
  const [pickResult, setPickResult] = useState<string | null>(null)
  const [groupCount, setGroupCount] = useState('2')
  const [groups, setGroups] = useState<string[][]>([])

  const names = parseNames(namesText)
  const diceCountParsed = parseCount(diceCount, '骰子个数', 1, MAX_COUNT)
  const diceSidesParsed = parseCount(diceSides, '面数', 2, MAX_SIDES)
  const coinParsed = parseCount(coinCount, '硬币个数', 1, MAX_COUNT)
  const groupParsed = parseCount(groupCount, '组数', 2, MAX_GROUPS)

  const diceError = !diceCountParsed.ok ? diceCountParsed.reason : !diceSidesParsed.ok ? diceSidesParsed.reason : null
  const coinError = coinParsed.ok ? null : coinParsed.reason
  const groupError = groupParsed.ok ? null : groupParsed.reason
  const namesHint = names.length === 0 ? '名单是空的，先填几个名字' : null

  const roll = () => {
    if (diceCountParsed.ok && diceSidesParsed.ok) setDiceResult(rollDice(diceCountParsed.value, diceSidesParsed.value))
  }
  const flip = () => {
    if (coinParsed.ok) setCoinResult(flipCoins(coinParsed.value))
  }
  const pick = () => setPickResult(pickOne(names))
  const split = () => {
    if (groupParsed.ok) setGroups(splitGroups(names, groupParsed.value))
  }

  // 名单一改，旧的抽签 / 分组结果就不再对应当前名单（可能抽中了已删掉的人），直接清掉
  const changeNames = (text: string) => {
    setNamesText(text)
    setPickResult(null)
    setGroups([])
  }

  return (
    <div className="tool-panel">
      <div className="filter" role="group" aria-label="玩法">
        {MODES.map((item) => (
          <button key={item.id} type="button" className={`chip${mode === item.id ? ' chip--active' : ''}`}
            aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>
        ))}
      </div>

      {mode === 'dice' && (
        <div>
          <div className="unit-row">
            <label className="unit-field"><span className="unit-field__label">骰子个数（1–{MAX_COUNT}）</span>
              <input className="site-form__input" inputMode="numeric" aria-label="骰子个数" value={diceCount}
                aria-invalid={!diceCountParsed.ok} onChange={(event) => setDiceCount(event.target.value)} /></label>
            <label className="unit-field"><span className="unit-field__label">每个面数（2–{MAX_SIDES}）</span>
              <input className="site-form__input" inputMode="numeric" aria-label="骰子面数" value={diceSides}
                aria-invalid={!diceSidesParsed.ok} onChange={(event) => setDiceSides(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={roll} disabled={diceError !== null}>掷骰子</button>
          </div>
          <InputError reason={diceError} />
          {diceResult.length > 0 && (
            <output className="random-result" aria-live="polite">
              {diceResult.map((value, index) => <span key={index} className="random-die">{value}</span>)}
              <span className="random-result__sum">合计 {diceResult.reduce((sum, value) => sum + value, 0)}</span>
            </output>
          )}
        </div>
      )}

      {mode === 'coin' && (
        <div>
          <div className="unit-row">
            <label className="unit-field"><span className="unit-field__label">硬币个数（1–{MAX_COUNT}）</span>
              <input className="site-form__input" inputMode="numeric" aria-label="硬币个数" value={coinCount}
                aria-invalid={!coinParsed.ok} onChange={(event) => setCoinCount(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={flip} disabled={coinError !== null}>抛硬币</button>
          </div>
          <InputError reason={coinError} />
          {coinResult.length > 0 && (
            <output className="random-result" aria-live="polite">
              {coinResult.map((value, index) => <span key={index} className="random-coin">{value}</span>)}
            </output>
          )}
        </div>
      )}

      {(mode === 'pick' || mode === 'group') && (
        <label className="unit-field random-names">
          <span className="unit-field__label">名单（每行一个，或用逗号、顿号、分号分隔；空格不算分隔，英文名可以带空格）</span>
          <textarea className="site-form__input random-textarea" aria-label="名单" value={namesText}
            placeholder={'张三\n李四\n王五'} onChange={(event) => changeNames(event.target.value)} />
          <span className="hint">已识别 {names.length} 人（自动去重）</span>
        </label>
      )}

      {mode === 'pick' && (
        <div>
          <div className="unit-row">
            <button type="button" className="btn btn--primary" onClick={pick} disabled={names.length === 0}>抽一个</button>
          </div>
          <InputError reason={namesHint} />
          {pickResult && <output className="random-result random-result--pick" aria-live="polite">{pickResult}</output>}
        </div>
      )}

      {mode === 'group' && (
        <div>
          <div className="unit-row">
            <label className="unit-field"><span className="unit-field__label">分成几组（2–{MAX_GROUPS}）</span>
              <input className="site-form__input" inputMode="numeric" aria-label="分组数" value={groupCount}
                aria-invalid={!groupParsed.ok} onChange={(event) => setGroupCount(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={split}
              disabled={names.length === 0 || groupError !== null}>随机分组</button>
          </div>
          <InputError reason={groupError ?? namesHint} />
          {groupParsed.ok && names.length > 0 && groupParsed.value > names.length && (
            <p className="hint">名单只有 {names.length} 人，会分成 {names.length} 组，每组 1 人。</p>
          )}
          {groups.length > 0 && (
            <div className="random-groups" aria-live="polite">
              {groups.map((group, index) => (
                <div key={index} className="random-group">
                  <span className="random-group__title">第 {index + 1} 组（{group.length} 人）</span>
                  <span className="random-group__names">{group.join('、')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="hint">结果只在本页显示，刷新即清空。随机数来自浏览器的安全随机数（crypto），不可预测。</p>
    </div>
  )
}
