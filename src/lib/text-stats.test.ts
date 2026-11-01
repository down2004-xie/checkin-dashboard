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

  it('段落 = 非空行数：中文一段一个换行，不靠空行分段', () => {
    // 旧实现只按空行切，这里会算成 1 段
    expect(analyzeText('第一段\n第二段\n第三段').paragraphs).toBe(3)
  })

  it('空行不算段落，但算行数（行数 = 编辑器里看到的行）', () => {
    const stats = analyzeText('第一段\n\n第二段')
    expect(stats.paragraphs).toBe(2)
    expect(stats.lines).toBe(3)
  })

  it('Windows 换行 \\r\\n 和 \\n 一样切', () => {
    expect(analyzeText('甲\r\n乙\r\n丙').paragraphs).toBe(3)
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

  it('emoji 等代理对按 1 个字符计', () => {
    const stats = analyzeText('🎉🎉')
    expect(stats.chars).toBe(2)
  })

  it('字符数按字素：👨‍👩‍👧（5 个码点）和 🇨🇳（2 个码点）各算 1 个', () => {
    expect(analyzeText('👨‍👩‍👧').chars).toBe(1)
    expect(analyzeText('🇨🇳').chars).toBe(1)
    expect(analyzeText('é').chars).toBe(1) // e + 组合重音
  })

  it('全角字母数字先归一再分词', () => {
    const stats = analyzeText('ＡＢＣ　１２３')
    expect(stats.words).toBe(1)
    expect(stats.numbers).toBe(1)
    expect(stats.chars).toBe(6) // 全角空格是空白，不计
  })

  it('带重音字母不断词：café、naïve 各 1 个词（组合字符形态也一样）', () => {
    expect(analyzeText('café naïve').words).toBe(2)
    expect(analyzeText('café').words).toBe(1)
  })

  it("don't、don’t、e-mail 各算 1 个词", () => {
    expect(analyzeText("don't").words).toBe(1)
    expect(analyzeText('don’t').words).toBe(1)
    expect(analyzeText('e-mail').words).toBe(1)
  })

  it('连字符、撇号后面不是字母时照常断开', () => {
    expect(analyzeText("rock - roll").words).toBe(2)
    expect(analyzeText("dogs' toys").words).toBe(2)
  })

  it('小数和千位分隔的数字串算 1 个', () => {
    expect(analyzeText('3.14 和 1,000').numbers).toBe(2)
    expect(analyzeText('1, 2').numbers).toBe(2) // 逗号后有空格：两个数
  })

  it('字数 = 汉字 + 英文单词 + 数字串，不含标点', () => {
    const stats = analyzeText('你好world 2026！')
    expect(stats.total).toBe(4)
  })

  it('toolbox-check 的样例：你好world 2026 → 汉字 2、单词 1、数字 1、字符 11', () => {
    const stats = analyzeText('你好world 2026')
    expect([stats.chinese, stats.words, stats.numbers, stats.chars]).toEqual([2, 1, 1, 11])
  })

  it('只有标点：有字符数，但字数和阅读时长都是 0', () => {
    const stats = analyzeText('，。！？……')
    expect(stats.chars).toBeGreaterThan(0)
    expect(stats.total).toBe(0)
    expect(stats.readingMinutes).toBe(0)
  })
})
