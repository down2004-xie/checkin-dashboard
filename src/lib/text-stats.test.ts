import { describe, expect, it } from 'vitest'

import { analyzeText } from './text-stats'

describe('analyzeText', () => {
  it('纯中文：按字计数', () => {
    const stats = analyzeText('今天天气很好')
    expect(stats.chinese).toBe(6)
    expect(stats.chars).toBe(6)
    expect(stats.words).toBe(0)
  })

  it('纯英文：按单词计数，不是字母数', () => {
    const stats = analyzeText('hello world foo')
    expect(stats.words).toBe(3)
    expect(stats.chinese).toBe(0)
  })

  it('中英混排无缝相接也能正确分词', () => {
    // 「你好world」中间没有空格：汉字 2 个 + 单词 1 个
    const stats = analyzeText('你好world')
    expect(stats.chinese).toBe(2)
    expect(stats.words).toBe(1)
  })

  it('多个空格分隔的英文单词不重复计数', () => {
    const stats = analyzeText('a  b   c')
    expect(stats.words).toBe(3)
  })

  it('数字串算一个「数字」，不并入单词', () => {
    const stats = analyzeText('版本 2026 发布了')
    expect(stats.numbers).toBe(1)
    expect(stats.words).toBe(0)
    expect(stats.chinese).toBe(5)
  })

  it('标点计入字符数、但不算汉字', () => {
    const stats = analyzeText('你好，世界！')
    expect(stats.chinese).toBe(4)
    expect(stats.chars).toBe(6) // 4 汉字 + 2 标点
  })

  it('换行打断单词计数（跨行的字母不会连成一个词）', () => {
    const stats = analyzeText('hel\nlo')
    expect(stats.words).toBe(2)
  })

  it('段落按空行分隔，非空行按行数统计', () => {
    const stats = analyzeText('第一段第一行\n第一段第二行\n\n第二段')
    expect(stats.paragraphs).toBe(2)
    expect(stats.lines).toBe(3)
  })

  it('空文本：全部为 0，阅读时长为 0', () => {
    const stats = analyzeText('')
    expect(stats.chars).toBe(0)
    expect(stats.paragraphs).toBe(0)
    expect(stats.lines).toBe(0)
    expect(stats.readingMinutes).toBe(0)
  })

  it('纯空白文本也算空', () => {
    const stats = analyzeText('   \n  \n ')
    expect(stats.chars).toBe(0)
    expect(stats.paragraphs).toBe(0)
  })

  it('阅读时长至少 1 分钟（有内容但很短）', () => {
    expect(analyzeText('你好').readingMinutes).toBe(1)
  })

  it('长文本阅读时长按字数增长', () => {
    const stats = analyzeText('字'.repeat(900))
    expect(stats.readingMinutes).toBe(3) // 900 / 300 = 3
  })

  it('emoji 等代理对按 1 个字符计（按码点迭代）', () => {
    const stats = analyzeText('🎉🎉')
    expect(stats.chars).toBe(2)
  })
})
