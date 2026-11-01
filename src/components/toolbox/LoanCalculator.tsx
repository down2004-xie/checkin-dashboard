import { useMemo, useState } from 'react'

import { compareLoan, formatCents, parseLoanForm, type LoanSummary, type RepaymentMethod } from '../../lib/loan'
import '../../styles/tools/loan-calc.css'

/** 逐月表默认只渲染这么多行：30 年是 360 行，一次全画出来既卡又没人看 */
const PREVIEW_ROWS = 12

const METHOD_LABEL: Record<RepaymentMethod, string> = {
  annuity: '等额本息',
  principal: '等额本金',
}

/** 「1,234.56 元」 */
const yuan = (cents: number) => `${formatCents(cents)} 元`

/**
 * 房贷计算器：等额本息 vs 等额本金。
 *
 * 计算全在 lib/loan.ts（金额按分取整，最后一期吸收尾差）。这里只做：
 * 表单 → parseLoanForm 校验 → compareLoan → 对比表 + 逐月表。
 * 结果是输入的派生值，用 useMemo 而不是存 state。
 *
 * 利率默认值只是演示用的示例，**刻意不写死当前 LPR**：LPR 每月公布、会变，
 * 写死的数字过几个月就是错的，而用户会以为那是「官方利率」。
 */
export function LoanCalculator() {
  const [amountWan, setAmountWan] = useState('100')
  const [years, setYears] = useState('30')
  const [rate, setRate] = useState('4')
  const [method, setMethod] = useState<RepaymentMethod>('annuity')
  const [expanded, setExpanded] = useState(false)

  const parsed = useMemo(() => parseLoanForm(amountWan, years, rate), [amountWan, years, rate])
  const result = useMemo(() => (parsed.ok ? compareLoan(parsed.input) : null), [parsed])

  const summary: LoanSummary | null = result ? result[method] : null
  const rows = summary ? (expanded ? summary.rows : summary.rows.slice(0, PREVIEW_ROWS)) : []

  return (
    <div className="tool-panel">
      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">贷款金额（万元）</span>
          <input className="site-form__input" inputMode="decimal" aria-label="贷款金额（万元）" value={amountWan}
            onChange={(event) => setAmountWan(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">贷款年限（年，1~30）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="贷款年限" value={years}
            onChange={(event) => setYears(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">年利率（%）</span>
          <input className="site-form__input" inputMode="decimal" aria-label="年利率" value={rate}
            onChange={(event) => setRate(event.target.value)} /></label>
      </div>
      <p className="hint loan-rate-note">默认年利率 4% 只是示例，请以银行合同上的利率为准。</p>

      {!parsed.ok && <p className="site-form__error" role="alert">{parsed.error}</p>}

      {result && summary && (
        <>
          <div className="loan-table-wrap">
            <table className="loan-table loan-compare">
              <thead>
                <tr><th scope="col">项目</th><th scope="col">等额本息</th><th scope="col">等额本金</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">首月月供</th><td>{yuan(result.annuity.firstPayment)}</td><td>{yuan(result.principal.firstPayment)}</td></tr>
                <tr><th scope="row">末月月供</th><td>{yuan(result.annuity.lastPayment)}</td><td>{yuan(result.principal.lastPayment)}</td></tr>
                <tr><th scope="row">总利息</th><td>{yuan(result.annuity.totalInterest)}</td><td>{yuan(result.principal.totalInterest)}</td></tr>
                <tr><th scope="row">还款总额</th><td>{yuan(result.annuity.totalPayment)}</td><td>{yuan(result.principal.totalPayment)}</td></tr>
              </tbody>
            </table>
          </div>

          <p className="loan-summary" aria-live="polite">
            {result.interestDiff > 0
              ? <>等额本金比等额本息少付利息 <strong>{yuan(result.interestDiff)}</strong>，
                  但首月要多还 <strong>{yuan(result.firstPaymentDiff)}</strong>，之后每月约减少 {yuan(result.principalMonthlyDecrease)}。</>
              : <>两种方式的总利息相同。</>}
          </p>

          <div className="loan-schedule-head">
            <div className="filter loan-methods" role="group" aria-label="逐月表的还款方式">
              {(Object.keys(METHOD_LABEL) as RepaymentMethod[]).map((item) => (
                <button key={item} type="button" className={`chip${method === item ? ' chip--active' : ''}`}
                  aria-pressed={method === item} onClick={() => setMethod(item)}>{METHOD_LABEL[item]}</button>
              ))}
            </div>
            <span className="hint">共 {summary.rows.length} 期</span>
          </div>

          <div className="loan-table-wrap">
            <table className="loan-table loan-schedule">
              <thead>
                <tr><th scope="col">期数</th><th scope="col">月供</th><th scope="col">本金</th><th scope="col">利息</th><th scope="col">剩余本金</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    <td>{formatCents(row.payment)}</td>
                    <td>{formatCents(row.principal)}</td>
                    <td>{formatCents(row.interest)}</td>
                    <td>{formatCents(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.rows.length > PREVIEW_ROWS && (
            <button type="button" className="btn loan-expand" onClick={() => setExpanded((value) => !value)}>
              {expanded ? `收起，只看前 ${PREVIEW_ROWS} 期` : `展开全部 ${summary.rows.length} 期`}
            </button>
          )}
        </>
      )}

      <p className="hint">
        结果为估算：每期利息按「剩余本金 × 年利率 ÷ 12」四舍五入到分，四舍五入的尾差由最后一期吸收，
        所以最后一期可能和前面差几元。各家银行的取整方式不同，实际以银行还款计划为准。
        不支持组合贷款（公积金 + 商贷）和提前还款。
      </p>
    </div>
  )
}
