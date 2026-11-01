import { useMemo, useState } from 'react'

import { toRmbUppercase } from '../../lib/rmb'
import '../../styles/tools/rmb-uppercase.css'

const EXAMPLES = ['100', '1,409.50', '16409.02', '107000.53']

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * 人民币大写：输入即转换。
 *
 * 规则和容错全在 lib/rmb.ts（全程字符串处理，不用浮点）。这里只负责：
 * 受控输入 → 派生结果（useMemo，不另存 state，免得和输入失同步）→ 展示 / 复制。
 * 结果里同时给出规范化的小写金额，让用户核对「我输入的是不是这个数」，
 * 尤其是带千分位、全角数字时。
 */
export function RmbUppercase() {
  const [amount, setAmount] = useState('')
  const [copy, setCopy] = useState<CopyState>('idle')
  const result = useMemo(() => toRmbUppercase(amount), [amount])
  const showError = !result.ok && amount.trim() !== ''

  const update = (value: string) => {
    setAmount(value)
    setCopy('idle')
  }

  const copyText = async () => {
    if (!result.ok) return
    try {
      await navigator.clipboard.writeText(result.text)
      setCopy('copied')
    } catch {
      // 非 https、权限被拒、老浏览器都会失败；不假装成功，让用户手动选中
      setCopy('failed')
    }
  }

  return (
    <div className="tool-panel">
      <label className="unit-field rmb-field">
        <span className="unit-field__label">金额（元）</span>
        <input className="site-form__input rmb-input" inputMode="decimal" aria-label="金额"
          placeholder="如 1234.56" value={amount} autoComplete="off"
          onChange={(event) => update(event.target.value)} />
      </label>

      <div className="filter rmb-examples" role="group" aria-label="示例金额">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="chip" onClick={() => update(example)}>{example}</button>
        ))}
      </div>

      {showError && !result.ok && <p className="site-form__error rmb-error" role="alert">{result.error}</p>}

      {result.ok && (
        <div className="rmb-result" aria-live="polite">
          <span className="rmb-result__label">大写</span>
          <output className="rmb-result__text">{result.text}</output>
          <span className="rmb-result__normalized">小写：{result.normalized}</span>
          <div className="rmb-result__actions">
            <button type="button" className="btn btn--primary" onClick={copyText}>复制大写</button>
            {copy === 'copied' && <span className="hint">已复制</span>}
            {copy === 'failed' && <span className="hint">复制失败，请手动选中上面的文字复制</span>}
          </div>
        </div>
      )}

      <p className="hint">
        支持千分位逗号、全角数字和负数。最多两位小数（到分），多出的位不会自动四舍五入，会直接提示；
        金额需小于一万亿元。写法参照中国人民银行《支付结算办法》附件里的填写规定，
        如 ¥1,409.50 写作「壹仟肆佰零玖元伍角」，「拾」打头时写「壹拾」。
        票据上通常还要在前面加「人民币」三个字。
      </p>
    </div>
  )
}
