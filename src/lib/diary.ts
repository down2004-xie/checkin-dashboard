import type { DateKey, DiaryEntry } from '../types'
import { analyzeText } from './text-stats'

/**
 * 电子日记的纯逻辑（v7）。组件只负责渲染，「一条日记长什么样、怎么排、怎么搜」都在这里。
 *
 * 和 `todo.ts` 同一条理由：创建逻辑是数据契约的一部分，放在 lib 里才能单测，
 * 散到组件里，将来改 id 生成方式就得去组件里翻。
 */

/**
 * 新建一条日记。
 *
 * - id 用随机 UUID（理由见 types.ts 里 DiaryEntry.id 的注释）；
 * - 标题 trim 后为空就不写这个字段（不存空串，和 sanitizeDiary 口径一致）；
 * - 正文原样保留（缩进、空行是用户的排版），是否为空由调用方 / reducer 判断。
 *
 * `now` 可注入，单测时给固定时间，结果就是确定的。
 */
export function createDiaryEntry(text: string, title?: string, now: Date = new Date()): DiaryEntry {
  const trimmedTitle = title?.trim()
  return {
    id: crypto.randomUUID(),
    text,
    ...(trimmedTitle ? { title: trimmedTitle } : {}),
    createdAt: now.toISOString(),
  }
}

/**
 * 同一天内的日记按创建时间**从早到晚**排（像翻本子，先写的在上面）。
 *
 * 缺 createdAt 的老数据按空串处理 → 排在最前；时间相同时保持原数组顺序
 * （`Array.prototype.sort` 在 ES2019 起保证稳定）。不变异入参。
 */
export function sortDiary(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
}

/** 搜索结果里的一项：哪一天、哪一条 */
export interface DiaryHit {
  day: DateKey
  entry: DiaryEntry
}

/**
 * 在全部日记里按关键字搜（标题 + 正文，大小写不敏感）。
 *
 * 结果按日期**从新到旧**排（找历史时最近的最可能是想要的），同一天内按 sortDiary 的顺序。
 * 空查询返回空数组 —— 搜索框是空的时候界面应该显示「当天视图」，而不是把所有日记铺出来。
 */
export function searchDiary(diary: Record<DateKey, DiaryEntry[]>, query: string): DiaryHit[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return []

  const hits: DiaryHit[] = []
  for (const day of diaryDays(diary)) {
    for (const entry of sortDiary(diary[day])) {
      const haystack = `${entry.title ?? ''}\n${entry.text}`.toLowerCase()
      if (haystack.includes(keyword)) hits.push({ day, entry })
    }
  }
  return hits
}

/** 有日记的日期，从新到旧。DateKey 是 YYYY-MM-DD，字符串比较就是日期比较 */
export function diaryDays(diary: Record<DateKey, DiaryEntry[]>): DateKey[] {
  return Object.keys(diary).filter((day) => diary[day].length > 0).sort().reverse()
}

/**
 * 把 ISO 时间显示成本地「HH:mm」。缺失或解析不了返回 null（界面上就不显示时间）。
 *
 * 用本地时区 getHours / getMinutes，和 date.ts 同一条约定：不要拿 UTC 当用户看到的时间。
 */
export function formatEntryTime(createdAt: string | undefined): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return null
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 正文的一行预览（搜索结果列表用）：压掉换行和多余空白，超过 max 个字符截断加省略号。
 *
 * 用 `Array.from` 按码点截，避免把 emoji 这类代理对切成半个乱码。
 */
export function previewText(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat
}

/**
 * 日记字数：中文按字、英文按词，和「文本字数统计」工具同一个口径（复用 analyzeText，不另写一份）。
 * 数字串和标点不计 —— 用户心里的「写了多少字」指的是文字本身。
 */
export function countWords(text: string): number {
  const stats = analyzeText(text)
  return stats.chinese + stats.words
}

/**
 * 关页时有没有「真的会丢」的内容 —— 决定要不要挂 beforeunload 提醒（见 hooks/useLeaveGuard.ts）。
 *
 * 判据刻意窄：**正文有字，且和已保存的版本不同**才算。这个提醒会打断用户关页，
 * 判据一宽（比如「只要在编辑态就弹」），每次正常关页都要多点一下，用户很快就学会无视它。
 *
 * - 正文为空或纯空白 → 不算：这种草稿本来就存不进去（正文必填），存储里还是旧版本，关页不丢东西。
 * - 标题按 trim 后比较：reducer 存标题前会 trim，「 周会 」和「周会」存进去是同一个值。
 * - 正文按原样比较：正文原样存储，多一个空行也是用户的改动。
 *
 * 新建表单传 `saved = { title: '', text: '' }`，于是「正文写了字还没点保存」就算未保存。
 */
export function hasUnsavedDraft(
  draft: { title: string; text: string },
  saved: { title: string; text: string },
): boolean {
  if (!draft.text.trim()) return false
  return draft.text !== saved.text || draft.title.trim() !== saved.title.trim()
}
