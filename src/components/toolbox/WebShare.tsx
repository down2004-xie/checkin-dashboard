import { useMemo, useState } from 'react'

import { SHARE_SITES } from '../../data/share-sites'
import { filterShareSites, groupByCategory } from '../../lib/share-sites'

/**
 * 网页分享工具：站长精选的一批有意思的网站。
 *
 * 过滤逻辑全在 lib/share-sites.ts（有单测），这里只做受控输入 + 渲染。
 * 搜索词和当前分类是「筛选状态」，用 useState 存；可见列表是它们的**派生值**，
 * 用 useMemo 现算，不存进 state —— 存了就有了第二个真源，容易失同步。
 *
 * 卡片整块是 <a>：点哪都跳转，target=_blank + rel="noopener noreferrer"
 * 防新标签页拿到 window.opener 反向操作本页（安全默认值）。
 */
export function WebShare() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  // 分类 chips 的来源：按「首次出现顺序」从清单里提出来，和分组顺序保持一致
  const categories = useMemo(() => groupByCategory(SHARE_SITES).map((group) => group.category), [])

  const visible = useMemo(() => {
    const byCategory =
      category === null ? SHARE_SITES : SHARE_SITES.filter((site) => site.category === category)
    return filterShareSites(byCategory, query)
  }, [category, query])

  return (
    <div className="tool-panel">
      <input
        type="search"
        className="site-form__input"
        aria-label="搜索网站"
        placeholder="搜索网站名、描述或分类…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="filter" role="group" aria-label="按分类筛选网站">
        <button
          type="button"
          className={`chip${category === null ? ' chip--active' : ''}`}
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
        >
          全部 {SHARE_SITES.length}
        </button>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={`chip${category === item ? ' chip--active' : ''}`}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item} {SHARE_SITES.filter((site) => site.category === item).length}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <p className="empty__text">没有匹配的网站</p>
          <p className="empty__hint">换个关键词或分类试试</p>
        </div>
      ) : (
        <div className="share-grid">
          {visible.map((site) => (
            <a
              key={site.id}
              className="share-card"
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="share-card__name">{site.name}</span>
              <span className="share-card__desc">{site.description}</span>
              <span className="share-card__tag">{site.category}</span>
            </a>
          ))}
        </div>
      )}

      <p className="hint">站长精选的一批有意思的网站，点开会在新标签页打开；清单是静态写死的，不联网。</p>
    </div>
  )
}
