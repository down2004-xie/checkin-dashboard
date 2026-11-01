import { useState } from 'react'
import type { Site } from '../types'
import { nextBatch } from '../lib/sites'

interface OpenPendingButtonProps {
  sites: Site[]
}

/** 每次点击最多打开几个：一般电脑扛得住 5 个重页面同时加载，也是人一轮签得完的量（口味值） */
const BATCH_SIZE = 5

function buttonLabel(total: number, unopened: number): string {
  if (unopened === 0) return `重新打开未签到（${total}）`
  if (unopened < total) return `打开下一批（剩 ${unopened} 个）`
  return total > BATCH_SIZE ? `一键打开未签到（先开 ${BATCH_SIZE} 个，共 ${total} 个）` : `一键打开未签到（${total}）`
}

export function OpenPendingButton({ sites }: OpenPendingButtonProps) {
  // 本次页面会话里真的打开成功的站点；刷新即清空，不落盘（不是用户数据）
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [result, setResult] = useState<{ opened: number; blocked: number } | null>(null)

  if (sites.length === 0) return null

  const openBatch = () => {
    const { batch, restart } = nextBatch(sites, opened, BATCH_SIZE)
    const next = new Set(restart ? [] : opened)
    let count = 0
    for (const site of batch) {
      // 不传 'noopener'：带上它 window.open 恒返回 null，就分不清「被拦截」和「已打开」。
      // 改为拿到窗口后手动断开 opener，效果与卡片链接的 rel="noopener" 相同。
      const tab = window.open(site.url, '_blank')
      if (tab) { tab.opener = null; next.add(site.id); count += 1 }
    }
    setOpened(next)
    setResult({ opened: count, blocked: batch.length - count })
  }

  const unopened = sites.filter((site) => !opened.has(site.id)).length

  return (
    <div className="open-pending">
      <button type="button" className="btn btn--primary" onClick={openBatch}>{buttonLabel(sites.length, unopened)}</button>
      <span className="muted">每次最多开 {BATCH_SIZE} 个 · 打开后仍需回来手动打勾</span>
      {result && result.blocked > 0 && <p className="notice" role="status">
        <span>已打开 {result.opened} 个，{result.blocked} 个被浏览器拦截。请在地址栏允许本站「弹出式窗口」后再点一次。</span>
        <button type="button" className="chip" onClick={() => setResult(null)} aria-label="关闭提示">×</button>
      </p>}
    </div>
  )
}
