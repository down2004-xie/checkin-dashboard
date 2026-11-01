import { describe, expect, it } from 'vitest'

import type { DiaryEntry } from '../types'
import {
  countWords,
  createDiaryEntry,
  diaryDays,
  formatEntryTime,
  hasUnsavedDraft,
  previewText,
  searchDiary,
  sortDiary,
} from './diary'

/** 造一条日记。createdAt 传 undefined 表示「老数据没有时间」 */
function entry(id: string, text: string, createdAt?: string, title?: string): DiaryEntry {
  return { id, text, ...(title !== undefined ? { title } : {}), ...(createdAt !== undefined ? { createdAt } : {}) }
}

describe('createDiaryEntry', () => {
  const now = new Date('2026-10-26T01:02:03.000Z')

  it('标题会 trim', () => {
    expect(createDiaryEntry('正文', '  周会纪要  ', now).title).toBe('周会纪要')
  })

  it('空标题或纯空白标题不写 title 字段（不存空串）', () => {
    expect('title' in createDiaryEntry('正文', undefined, now)).toBe(false)
    expect('title' in createDiaryEntry('正文', '', now)).toBe(false)
    expect('title' in createDiaryEntry('正文', '   ', now)).toBe(false)
  })

  it('createdAt 来自注入的 now', () => {
    expect(createDiaryEntry('正文', undefined, now).createdAt).toBe('2026-10-26T01:02:03.000Z')
  })

  it('正文原样保留，包括缩进和空行', () => {
    const text = '  第一段缩进\n\n\n    第二段\n'
    expect(createDiaryEntry(text, undefined, now).text).toBe(text)
  })

  it('两次创建的 id 不同', () => {
    expect(createDiaryEntry('同样的字', undefined, now).id).not.toBe(createDiaryEntry('同样的字', undefined, now).id)
  })
})

describe('sortDiary', () => {
  it('按 createdAt 从早到晚排', () => {
    const items = [
      entry('c', 'c', '2026-10-26T12:00:00.000Z'),
      entry('a', 'a', '2026-10-26T08:00:00.000Z'),
      entry('b', 'b', '2026-10-26T10:00:00.000Z'),
    ]
    expect(sortDiary(items).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('缺 createdAt 的老数据排在最前', () => {
    const items = [entry('new', 'x', '2026-10-26T08:00:00.000Z'), entry('old', 'y')]
    expect(sortDiary(items).map((item) => item.id)).toEqual(['old', 'new'])
  })

  it('时间相同时保持原数组顺序（稳定排序）', () => {
    const time = '2026-10-26T08:00:00.000Z'
    const items = [entry('first', '1', time), entry('second', '2', time), entry('third', '3', time)]
    expect(sortDiary(items).map((item) => item.id)).toEqual(['first', 'second', 'third'])
  })

  it('不变异入参', () => {
    const items = [entry('b', 'b', '2026-10-26T10:00:00.000Z'), entry('a', 'a', '2026-10-26T08:00:00.000Z')]
    const sorted = sortDiary(items)
    expect(sorted).not.toBe(items)
    expect(items.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

describe('searchDiary', () => {
  const diary = {
    '2026-10-24': [entry('old', '和导师讨论了 React 状态管理', '2026-10-24T08:00:00.000Z')],
    '2026-10-26': [
      entry('meeting', '确认了下周的排期', '2026-10-26T09:00:00.000Z', '周会纪要'),
      entry('log', '修了一个 react 渲染的 bug', '2026-10-26T15:00:00.000Z'),
    ],
  }

  it('空查询和纯空白查询返回 []', () => {
    expect(searchDiary(diary, '')).toEqual([])
    expect(searchDiary(diary, '   ')).toEqual([])
  })

  it('大小写不敏感', () => {
    expect(searchDiary(diary, 'REACT').map((hit) => hit.entry.id)).toEqual(['log', 'old'])
  })

  it('能命中标题', () => {
    expect(searchDiary(diary, '周会')).toEqual([{ day: '2026-10-26', entry: diary['2026-10-26'][0] }])
  })

  it('能命中正文', () => {
    expect(searchDiary(diary, '导师').map((hit) => hit.day)).toEqual(['2026-10-24'])
  })

  it('结果按日期从新到旧', () => {
    expect(searchDiary(diary, 'r').map((hit) => hit.day)).toEqual(['2026-10-26', '2026-10-24'])
  })
})

describe('diaryDays', () => {
  it('按日期从新到旧返回', () => {
    const diary = {
      '2026-09-30': [entry('a', 'a')],
      '2026-10-26': [entry('b', 'b')],
      '2026-10-02': [entry('c', 'c')],
    }
    expect(diaryDays(diary)).toEqual(['2026-10-26', '2026-10-02', '2026-09-30'])
  })

  it('跳过空数组的天', () => {
    expect(diaryDays({ '2026-10-25': [], '2026-10-26': [entry('a', 'a')] })).toEqual(['2026-10-26'])
  })
})

describe('formatEntryTime', () => {
  it('显示成本地时区的 HH:mm', () => {
    // 用本地时间构造，避免测试结果依赖运行机器的时区
    const iso = new Date(2026, 9, 26, 9, 5).toISOString()
    expect(formatEntryTime(iso)).toBe('09:05')
  })

  it('undefined、空串和解析不了的字符串返回 null', () => {
    expect(formatEntryTime(undefined)).toBeNull()
    expect(formatEntryTime('')).toBeNull()
    expect(formatEntryTime('不是时间')).toBeNull()
  })
})

describe('previewText', () => {
  it('压掉换行和多余空白', () => {
    expect(previewText('  第一行\n\n第二行\t  第三行  ')).toBe('第一行 第二行 第三行')
  })

  it('不超长时原样返回，不加省略号', () => {
    expect(previewText('短短一句', 10)).toBe('短短一句')
  })

  it('超长时截断并加省略号', () => {
    expect(previewText('一二三四五六', 4)).toBe('一二三四…')
  })

  it('按码点截断，emoji 不会被切成半个', () => {
    const result = previewText('😀😀😀😀', 2)
    expect(result).toBe('😀😀…')
    // 半个代理对会是孤立的 \uD83D，这里确认没有
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(result)).toBe(false)
  })
})

describe('countWords', () => {
  it('中文按字、英文按词相加，数字和标点不计', () => {
    expect(countWords('今天开会 review 了 PR，共 3 个')).toBe(9) // 今天开会了共个 = 7 字 + review/PR = 2 词
  })

  it('空文本和纯空白为 0', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\t ')).toBe(0)
  })
})

describe('hasUnsavedDraft', () => {
  const saved = { title: '周会', text: '讨论了排期' }

  it('新建框：正文有字就算未保存', () => {
    expect(hasUnsavedDraft({ title: '', text: '今天' }, { title: '', text: '' })).toBe(true)
  })

  it('正文为空或纯空白不算（存不进去，关页不丢东西）', () => {
    expect(hasUnsavedDraft({ title: '只有标题', text: '' }, { title: '', text: '' })).toBe(false)
    expect(hasUnsavedDraft({ title: '', text: '  \n ' }, { title: '', text: '' })).toBe(false)
    // 编辑时把正文清空：存储里还是旧版本，不需要提醒
    expect(hasUnsavedDraft({ title: '周会', text: '' }, saved)).toBe(false)
  })

  it('和已保存版本一致不算（自动保存完成后关页不弹）', () => {
    expect(hasUnsavedDraft({ ...saved }, saved)).toBe(false)
  })

  it('标题按 trim 后比较，只差首尾空格不算改动', () => {
    expect(hasUnsavedDraft({ title: '  周会 ', text: '讨论了排期' }, saved)).toBe(false)
    expect(hasUnsavedDraft({ title: '周会纪要', text: '讨论了排期' }, saved)).toBe(true)
  })

  it('正文按原样比较，多一个换行也算改动', () => {
    expect(hasUnsavedDraft({ title: '周会', text: '讨论了排期\n' }, saved)).toBe(true)
  })
})
