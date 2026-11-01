import { describe, expect, it } from 'vitest'

import { countChars, groupLines, joinLines, layoutParagraphs, pagesToText, spaceBetween, type TextRun } from './pdf-text-layout'

/** 造一个文字项：字高 12，宽度按「每字 6pt」粗估（只要和间距规则对得上就行） */
const run = (str: string, x: number, y: number, width = str.length * 6, height = 12): TextRun => ({ str, x, y, width, height })

describe('spaceBetween', () => {
  it('adds spaces between latin words and at CJK/latin boundaries', () => {
    expect(spaceBetween('o', 'w')).toBe(true)
    expect(spaceBetween('文', 'P')).toBe(true)
    expect(spaceBetween('F', '中')).toBe(true)
  })

  it('never adds spaces between CJK characters or next to full-width punctuation', () => {
    expect(spaceBetween('中', '文')).toBe(false)
    expect(spaceBetween('，', 'E')).toBe(false)
    expect(spaceBetween('e', '。')).toBe(false)
    expect(spaceBetween('あ', '한')).toBe(false)
  })
})

describe('groupLines', () => {
  it('joins one line split into several items, adding a space only at real gaps', () => {
    // "Hel" + "lo" 紧挨着（间距 0），"world" 前面有 4pt 间距
    const lines = groupLines([run('Hel', 72, 700, 18), run('lo', 90, 700, 12), run('world', 106, 700, 30)])
    expect(lines.map((line) => line.text)).toEqual(['Hello world'])
  })

  it('does not insert spaces between justified Chinese characters', () => {
    // 两端对齐撑开的字距（5pt，超过补空格阈值）也不该变成空格
    const lines = groupLines([run('中文', 72, 700, 24), run('排版', 101, 700, 24)])
    expect(lines[0].text).toBe('中文排版')
  })

  it('keeps a space at a CJK/latin boundary when there is a gap', () => {
    const lines = groupLines([run('使用', 72, 700, 24), run('React', 100, 700, 30), run('开发', 134, 700, 24)])
    expect(lines[0].text).toBe('使用 React 开发')
  })

  it('tolerates small baseline offsets (superscripts) but splits real lines', () => {
    const lines = groupLines([run('E=mc', 72, 700, 24), run('2', 96, 704, 4, 7), run('next', 72, 686)])
    expect(lines.map((line) => line.text)).toEqual(['E=mc2', 'next'])
  })

  it('drops whitespace-only items and keeps reading order for shuffled input', () => {
    const lines = groupLines([
      run('second', 72, 686), run(' ', 66, 700, 4), run('line', 116, 686),
      run('First', 72, 700), run('line', 108, 700),
    ])
    expect(lines.map((line) => line.text)).toEqual(['First line', 'second line'])
  })

  it('falls back to the median height when an item reports 0', () => {
    const lines = groupLines([run('a', 72, 700, 6, 0), run('b', 72, 686)])
    expect(lines).toHaveLength(2)
    expect(lines[0].height).toBe(12)
  })
})

describe('joinLines', () => {
  it('uses a space for English and nothing for Chinese', () => {
    expect(joinLines('the quick', 'brown fox')).toBe('the quick brown fox')
    expect(joinLines('今天天气', '很好')).toBe('今天天气很好')
  })

  it('keeps a trailing hyphen and joins without a space', () => {
    expect(joinLines('infor-', 'mation')).toBe('infor-mation')
  })
})

describe('layoutParagraphs', () => {
  it('returns one paragraph for a single line', () => {
    expect(layoutParagraphs([run('Hello', 72, 720)])).toEqual(['Hello'])
  })

  it('merges wrapped lines of the same paragraph', () => {
    // 版心 72~300，三行都写满，行距 14
    const paragraphs = layoutParagraphs([
      run('The quick brown fox jumps', 72, 720, 228),
      run('over the lazy dog and runs', 72, 706, 228),
      run('away.', 72, 692, 30),
    ])
    expect(paragraphs).toEqual(['The quick brown fox jumps over the lazy dog and runs away.'])
  })

  it('breaks on a short last line', () => {
    const paragraphs = layoutParagraphs([
      run('第一段第一行写满了版心宽度', 72, 720, 228),
      run('第一段结束。', 72, 706, 72),
      run('第二段第一行也写满了版心', 72, 692, 228),
      run('第二段结束。', 72, 678, 72),
    ])
    expect(paragraphs).toEqual(['第一段第一行写满了版心宽度第一段结束。', '第二段第一行也写满了版心第二段结束。'])
  })

  it('breaks on a loose line gap even when lines are full width', () => {
    const paragraphs = layoutParagraphs([
      run('aaaa', 72, 720, 228), run('bbbb', 72, 706, 228),
      run('cccc', 72, 680, 228), run('dddd', 72, 666, 228),
    ])
    expect(paragraphs).toEqual(['aaaa bbbb', 'cccc dddd'])
  })

  it('handles mixed Chinese and English across items and lines', () => {
    const paragraphs = layoutParagraphs([
      run('本项目基于', 72, 720, 60), run('Vite', 136, 720, 24), run('构建，产物是纯', 164, 720, 84),
      run('静态文件。', 72, 706, 60),
    ])
    expect(paragraphs).toEqual(['本项目基于 Vite 构建，产物是纯静态文件。'])
  })

  it('returns nothing for a page without text', () => {
    expect(layoutParagraphs([])).toEqual([])
    expect(layoutParagraphs([run('   ', 72, 700)])).toEqual([])
  })
})

describe('countChars / pagesToText', () => {
  it('counts code points without whitespace', () => {
    expect(countChars(['Hi 你好', '𠮷'])).toBe(5)
  })

  it('separates paragraphs by newline and pages by a blank line, skipping empty pages', () => {
    expect(pagesToText([['a', 'b'], [], ['c']])).toBe('a\nb\n\nc')
  })
})
