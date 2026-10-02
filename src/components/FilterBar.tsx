interface FilterBarProps {
  /** 所有去重后的分类，从站点清单里收集 */
  categories: string[]
  /** 当前选中分类，null 表示「全部」 */
  active: string | null
  onSelect: (category: string | null) => void
}

/**
 * 分类筛选条。
 *
 * 为什么 state 放在 App 而不是这里：
 * 筛选结果要传给 SiteGrid 决定渲染哪些卡片，属于跨组件的共享状态，
 * 所以由 App 持有 active、这里只做展示和回调。保持组件无状态、好复用。
 */
export function FilterBar({ categories, active, onSelect }: FilterBarProps) {
  if (categories.length === 0) return null

  return (
    <div className="filter" role="tablist" aria-label="按分类筛选">
      <button
        type="button"
        className={`chip${active === null ? ' chip--active' : ''}`}
        role="tab"
        aria-selected={active === null}
        onClick={() => onSelect(null)}
      >
        全部
      </button>

      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`chip${active === category ? ' chip--active' : ''}`}
          role="tab"
          aria-selected={active === category}
          onClick={() => onSelect(category)}
        >
          {category}
        </button>
      ))}
    </div>
  )
}
