import type { Todo } from '../types'

/**
 * 待办的创建逻辑。
 *
 * 为什么 id 生成放在 lib 而不是组件里：
 * 和 `site-form.ts` 里的 `siteIdFromUrl` 同一条理由 ——
 * 「一条待办长什么样」是数据契约的一部分，纯函数、可单测，
 * 一旦散到组件里，将来想改 id 生成方式就得去组件里翻。
 */

/**
 * 新建一条待办。
 *
 * 用随机 UUID 而不是「文本派生的 slug」，理由见 types.ts 里 Todo.id 的注释：
 * 待办只需要在当天唯一定位，不需要跨时间保持身份，
 * 而且随机 id 天然允许「同一天两条一模一样的待办」共存。
 *
 * `crypto.randomUUID` 需要安全上下文（https 或 localhost）——
 * 本项目的两种运行环境都满足：GitHub Pages 是 https，本地开发是 localhost。
 */
export function createTodo(text: string): Todo {
  return { id: crypto.randomUUID(), text, done: false }
}
