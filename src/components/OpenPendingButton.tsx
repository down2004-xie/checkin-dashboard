import { useState } from 'react'
import type { Site } from '../types'

interface OpenPendingButtonProps {
  sites: Site[]
}

/** 超过这个数先确认，防止误点一下弹出几十个标签页 */
const CONFIRM_ABOVE = 10

export function OpenPendingButton({ sites }: OpenPendingButtonProps) {
  const [result, setResult] = useState<{ opened: number; blocked: number } | null>(null)

  if (sites.length === 0) return null

  const openAll = () => {
    if (sites.length > CONFIRM_ABOVE && !window.confirm(`将打开 ${sites.length} 个标签页，确定吗？`)) return
    let opened = 0
    for (const site of sites) {
      // 不传 'noopener'：带上它 window.open 恒返回 null，就分不清「被拦截」和「已打开」。
      // 改为拿到窗口后手动断开 opener，效果与卡片链接的 rel="noopener" 相同。
      const tab = window.open(site.url, '_blank')
      if (tab) { tab.opener = null; opened += 1 }
    }
    setResult({ opened, blocked: sites.length - opened })
  }

  return (
    <div className="open-pending">
      <button type="button" className="btn btn--primary" onClick={openAll}>一键打开未签到（{sites.length}）</button>
      <span className="muted">打开后仍需回来手动打勾</span>
      {result && result.blocked > 0 && <p className="notice" role="status">
        <span>已打开 {result.opened} 个，{result.blocked} 个被浏览器拦截。请在地址栏允许本站「弹出式窗口」后再点一次。</span>
        <button type="button" className="chip" onClick={() => setResult(null)} aria-label="关闭提示">×</button>
      </p>}
    </div>
  )
}
