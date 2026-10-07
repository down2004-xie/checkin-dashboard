import { describe, expect, it } from 'vitest'

import { createTodo } from './todo'

describe('createTodo', () => {
  it('新建的待办默认未完成', () => {
    expect(createTodo('写作业').done).toBe(false)
  })

  it('原样保留文本', () => {
    expect(createTodo('写作业').text).toBe('写作业')
  })

  it('id 非空', () => {
    expect(createTodo('x').id.length).toBeGreaterThan(0)
  })

  it('两条内容相同的待办拿到不同的 id', () => {
    // 这条是随机 UUID 这个选择的直接理由：同一天完全可能写两条
    // 一模一样的「买牛奶」，它们必须能各自独立地勾选和删除。
    // 如果 id 像站点那样「由文本派生」，这两条会塌成一条 ——
    // 勾掉一个，另一个看着也被勾掉了
    const a = createTodo('买牛奶')
    const b = createTodo('买牛奶')
    expect(a.id).not.toBe(b.id)
  })
})
