import { useCallback, useMemo, useRef, useState } from 'react'

import { useCheckInStore } from './hooks/useCheckInStore'
import { useDaylight } from './hooks/useDaylight'
import { useToday } from './hooks/useToday'
import { usePointerLight } from './hooks/usePointerLight'
import { calcLongestStreak, calcSiteStreak, calcStreak, countCheckedValid } from './lib/streak'
import { backupFilename, createBackup, mergeData, parseBackup, serializeBackup } from './lib/backup'
import type { BookmarkParseResult } from './lib/bookmarks'
import { parseBookmarks, planImport } from './lib/bookmarks'
import { siteHost } from './lib/site-form'
import { ProgressHeader } from './components/ProgressHeader'
import { FilterBar } from './components/FilterBar'
import { SiteGrid } from './components/SiteGrid'
import { Heatmap } from './components/Heatmap'
import { SiteForm } from './components/SiteForm'
import { BookmarkImport } from './components/BookmarkImport'
import { BackupBar } from './components/BackupBar'

export function App() {
  useDaylight()
  usePointerLight()

  const today = useToday()
  const { data, toggle, addSite, addSites, updateSite, removeSite, replaceAll, saveError } =
    useCheckInStore()

  const [notice, setNotice] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  /** 正在编辑的站点 id；null 表示没有编辑中的站点 */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** 是否显示「新增站点」表单 */
  const [showAddForm, setShowAddForm] = useState(false)
  /** 书签解析结果；null 表示没在导入书签。有值就显示文件夹勾选面板 */
  const [bookmarkPlan, setBookmarkPlan] = useState<BookmarkParseResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bookmarkInputRef = useRef<HTMLInputElement>(null)

  const sites = data.sites

  /** 当前仍存在的站点 id 集合，用于「今日进度只数活着的站点」 */
  const validIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites])

  /** 站点 id -> 域名。站点的身份就是域名，很多校验都要用 */
  const hostsBySiteId = useMemo(() => {
    const map = new Map<string, string>()
    for (const site of sites) {
      const host = siteHost(site.url)
      if (host !== null) map.set(site.id, host)
    }
    return map
  }, [sites])

  const allHosts = useMemo(() => new Set(hostsBySiteId.values()), [hostsBySiteId])

  /**
   * 表单要检查的「已占用域名」。
   *
   * 编辑时必须把被编辑的这个站自己排除掉 —— 否则它自己的域名会被判定成重复，
   * 连改个分类都保存不了。
   */
  const takenHosts = useMemo(() => {
    if (editingId === null) return allHosts

    const host = hostsBySiteId.get(editingId)
    if (host === undefined) return allHosts

    const next = new Set(allHosts)
    next.delete(host)
    return next
  }, [allHosts, hostsBySiteId, editingId])

  /** 所有去重后的分类，供 FilterBar 渲染 */
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const site of sites) {
      if (site.category) set.add(site.category)
    }
    return Array.from(set)
  }, [sites])

  /** 按分类筛选后的站点 */
  const visibleSites = useMemo(
    () =>
      activeCategory === null
        ? sites
        : sites.filter((s) => s.category === activeCategory),
    [sites, activeCategory],
  )

  const checkedIds = useMemo(
    () => new Set(data.records[today] ?? []),
    [data.records, today],
  )

  /** 站点 id -> 累计签到天数 */
  const totalDaysById = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ids of Object.values(data.records)) {
      for (const id of ids) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return counts
  }, [data.records])

  /** 站点 id -> 当前连续签到天数 */
  const siteStreakById = useMemo(() => {
    const map = new Map<string, number>()
    for (const site of sites) {
      map.set(site.id, calcSiteStreak(data, site.id, today))
    }
    return map
  }, [data, sites, today])

  const done = countCheckedValid(data, today, validIds)
  const total = sites.length
  const streak = calcStreak(data, today)
  const longest = calcLongestStreak(data)

  const handleToggle = useCallback(
    (siteId: string) => toggle(today, siteId),
    [toggle, today],
  )

  const handleAddSite = useCallback(
    (site: Parameters<typeof addSite>[0]) => {
      addSite(site)
      setShowAddForm(false)
      setNotice(`已添加「${site.name}」`)
    },
    [addSite],
  )

  /** 删除站点前二次确认，避免误删（历史记录保留，但站点本身没了） */
  const handleRemoveSite = useCallback(
    (siteId: string) => {
      const site = sites.find((s) => s.id === siteId)
      const confirmed = window.confirm(
        `确定删除「${site?.name ?? siteId}」吗？\n历史签到记录会保留，重新添加同 id 站点可恢复。`,
      )
      if (confirmed) {
        removeSite(siteId)
        setNotice('已删除站点')
      }
    },
    [sites, removeSite],
  )

  /** 导出：生成 JSON 文件并触发下载 */
  const handleExport = useCallback(() => {
    const text = serializeBackup(createBackup(data))
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = backupFilename()
    anchor.click()

    // 必须释放，否则这个 blob 会一直占着内存直到页面关闭
    URL.revokeObjectURL(url)
    setNotice('已导出备份文件')
  }, [data])

  /** 导入：读文件 → 解析 → 合并 → 落盘 */
  const handleImportFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const result = parseBackup(text)

      if (!result.ok) {
        setNotice(`导入失败：${result.reason}`)
        return
      }

      // 合并而不是覆盖：避免丢掉当前设备上已有的记录
      replaceAll(mergeData(data, result.backup.data))
      setNotice('导入成功，已与现有记录合并')
    },
    [data, replaceAll],
  )

  /** 选好书签文件 → 解析出文件夹列表 → 打开勾选面板（此时还没写入任何数据） */
  const handleBookmarkFile = useCallback(async (file: File) => {
    const html = await file.text()
    const result = parseBookmarks(html)

    if (result.groups.length === 0) {
      setNotice('没从这份文件里解析出书签，确认是浏览器导出的书签 HTML 吗')
      return
    }

    setBookmarkPlan(result)
    setShowAddForm(false)
    setEditingId(null)
    setNotice(null)
  }, [])

  /** 勾选确认 → 算出最终要新增的站点 → 一次性批量写入 */
  const handleBookmarkConfirm = useCallback(
    (selected: ReadonlySet<string>) => {
      if (bookmarkPlan === null) return

      const plan = planImport(bookmarkPlan.groups, selected, validIds)
      const skipped = plan.duplicate > 0 ? `，另有 ${plan.duplicate} 个站点已存在被跳过` : ''

      addSites(plan.sites)
      setBookmarkPlan(null)
      setNotice(
        plan.sites.length === 0
          ? '勾选的文件夹里没有新站点'
          : `已从书签导入 ${plan.sites.length} 个站点${skipped}`,
      )
    },
    [bookmarkPlan, validIds, addSites],
  )

  const editingSite = editingId === null ? null : sites.find((s) => s.id === editingId) ?? null

  return (
    <div className="app">
      <ProgressHeader done={done} total={total} streak={streak} longest={longest} />

      {saveError && (
        <div className="alert" role="alert">
          数据没能保存到浏览器（可能是隐私模式或存储被禁用）。
          建议立即导出备份，否则刷新后记录会丢失。
        </div>
      )}

      <FilterBar
        categories={categories}
        active={activeCategory}
        onSelect={setActiveCategory}
      />

      <Heatmap data={data} today={today} total={total} />

      <SiteGrid
        sites={visibleSites}
        checkedIds={checkedIds}
        totalDaysById={totalDaysById}
        siteStreakById={siteStreakById}
        onToggle={handleToggle}
        onEdit={(siteId) => {
          setEditingId(siteId)
          setShowAddForm(false)
        }}
        onRemove={handleRemoveSite}
      />

      {/* 新增站点表单 */}
      {showAddForm && (
        <div className="site-form-wrap">
          <SiteForm
            existingHosts={takenHosts}
            onSubmit={handleAddSite}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* 编辑站点表单 */}
      {editingSite && (
        <div className="site-form-wrap">
          <SiteForm
            initial={editingSite}
            existingHosts={takenHosts}
            onSubmit={(site) => {
              updateSite(site.id, { name: site.name, url: site.url, category: site.category })
              setEditingId(null)
              setNotice(`已保存「${site.name}」`)
            }}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {/* 书签导入：解析出的文件夹勾选面板 */}
      {bookmarkPlan && (
        <div className="site-form-wrap">
          <BookmarkImport
            result={bookmarkPlan}
            existingIds={validIds}
            onConfirm={handleBookmarkConfirm}
            onCancel={() => setBookmarkPlan(null)}
          />
        </div>
      )}

      {/* 添加按钮：站点为空时也在网格区下方给出入口 */}
      <div className="add-site-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setShowAddForm((v) => !v)
            setEditingId(null)
            setBookmarkPlan(null)
          }}
        >
          {showAddForm ? '收起' : '＋ 添加站点'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => bookmarkInputRef.current?.click()}
        >
          从书签导入
        </button>
      </div>

      <BackupBar
        notice={notice}
        onExport={handleExport}
        onImportClick={() => fileInputRef.current?.click()}
      />

      {/* 隐藏的文件输入，由 BackupBar 的按钮间接触发 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleImportFile(file)
          // 清空 value，否则连续选同一个文件不会再触发 change
          event.target.value = ''
        }}
      />

      {/* 书签文件输入。和备份分开两个 input：accept 不同，
          而且合并的话分不清用户到底想导备份还是导书签 */}
      <input
        ref={bookmarkInputRef}
        type="file"
        accept="text/html,.html,.htm"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleBookmarkFile(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
