import { useMemo, useState, type CSSProperties } from 'react'

import type { DateKey } from '../../types'
import { TOOLS, TOOL_CATEGORIES, filterTools, searchTools, type ToolCategory, type ToolDef } from '../../data/tools'
import { UnitConverter } from './UnitConverter'
import { CountdownTool } from './CountdownTool'
import { RandomPick } from './RandomPick'
import { ImageSlice } from './ImageSlice'

interface ToolboxViewProps {
  today: DateKey
}

/**
 * 工具箱视图。
 *
 * 和签到看板是「同一页面的两个视图」，不是两个路由 —— 顶层用 view 切换，
 * 所以这里不需要处理 URL。工具卡片是静态数据驱动的：加工具只改 data/tools.ts。
 *
 * 三种卡片状态各自的行为在 handleOpen 里集中处理：
 * ready 进面板、soon 给提示、link 新标签打开。
 */
export function ToolboxView({ today }: ToolboxViewProps) {
  const [category, setCategory] = useState<ToolCategory | null>(null)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const categoryColor = (id: ToolCategory) =>
    TOOL_CATEGORIES.find((item) => item.id === id)?.color ?? '#6ea8ff'

  const visible = useMemo(() => searchTools(filterTools(category), query), [category, query])

  const handleOpen = (tool: ToolDef) => {
    if (tool.status === 'ready') {
      setActiveId(tool.id)
      setToast(null)
    } else if (tool.status === 'link' && tool.link) {
      window.open(tool.link, '_blank', 'noopener,noreferrer')
    } else {
      setToast(`「${tool.name}」正在开发中，敬请期待`)
    }
  }

  // 进入某个工具的面板
  if (activeId) {
    const tool = TOOLS.find((item) => item.id === activeId)
    return (
      <section className="toolbox" aria-label="工具箱">
        <div className="toolbox__head">
          <button type="button" className="btn" onClick={() => setActiveId(null)}>← 返回工具列表</button>
          <h1 className="toolbox__title toolbox__title--inline">{tool?.icon} {tool?.name}</h1>
        </div>
        {activeId === 'unit-convert' && <UnitConverter />}
        {activeId === 'countdown' && <CountdownTool today={today} />}
        {activeId === 'random-pick' && <RandomPick />}
        {activeId === 'image-grid' && <ImageSlice />}
      </section>
    )
  }

  return (
    <section className="toolbox" aria-label="工具箱">
      <header className="toolbox__head">
        <div>
          <h1 className="toolbox__title">工具箱</h1>
          <p className="toolbox__subtitle">常用的小工具集合，全部在你的浏览器里运行，文件不会上传</p>
        </div>
        <input type="search" className="site-form__input toolbox__search" aria-label="搜索工具"
          placeholder="搜索工具…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </header>

      <div className="filter" role="group" aria-label="按分类筛选工具">
        <button type="button" className={`chip${category === null ? ' chip--active' : ''}`}
          aria-pressed={category === null} onClick={() => setCategory(null)}>全部 {TOOLS.length}</button>
        {TOOL_CATEGORIES.map((item) => (
          <button key={item.id} type="button" className={`chip${category === item.id ? ' chip--active' : ''}`}
            aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label} {TOOLS.filter((tool) => tool.category === item.id).length}
          </button>
        ))}
      </div>

      {toast && <div className="notice" role="status"><span>{toast}</span>
        <button type="button" className="chip" onClick={() => setToast(null)} aria-label="关闭提示">×</button></div>}

      {visible.length === 0 ? (
        <div className="empty"><p className="empty__text">没有匹配的工具</p><p className="empty__hint">换个关键词试试</p></div>
      ) : (
        <div className="tool-grid">
          {visible.map((tool) => (
            <button key={tool.id} type="button" className="tool-card" data-status={tool.status}
              style={{ '--tool-color': categoryColor(tool.category) } as CSSProperties}
              onClick={() => handleOpen(tool)}>
              <span className="tool-card__icon" aria-hidden="true">{tool.icon}</span>
              <span className="tool-card__name">{tool.name}</span>
              <span className="tool-card__desc">{tool.description}</span>
              {tool.status !== 'ready' && (
                <span className="tool-card__badge">{tool.status === 'soon' ? '开发中' : '外链'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
