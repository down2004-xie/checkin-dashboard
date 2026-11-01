import { lazy, Suspense, useMemo, useState, type ComponentType, type CSSProperties, type LazyExoticComponent } from 'react'

import type { DateKey } from '../../types'
import { TOOLS, TOOL_CATEGORIES, filterTools, searchTools, type ToolCategory, type ToolDef } from '../../data/tools'

/** 所有工具组件收到的 props。多数工具用不到 today，忽略即可 */
export interface ToolProps {
  today: DateKey
}

/**
 * 把「具名导出的组件」包成 React.lazy 需要的形状（lazy 只认 default 导出）。
 * 每个工具单独打成一个 chunk：签到看板是主视图，不该为了偶尔用一次的工具
 * 预先加载全部工具箱 JS。只有点进某个工具时才去拉它那一份。
 */
function lazyNamed<K extends string>(load: () => Promise<Record<K, ComponentType<ToolProps>>>, name: K): LazyExoticComponent<ComponentType<ToolProps>> {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

/**
 * 工具 id → 组件 的映射表。每个 ready 工具都必须有一条，
 * 漏绑定的话打开是空面板（下面有兜底提示，test:toolbox 也会逐个点开所有 ready 工具检查）。
 */
const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType<ToolProps>>> = {
  'unit-convert': lazyNamed(() => import('./UnitConverter'), 'UnitConverter'),
  countdown: lazyNamed(() => import('./CountdownTool'), 'CountdownTool'),
  'random-pick': lazyNamed(() => import('./RandomPick'), 'RandomPick'),
  'answer-book': lazyNamed(() => import('./AnswerBook'), 'AnswerBook'),
  'rmb-uppercase': lazyNamed(() => import('./RmbUppercase'), 'RmbUppercase'),
  'loan-calc': lazyNamed(() => import('./LoanCalculator'), 'LoanCalculator'),
  'color-tool': lazyNamed(() => import('./ColorTool'), 'ColorTool'),
  barcode: lazyNamed(() => import('./BarcodeTool'), 'BarcodeTool'),
  'qr-code': lazyNamed(() => import('./QrCodeTool'), 'QrCodeTool'),
  'image-convert': lazyNamed(() => import('./ImageConvert'), 'ImageConvert'),
  'image-compress': lazyNamed(() => import('./ImageCompress'), 'ImageCompress'),
  'image-crop': lazyNamed(() => import('./ImageCrop'), 'ImageCrop'),
  'image-watermark': lazyNamed(() => import('./ImageWatermark'), 'ImageWatermark'),
  'image-grid': lazyNamed(() => import('./ImageSlice'), 'ImageSlice'),
  'image-stitch': lazyNamed(() => import('./ImageStitch'), 'ImageStitch'),
  'image-mosaic': lazyNamed(() => import('./ImageMosaic'), 'ImageMosaic'),
  'id-photo': lazyNamed(() => import('./ImageIdPhoto'), 'ImageIdPhoto'),
  'exif-viewer': lazyNamed(() => import('./ExifViewer'), 'ExifViewer'),
  'pdf-convert': lazyNamed(() => import('./ImagesToPdf'), 'ImagesToPdf'),
  'pdf-to-image': lazyNamed(() => import('./PdfToImage'), 'PdfToImage'),
  'pdf-merge-split': lazyNamed(() => import('./PdfMergeSplit'), 'PdfMergeSplit'),
  'pdf-to-word': lazyNamed(() => import('./PdfToWord'), 'PdfToWord'),
  'text-stats': lazyNamed(() => import('./TextStatsTool'), 'TextStatsTool'),
  'text-diff': lazyNamed(() => import('./TextDiff'), 'TextDiff'),
  'encode-convert': lazyNamed(() => import('./EncodeConvert'), 'EncodeConvert'),
  'hash-calc': lazyNamed(() => import('./HashCalc'), 'HashCalc'),
  'text-encrypt': lazyNamed(() => import('./TextEncrypt'), 'TextEncrypt'),
  'password-gen': lazyNamed(() => import('./PasswordGen'), 'PasswordGen'),
  'web-share': lazyNamed(() => import('./WebShare'), 'WebShare'),
}

interface ToolboxViewProps {
  today: DateKey
}

const BADGE: Record<Exclude<ToolDef['status'], 'ready'>, string> = {
  soon: '开发中',
  unavailable: '需后端',
  link: '外链',
}
/**
 * 工具箱视图。
 *
 * 和签到看板是「同一页面的不同视图」，不是路由 —— 顶层用 view 切换，
 * 所以这里不需要处理 URL。工具卡片是静态数据驱动的：加工具改 data/tools.ts + 上面的映射表。
 *
 * 四种卡片状态各自的行为在 handleOpen 里集中处理：
 * ready 进面板、soon / unavailable 给提示、link 新标签打开。
 */
export function ToolboxView({ today }: ToolboxViewProps) {
  const [category, setCategory] = useState<ToolCategory | null>(null)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const categoryColor = (id: ToolCategory) =>
    TOOL_CATEGORIES.find((item) => item.id === id)?.color ?? '#6ea8ff'

  const visible = useMemo(() => searchTools(filterTools(category), query), [category, query])
  // chip 上的数量跟着搜索词走：搜「PDF」时「图片 0」比「图片 9」诚实
  const matched = useMemo(() => searchTools(TOOLS, query), [query])

  const handleOpen = (tool: ToolDef) => {
    if (tool.status === 'ready') {
      setActiveId(tool.id)
      setToast(null)
    } else if (tool.status === 'link' && tool.link) {
      window.open(tool.link, '_blank', 'noopener,noreferrer')
    } else if (tool.status === 'unavailable') {
      setToast(`「${tool.name}」暂不可用：${tool.description}`)
    } else {
      setToast(`「${tool.name}」正在开发中，敬请期待`)
    }
  }

  // 进入某个工具的面板
  if (activeId) {
    const tool = TOOLS.find((item) => item.id === activeId)
    const Tool = TOOL_COMPONENTS[activeId]
    return (
      <section className="toolbox" aria-label="工具箱">
        <div className="toolbox__head">
          <button type="button" className="btn" onClick={() => setActiveId(null)}>← 返回工具列表</button>
          <h1 className="toolbox__title toolbox__title--inline">{tool?.icon} {tool?.name}</h1>
        </div>
        <Suspense fallback={<p className="hint toolbox__loading">正在加载工具…</p>}>
          {Tool ? <Tool today={today} /> : (
            <div className="tool-panel" role="alert"><p className="site-form__error">这个工具还没有接入面板（映射表里缺少「{activeId}」）</p></div>
          )}
        </Suspense>
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
          aria-pressed={category === null} onClick={() => setCategory(null)}>全部 {matched.length}</button>
        {TOOL_CATEGORIES.map((item) => (
          <button key={item.id} type="button" className={`chip${category === item.id ? ' chip--active' : ''}`}
            aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label} {matched.filter((tool) => tool.category === item.id).length}
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
            <button key={tool.id} type="button" className="tool-card" data-status={tool.status} data-tool-id={tool.id}
              style={{ '--tool-color': categoryColor(tool.category) } as CSSProperties}
              onClick={() => handleOpen(tool)}>
              <span className="tool-card__icon" aria-hidden="true">{tool.icon}</span>
              <span className="tool-card__name">{tool.name}</span>
              <span className="tool-card__desc">{tool.description}</span>
              {tool.status !== 'ready' && <span className="tool-card__badge">{BADGE[tool.status]}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
