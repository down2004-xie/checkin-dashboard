import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 用相对路径 './'，产物可以放在域名的任意层级下都能跑。
//
// 为什么不用 '/' 或 '/repo/'：那两种写法要求 base 与仓库形态精确匹配
// （用户站 vs 项目站），配错的表现是页面白屏 + 控制台一堆资源 404。
// 相对路径把这个坑直接消掉。
//
// 代价：如果以后改用 history 路由（react-router 的 BrowserRouter），
// 子路径刷新会 404。本项目是单视图、条件渲染，不用路由，所以没有这个问题。
export default defineConfig({
  base: './',
  plugins: [react()],
})
