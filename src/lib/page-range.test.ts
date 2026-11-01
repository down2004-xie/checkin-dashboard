import { describe, expect, it } from 'vitest'

import { moveItem, parsePageRange, pdfBaseName, pdfLoadErrorMessage, splitPageFileName } from './page-range'

/** 取页码数组；解析失败时让测试直接挂，免得把 error 当结果比 */
function pages(input: string, total: number): number[] {
  const result = parsePageRange(input, total)
  if (!result.ok) throw new Error(`expected ok for ${input}, got: ${result.error}`)
  return result.pages
}

function errorOf(input: string, total: number): string {
  const result = parsePageRange(input, total)
  if (result.ok) throw new Error(`expected error for ${input}, got: ${result.pages.join(',')}`)
  return result.error
}

describe('parsePageRange：基本写法', () => {
  it.each([
    ['1', 10, [1]],
    ['1-3', 10, [1, 2, 3]],
    ['1-3, 5, 8-', 10, [1, 2, 3, 5, 8, 9, 10]],
    ['3-3', 10, [3]],
    ['10-', 10, [10]],
    ['1-', 3, [1, 2, 3]],
    ['01-03', 10, [1, 2, 3]],
  ])('%s（共 %i 页）→ %j', (input, total, expected) => {
    expect(pages(input, total)).toEqual(expected)
  })

  it('容忍空格、全角逗号、顿号和各种连字符', () => {
    expect(pages(' 1 - 2 ，4、6～7 , 9—10 ', 10)).toEqual([1, 2, 4, 6, 7, 9, 10])
    expect(pages('2–3', 5)).toEqual([2, 3])
  })

  it('多余的逗号（空段）忽略', () => {
    expect(pages('1,,3,', 5)).toEqual([1, 3])
  })
})

describe('parsePageRange：顺序与去重', () => {
  it('按输入顺序输出，不排序', () => {
    expect(pages('5, 1-3', 5)).toEqual([5, 1, 2, 3])
  })

  it('重复页只保留第一次出现的位置', () => {
    expect(pages('1-3, 2, 3-4', 5)).toEqual([1, 2, 3, 4])
    expect(pages('4, 1-5', 5)).toEqual([4, 1, 2, 3, 5])
  })
})

describe('parsePageRange：错误', () => {
  it('空输入', () => {
    expect(errorOf('', 5)).toMatch(/请输入页码范围/)
    expect(errorOf(' , ，', 5)).toMatch(/请输入页码范围/)
  })

  it('越界：起点或终点超过总页数', () => {
    expect(errorOf('6', 5)).toMatch(/只有 5 页/)
    expect(errorOf('3-9', 5)).toMatch(/只有 5 页/)
    expect(errorOf('6-', 5)).toMatch(/只有 5 页/)
  })

  it('页码 0', () => {
    expect(errorOf('0', 5)).toMatch(/从 1 开始/)
    expect(errorOf('0-2', 5)).toMatch(/从 1 开始/)
  })

  it('反向范围给出改正写法', () => {
    expect(errorOf('5-3', 5)).toMatch(/反向范围，请写成 3-5/)
  })

  it.each(['abc', '1.5', '-3', '1--3', '1-3-5', '1 3', '第2页', '2+'])('非法写法「%s」', (input) => {
    expect(errorOf(input, 10)).toMatch(/看不懂/)
  })

  it('一段出错整体报错，不返回部分结果', () => {
    const result = parsePageRange('1-2, x, 4', 5)
    expect(result.ok).toBe(false)
  })

  it('总页数非法', () => {
    expect(errorOf('1', 0)).toMatch(/没有可提取的页面/)
  })
})

describe('拆分文件名', () => {
  it('去掉 .pdf 扩展名（大小写不敏感）', () => {
    expect(pdfBaseName('报告.PDF')).toBe('报告')
    expect(pdfBaseName('a.b.pdf')).toBe('a.b')
    expect(pdfBaseName('.pdf')).toBe('document')
  })

  it('页码按总页数补零，保证按文件名排序即页序', () => {
    expect(splitPageFileName('报告.pdf', 2, 12)).toBe('报告-p02.pdf')
    expect(splitPageFileName('报告.pdf', 2, 9)).toBe('报告-p2.pdf')
    expect(splitPageFileName('x.pdf', 7, 100)).toBe('x-p007.pdf')
  })
})

describe('pdfLoadErrorMessage', () => {
  it('加密：按 pdf-lib 的错误原文识别（instanceof 在 ES5 编译产物里不可靠）', () => {
    const error = new Error('Input document to `PDFDocument.load` is encrypted. You can use `PDFDocument.load(..., { ignoreEncryption: true })` if you wish to load the document anyways.')
    expect(pdfLoadErrorMessage('合同.pdf', error)).toBe('「合同.pdf」有密码保护，暂不支持')
  })

  it('其他错误：损坏或不是 PDF', () => {
    expect(pdfLoadErrorMessage('a.pdf', new Error('Failed to parse PDF document (line:0 col:0 offset=0): No PDF header found'))).toMatch(/可能已损坏/)
    expect(pdfLoadErrorMessage('a.pdf', 'x')).toMatch(/可能已损坏/)
  })
})

describe('moveItem', () => {
  it('上移 / 下移和相邻元素对调', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
  })

  it('越界时原样返回（且是新数组）', () => {
    const items = ['a', 'b']
    const moved = moveItem(items, 0, -1)
    expect(moved).toEqual(['a', 'b'])
    expect(moved).not.toBe(items)
    expect(moveItem(items, 1, 1)).toEqual(['a', 'b'])
  })
})
