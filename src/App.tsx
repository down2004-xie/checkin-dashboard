import { useEffect, useMemo, useRef, useState } from 'react'
import type { CheckInData, Site, Todo } from './types'
import { useCheckInStore } from './hooks/useCheckInStore'
import { useCompletionBurst } from './hooks/useCompletionBurst'
import { useDaylight } from './hooks/useDaylight'
import { useToday } from './hooks/useToday'
import { usePointerLight } from './hooks/usePointerLight'
import { calcLongestStreak, calcSiteStreak, calcStreak, countCheckedValid } from './lib/streak'
import { backupFilename, createBackup, parseBackup, serializeBackup, type Backup } from './lib/backup'
import { parseBookmarks, planImport, type BookmarkParseResult } from './lib/bookmarks'
import { emptyData } from './lib/storage'
import { addDays } from './lib/date'
import { siteHost } from './lib/site-form'
import { filterSites, type SiteFilters } from './lib/sites'
import { ProgressHeader } from './components/ProgressHeader'
import { FilterBar } from './components/FilterBar'
import { SiteGrid } from './components/SiteGrid'
import { Heatmap } from './components/Heatmap'
import { SiteForm } from './components/SiteForm'
import { BookmarkImport } from './components/BookmarkImport'
import { BackupBar } from './components/BackupBar'
import { TodoPanel } from './components/TodoPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SakuraTree } from './components/SakuraTree'
import { PetalLayer } from './components/PetalLayer'

interface ImportPreview {
  backup: Backup
  dropped: number
  raw: string | null
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function App() {
  const today = useToday()
  const { data, issue, raw, error, busy, run, recover, refresh } = useCheckInStore(today)
  const { preferences, sites } = data
  useDaylight(preferences.theme)
  usePointerLight(preferences.effects === 'full')
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFilters] = useState<SiteFilters>({ query: '', category: null, status: 'all', sort: 'manual' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [bookmarkPlan, setBookmarkPlan] = useState<BookmarkParseResult | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [readingFile, setReadingFile] = useState(false)
  const [undo, setUndo] = useState<{ todo: Todo; index: number; day: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bookmarkInputRef = useRef<HTMLInputElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.dataset.effects = preferences.effects
    document.documentElement.dataset.compact = String(preferences.compact)
    return () => {
      delete document.documentElement.dataset.effects
      delete document.documentElement.dataset.compact
    }
  }, [preferences.effects, preferences.compact])

  const categories = useMemo(() => [...new Set(sites.map((site) => site.category ?? ''))], [sites])
  const effectiveFilters = { ...filters, category: filters.category !== null && !categories.includes(filters.category) ? null : filters.category }
  const checkedIds = useMemo(() => new Set(data.records[today] ?? []), [data.records, today])
  const visibleSites = filterSites(sites, checkedIds, effectiveFilters)
  const activeSites = sites.filter((site) => !site.paused)
  const validIds = new Set(sites.map((site) => site.id))
  const done = countCheckedValid(data, today, new Set(activeSites.map((site) => site.id)))
  const total = activeSites.length
  const burstId = useCompletionBurst(done, total)
  const editingSite = sites.find((site) => site.id === editingId)
  const takenHosts = new Set(sites.filter((site) => site.id !== editingId).map((site) => siteHost(site.url)).filter((host): host is string => host !== null))
  const todayTodos = data.todos[today] ?? []
  const yesterday = addDays(today, -1)
  const carryCount = (data.todos[yesterday] ?? []).filter((todo) => !todo.done && !todayTodos.some((item) => item.id === todo.id)).length

  const statistics = useMemo(() => {
    const totals = new Map<string, number>()
    for (const ids of Object.values(data.records)) for (const id of new Set(ids)) totals.set(id, (totals.get(id) ?? 0) + 1)
    const streaks = new Map(sites.map((site) => [site.id, calcSiteStreak(data, site.id, today)]))
    return { totals, streaks, streak: calcStreak(data, today), longest: calcLongestStreak(data) }
  }, [data.records, sites, today])

  const handleSiteSubmit = async (site: Site) => {
    const ok = await run(editingId ? { type: 'siteUpdated', id: site.id, patch: { name: site.name, url: site.url, category: site.category } } : { type: 'siteAdded', site })
    if (ok) {
      setNotice(`已保存「${site.name}」`)
      setEditingId(null)
      setShowAddForm(false)
    }
  }

  const handleFile = async (file: File, kind: 'backup' | 'bookmarks') => {
    if (file.size > 5 * 1024 * 1024) {
      setNotice('文件超过 5 MB，请先拆分或选择较小的文件')
      return
    }
    setReadingFile(true)
    try {
      const text = await file.text()
      if (kind === 'backup') {
        const result = parseBackup(text)
        if (!result.ok) { setNotice(`导入失败：${result.reason}`); return }
        setImportPreview({ backup: result.backup, dropped: result.dropped, raw })
        setBookmarkPlan(null)
      } else {
        const result = parseBookmarks(text)
        if (!result.groups.length) { setNotice('没有找到书签，请选择浏览器导出的 HTML 文件'); return }
        setBookmarkPlan(result)
        setImportPreview(null)
      }
      setShowAddForm(false)
      setEditingId(null)
      setNotice(null)
      window.setTimeout(() => feedbackRef.current?.scrollIntoView({ block: 'nearest' }), 0)
    } catch {
      setNotice('读取文件失败，请检查文件是否可访问后重试')
    } finally {
      setReadingFile(false)
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    if (issue && !window.confirm('用此备份恢复当前数据？原始内容会另存为本机恢复副本，建议先下载原始数据。')) return
    const ok = issue ? await recover(importPreview.backup.data, importPreview.raw) : await run({ type: 'merged', data: importPreview.backup.data })
    if (ok) { setImportPreview(null); setNotice(issue ? '已从备份恢复' : '导入成功，已合并记录；同 ID 内容保留本机版本') }
  }

  const reset = async () => {
    if (!window.confirm('确认重新开始？请先下载原始数据。原始内容会保存在本机恢复副本中，但不能代替下载备份。')) return
    if (await recover(emptyData(), raw)) setNotice('已重新开始，原始内容保存在本机恢复副本中')
  }

  const removeTodo = async (todo: Todo, index: number) => {
    if (await run({ type: 'todoRemoved', day: today, id: todo.id })) setUndo({ todo, index, day: today })
  }

  const exportData = (value: CheckInData) => {
    download(serializeBackup(createBackup(value)), backupFilename())
    setNotice('已导出备份文件')
  }

  return (
    <main className="app">
      <SakuraTree fullBloom={total > 0 && done === total} />
      {preferences.effects === 'full' && <PetalLayer burstId={burstId} />}
      <ProgressHeader done={done} total={total} streak={statistics.streak} longest={statistics.longest} />
      <p className="dashboard-date">{today} · 今日目标 {total} 个{sites.length > total ? ` · 已暂停 ${sites.length - total} 个` : ''}</p>

      {issue && <section className="alert recovery" role="alert">
        <h2>数据保护模式</h2><p>{issue}。已停止写入，不会用默认数据覆盖原始内容。</p>
        <div className="toolbar">
          <button className="btn" disabled={raw === null} onClick={() => raw !== null && download(raw, `checkin-original-${today}.json`)}>下载原始数据</button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>从备份恢复</button>
          <button className="btn" onClick={refresh}>重新读取</button>
          <button className="btn" disabled={busy} onClick={() => void reset()}>确认重置…</button>
        </div>
      </section>}
      {error && <p className="alert" role="alert">{error}</p>}
      <div ref={feedbackRef} className="feedback" aria-live="polite">
        {notice && <div className="notice"><span>{notice}</span><button type="button" className="chip" onClick={() => setNotice(null)} aria-label="关闭提示">×</button></div>}
        {busy && <p className="hint">正在保存…</p>}
        {readingFile && <p className="hint">正在读取文件…</p>}
      </div>

      {importPreview && <section className="panel import-preview" aria-label="备份导入预览">
        <h2>确认导入备份</h2>
        <p>{importPreview.backup.data.sites.length} 个有效站点 · {Object.keys(importPreview.backup.data.records).length} 天签到记录 · {Object.values(importPreview.backup.data.todos).flat().length} 条待办</p>
        <p>{importPreview.dropped > 0 ? `有 ${importPreview.dropped} 条数据无法读取，导入时会跳过（重复项会被自动合并，不计入）。` : '文件中的站点、记录和待办都能读取。'}</p>
        <p className="hint">{issue ? '保护模式下将使用这份备份恢复数据。' : '签到记录取并集；同 ID 的站点、待办和同一天的目标保留本机版本。删除与取消勾选不会从备份反向同步，主题设置也保持本机偏好。'}</p>
        <div className="toolbar"><button className="btn btn--primary" disabled={busy} onClick={() => void confirmImport()}>{issue ? '确认恢复' : '确认合并'}</button><button className="btn" onClick={() => setImportPreview(null)}>取消</button></div>
      </section>}

      <fieldset className="dashboard-controls" disabled={!!issue || busy}>
        <legend className="visually-hidden">签到与待办管理</legend>
        <SettingsPanel value={preferences} onChange={(patch) => void run({ type: 'preferencesChanged', patch })} />
        <FilterBar categories={categories} filters={effectiveFilters} count={visibleSites.length} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} />
        <SiteGrid sites={visibleSites} totalCount={sites.length} manualOrder={filters.sort === 'manual'} checkedIds={checkedIds}
          totalDaysById={statistics.totals} siteStreakById={statistics.streaks}
          onToggle={(siteId) => void run({ type: 'checkedSet', day: today, siteId, checked: !checkedIds.has(siteId) })}
          onEdit={(siteId) => { setEditingId(siteId); setShowAddForm(false); setBookmarkPlan(null) }}
          onRemove={async (id) => { if (window.confirm('删除此站点？历史记录和已保存的每日目标仍会保留。')) { if (await run({ type: 'siteRemoved', id })) setNotice('已删除站点，历史记录保留') } }}
          onUpdate={(id, patch) => void run({ type: 'siteUpdated', id, patch })}
          onMove={(id, targetId) => void run({ type: 'siteMoved', id, targetId })} />

        {(showAddForm || editingSite) && <div className="site-form-wrap"><SiteForm key={editingSite?.id ?? 'new'} initial={editingSite}
          existingHosts={takenHosts} existingIds={validIds} onSubmit={(site) => void handleSiteSubmit(site)} onCancel={() => { setEditingId(null); setShowAddForm(false) }} /></div>}
        {bookmarkPlan && <div className="site-form-wrap"><BookmarkImport result={bookmarkPlan} existingIds={validIds}
          onConfirm={async (selected) => { const plan = planImport(bookmarkPlan.groups, selected, validIds); if (await run({ type: 'sitesAdded', sites: plan.sites })) { setBookmarkPlan(null); setNotice(`已从书签导入 ${plan.sites.length} 个站点，跳过 ${plan.duplicate} 个重复站点`) } }}
          onCancel={() => setBookmarkPlan(null)} /></div>}
        <div className="add-site-row">
          <button type="button" className="btn btn--primary" onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); setBookmarkPlan(null) }}>{showAddForm ? '收起' : '＋ 添加站点'}</button>
          <button type="button" className="btn" onClick={() => bookmarkInputRef.current?.click()}>从书签导入</button>
          <button type="button" className="btn" onClick={() => setFilters({ query: '', category: null, status: 'all', sort: 'manual' })}>重置筛选</button>
        </div>
        <TodoPanel key={today} todos={todayTodos} carryCount={carryCount}
          onAdd={(todo) => run({ type: 'todoAdded', day: today, todo })}
          onToggle={(id, done) => void run({ type: 'todoDoneSet', day: today, id, done })}
          onEdit={(id, text) => run({ type: 'todoEdited', day: today, id, text })}
          onRemove={(todo, index) => void removeTodo(todo, index)}
          onCarry={() => { if (window.confirm(`将昨天未完成的 ${carryCount} 项带入今天？昨天的记录会保留。`)) void run({ type: 'todosCarried', from: yesterday, day: today }) }} />
        {undo && <div className="notice" role="status">已删除「{undo.todo.text}」<button type="button" className="chip" onClick={async () => { if (await run({ type: 'todoRestored', ...undo })) setUndo(null) }}>撤销删除</button><button type="button" className="chip" onClick={() => setUndo(null)} aria-label="关闭撤销提示">×</button></div>}
      </fieldset>
      <Heatmap data={data} today={today} />
      <BackupBar notice={null} onExport={() => exportData(data)} onImportClick={() => fileInputRef.current?.click()} />
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="visually-hidden" disabled={readingFile || busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file, 'backup'); event.target.value = '' }} />
      <input ref={bookmarkInputRef} type="file" accept="text/html,.html,.htm" className="visually-hidden" disabled={!!issue || readingFile || busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file, 'bookmarks'); event.target.value = '' }} />
    </main>
  )
}
