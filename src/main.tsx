import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 样式加载顺序有讲究：tokens 定义变量 → global 用变量做基础层 →
// app 是原有组件样式，features 是新增功能（筛选 / 热力图 / 表单）。
// 反过来写会让后面的规则拿不到前面定义的变量。
import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import './styles/features.css'

import { App } from './App'

const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点，检查 index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
