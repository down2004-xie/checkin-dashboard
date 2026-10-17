import { useState } from 'react'

import { countdownTo } from '../../lib/countdown'
import type { DateKey } from '../../types'

/**
 * 倒计时 / 纪念日工具面板。
 *
 * 输入一个目标日期，即时算出「还有 / 已经过去多少天」。
 * today 由外部传入（来自 useToday），这样它和签到看板用的是同一个「今天」，
 * 跨零点会自动更新，不会出现两个视图对「今天」理解不一致。
 *
 * 无持久化：不记录用户填过的日期，刷新即清空。
 */
export function CountdownTool({ today }: { today: DateKey }) {
  const [target, setTarget] = useState('')
  const result = target ? countdownTo(target, today) : null

  return (
    <div className="tool-panel">
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
        <p className="hint">选一个日期，看看距今还有多久。</p>
      )}
      <p className="hint">今天：{today}。所有计算在浏览器本地完成，不记录你填过的日期。</p>
    </div>
  )
}
