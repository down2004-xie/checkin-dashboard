import { useState } from 'react'

import { flipCoins, parseNames, pickOne, rollDice, splitGroups } from '../../lib/random-pick'

type Mode = 'dice' | 'coin' | 'pick' | 'group'

const MODES: { id: Mode; label: string }[] = [
  { id: 'dice', label: '掷骰子' },
  { id: 'coin', label: '抛硬币' },
  { id: 'pick', label: '抽签' },
  { id: 'group', label: '随机分组' },
]

/**
 * 随机抽签工具面板。四种玩法共用一个组件，靠 mode 切换。
 *
 * 所有随机结果只存在组件 state 里，不落盘 —— 和工具箱「不碰用户数据」的边界一致。
 * 真正的随机算法在 lib/random-pick.ts，这里只负责收集输入、展示结果。
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

  const roll = () => setDiceResult(rollDice(Number(diceCount), Number(diceSides)))
  const flip = () => setCoinResult(flipCoins(Number(coinCount)))
  const pick = () => setPickResult(pickOne(names))
  const split = () => setGroups(splitGroups(names, Number(groupCount)))

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
            <label className="unit-field"><span className="unit-field__label">骰子个数</span>
              <input className="site-form__input" inputMode="numeric" aria-label="骰子个数" value={diceCount} onChange={(event) => setDiceCount(event.target.value)} /></label>
            <label className="unit-field"><span className="unit-field__label">每个面数</span>
              <input className="site-form__input" inputMode="numeric" aria-label="骰子面数" value={diceSides} onChange={(event) => setDiceSides(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={roll}>掷骰子</button>
          </div>
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
            <label className="unit-field"><span className="unit-field__label">硬币个数</span>
              <input className="site-form__input" inputMode="numeric" aria-label="硬币个数" value={coinCount} onChange={(event) => setCoinCount(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={flip}>抛硬币</button>
          </div>
          {coinResult.length > 0 && (
            <output className="random-result" aria-live="polite">
              {coinResult.map((value, index) => <span key={index} className="random-coin">{value}</span>)}
            </output>
          )}
        </div>
      )}

      {(mode === 'pick' || mode === 'group') && (
        <label className="unit-field random-names">
          <span className="unit-field__label">名单（每行一个，或用逗号、顿号分隔）</span>
          <textarea className="site-form__input random-textarea" aria-label="名单" value={namesText}
            placeholder={'张三\n李四\n王五'} onChange={(event) => setNamesText(event.target.value)} />
          <span className="hint">已识别 {names.length} 人（自动去重）</span>
        </label>
      )}

      {mode === 'pick' && (
        <div>
          <div className="unit-row">
            <button type="button" className="btn btn--primary" onClick={pick} disabled={names.length === 0}>抽一个</button>
          </div>
          {pickResult && <output className="random-result random-result--pick" aria-live="polite">{pickResult}</output>}
        </div>
      )}

      {mode === 'group' && (
        <div>
          <div className="unit-row">
            <label className="unit-field"><span className="unit-field__label">分成几组</span>
              <input className="site-form__input" inputMode="numeric" aria-label="分组数" value={groupCount} onChange={(event) => setGroupCount(event.target.value)} /></label>
            <button type="button" className="btn btn--primary" onClick={split} disabled={names.length === 0}>随机分组</button>
          </div>
          {groups.length > 0 && (
            <div className="random-groups" aria-live="polite">
              {groups.map((group, index) => (
                <div key={index} className="random-group">
                  <span className="random-group__title">第 {index + 1} 组</span>
                  <span className="random-group__names">{group.join('、')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="hint">结果只在本页显示，刷新即清空。所有随机都在浏览器本地完成。</p>
    </div>
  )
}
