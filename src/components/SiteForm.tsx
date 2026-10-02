import { useState } from 'react'

import type { Site } from '../types'
import { normalizeUrl, siteHost, siteIdFromUrl } from '../lib/site-form'

interface SiteFormProps {
  /** 编辑时传入的已有站点；新增时省略 */
  initial?: Site
  /**
   * **其他**站点已占用的域名（编辑时不含被编辑的这个站）。
   *
   * 为什么传域名而不是 id：站点的身份就是域名，所以「重复」要用域名判断。
   * 如果传 id，一旦历史数据里同一个域名有两个不同 id（v2 遗留），就查不出来。
   */
  existingHosts: ReadonlySet<string>
  onSubmit: (site: Site) => void
  onCancel: () => void
}

/**
 * 站点的新增 / 编辑表单。
 *
 * 校验策略：
 * - name / url 在提交时才校验，不在每次输入时打断用户。
 * - url 用 lib/site-form 的 normalizeUrl：缺协议自动补、非法直接拒绝。
 * - id 只在「新增」时生成（由 url 的域名派生），「编辑」沿用原 id ——
 *   id 是历史记录的锚，改了历史就断。
 */
export function SiteForm({ initial, existingHosts, onSubmit, onCancel }: SiteFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('站点名称不能为空')
      return
    }

    const normalized = normalizeUrl(url)
    if (normalized === null) {
      setError('网址不合法，请填完整地址（如 bilibili.com）')
      return
    }

    // 同一个域名只能有一张卡片 —— 站点的身份就是域名，
    // 不拦的话同一个站会出现两张卡、各自记一份签到历史，两边都对不上。
    // 新增和编辑都要查：编辑时把 A 站的网址改成 B 站的域名，同样是重复。
    const host = siteHost(normalized)
    if (host !== null && existingHosts.has(host)) {
      setError(`已经有「${host}」的卡片了，同一个网站只能有一张`)
      return
    }

    // 新增：id 由域名派生；编辑：沿用原 id（它在 existingHosts 里已排除，不会被上面拦下）
    const id = initial?.id ?? siteIdFromUrl(normalized)
    if (id === null) {
      setError('网址不合法，取不到域名')
      return
    }

    onSubmit({
      id,
      name: trimmedName,
      url: normalized,
      // 分类为空就不带这个字段，保持存储干净
      ...(category.trim() === '' ? {} : { category: category.trim() }),
    })
  }

  return (
    <div className="site-form">
      <label className="site-form__field">
        <span className="site-form__label">名称</span>
        <input
          className="site-form__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：哔哩哔哩"
          autoFocus
        />
      </label>

      <label className="site-form__field">
        <span className="site-form__label">网址</span>
        <input
          className="site-form__input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="如：bilibili.com"
          inputMode="url"
        />
      </label>

      <label className="site-form__field">
        <span className="site-form__label">分类（可选）</span>
        <input
          className="site-form__input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="如：购物 / 视频 / 学习"
        />
      </label>

      {error && (
        <p className="site-form__error" role="alert">
          {error}
        </p>
      )}

      <div className="site-form__actions">
        <button type="button" className="btn btn--primary" onClick={handleSubmit}>
          {initial ? '保存' : '添加'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
