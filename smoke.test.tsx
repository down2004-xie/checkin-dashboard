import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './src/App'

/**
 * 临时渲染冒烟测试：把 <App/> 真的渲染一遍。
 * 目的不是断言 DOM 内容，而是抓「渲染期抛异常」这类崩溃。
 * 验证完即删，不进正式测试套件（项目约定只单测 lib/ 纯函数）。
 */
describe('App 渲染冒烟', () => {
  it('能渲染出页面且不抛异常', () => {
    const html = renderToString(<App />)
    expect(html).toContain('签到看板')
    expect(html).toContain('哔哩哔哩')
  })
})
