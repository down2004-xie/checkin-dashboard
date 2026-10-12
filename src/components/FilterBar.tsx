import type { SiteFilters, SiteSort, SiteStatus } from '../lib/sites'

interface FilterBarProps {
  categories: string[]
  filters: SiteFilters
  count: number
  onChange: (patch: Partial<SiteFilters>) => void
}

export function FilterBar({ categories, filters, count, onChange }: FilterBarProps) {
  return (
    <section className="site-tools" aria-label="查找站点">
      <div className="toolbar">
        <input type="search" className="site-form__input search" aria-label="搜索站点名称或网址"
          placeholder="搜索站点名称或网址…" value={filters.query} onChange={(event) => onChange({ query: event.target.value })} />
        <select aria-label="签到状态" value={filters.status} onChange={(event) => onChange({ status: event.target.value as SiteStatus })}>
          <option value="all">全部状态</option><option value="pending">未签到</option>
          <option value="done">已签到</option><option value="paused">已暂停</option>
        </select>
        <select aria-label="站点排序" value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as SiteSort })}>
          <option value="manual">手动顺序</option><option value="name">名称排序</option><option value="pending">未签到优先</option>
        </select>
        <span className="muted">{count} 个站点</span>
      </div>
      <div className="filter" role="group" aria-label="按分类筛选">
        <button type="button" className={`chip${filters.category === null ? ' chip--active' : ''}`}
          aria-pressed={filters.category === null} onClick={() => onChange({ category: null })}>全部分类</button>
        {categories.map((category) => (
          <button key={category} type="button" className={`chip${filters.category === category ? ' chip--active' : ''}`}
            aria-pressed={filters.category === category} onClick={() => onChange({ category })}>{category || '未分类'}</button>
        ))}
      </div>
    </section>
  )
}
