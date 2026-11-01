import { useState } from 'react'

import { countdownTo, nextAnniversary } from '../../lib/countdown'
import type { DateKey } from '../../types'
import '../../styles/tools/countdown.css'

type Mode = 'once' | 'yearly'

const MODES: { id: Mode; label: string }[] = [
  { id: 'once', label: '倒计时' },
  { id: 'yearly', label: '每年纪念日' },
]

/**
 * 倒计时 / 纪念日工具面板。两种模式：
 * - 倒计时：给一个日期，算「还有 / 已经过去多少天」。
 * - 每年纪念日：给一个过去的起始日，算下一次周年是哪天、还有几天、第几周年。
 *
 * today 由外部传入（来自 useToday），这样它和签到看板用的是同一个「今天」，
 * 跨零点会自动更新，不会出现两个视图对「今天」理解不一致。
 *
 * 不保存任何东西：填过的日期只在组件 state 里，刷新即清空，不写 localStorage。
 * 两个模式各自一份日期 state，切模式不互相覆盖。
 */
export function CountdownTool({ today }: { today: DateKey }) {
  const [mode, setMode] = useState<Mode>('once')
  const [target, setTarget] = useState('')
  const [origin, setOrigin] = useState('')

  const result = target ? countdownTo(target, today) : null
  const anniversary = origin ? nextAnniversary(origin, today) : null
  // 起始日填了、合法、但在今天之后：还没开始，没有「周年」可言
  const originInFuture = origin !== '' && anniversary === null && Number.isFinite(countdownTo(origin, today).days)

  return (
    <div className="tool-panel">
      <div className="filter" role="group" aria-label="计算方式">
        {MODES.map((item) => (
          <button key={item.id} type="button" className={`chip${mode === item.id ? ' chip--active' : ''}`}
            aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>
        ))}
      </div>

      {mode === 'once' && (
        <>
          <label className="unit-field countdown-field">
            <span className="unit-field__label">目标日期</span>
            <input type="date" className="site-form__input" value={target} aria-label="目标日期"
              onChange={(event) => setTarget(event.target.value)} />
          </label>

          {result ? (
            <div className={`countdown-result countdown-result--${result.status}`} aria-live="polite">
              <span className="countdown-result__label">{result.label}</span>
              {Number.isFinite(result.days) && (
                <span className="countdown-result__days">{Math.abs(result.days)} 天</span>
              )}
            </div>
          ) : (
            <p className="hint">选一个日期，看看距今还有多久，或者已经过去多久。</p>
          )}
        </>
      )}

      {mode === 'yearly' && (
        <>
          <label className="unit-field countdown-field">
            <span className="unit-field__label">起始日期（如在一起、结婚、入职的那天）</span>
            <input type="date" className="site-form__input" value={origin} aria-label="纪念日起始日期"
              max={today} onChange={(event) => setOrigin(event.target.value)} />
          </label>

          {anniversary ? (
            <div className={`countdown-result countdown-anniversary${anniversary.isToday ? ' countdown-result--today' : ''}`}
              aria-live="polite">
              {anniversary.isToday ? (
                <>
                  <span className="countdown-result__label">今天就是</span>
                  <span className="countdown-result__days">第 {anniversary.years} 周年</span>
                </>
              ) : (
                <>
                  <span className="countdown-result__label">距第 {anniversary.years} 周年还有</span>
                  <span className="countdown-result__days">{anniversary.daysUntil} 天</span>
                </>
              )}
              <span className="countdown-anniversary__detail">
                {anniversary.isToday ? '' : `下一次是 ${anniversary.next}。`}
                从 {origin} 起已经过去 {anniversary.daysSince} 天。
              </span>
            </div>
          ) : originInFuture ? (
            <p className="site-form__error" role="alert">这一天还没到。算未来的日期请用「倒计时」。</p>
          ) : (
            <p className="hint">选一个过去的日期，按每年重复算下一次纪念日。2 月 29 日的纪念日在平年按 2 月 28 日算。</p>
          )}
        </>
      )}

      <p className="hint">今天：{today}。计算在浏览器本地完成，填过的日期不会被保存。</p>
    </div>
  )
}
