import { createReadStream, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** PDF.js 的字体/解码附件只在用到时请求，不打进主包，也不依赖外部 CDN。 */
function pdfjsAssets(): Plugin {
  const assets = new Map<string, string>()
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    const directory = new URL(`./node_modules/pdfjs-dist/${folder}/`, import.meta.url)
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile()) assets.set(`${folder}/${entry.name}`, fileURLToPath(new URL(entry.name, directory)))
    }
  }
  return {
    name: 'local-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (request, response, next) => {
        // 只服务上面登记过的文件，不能把用户提供的路径直接拼进文件系统。
        const key = request.url?.split('?')[0]?.replace(/^\//, '') ?? ''
        const file = assets.get(key)
        if (!file) { next(); return }
        response.setHeader('Content-Type', key.endsWith('.wasm') ? 'application/wasm'
          : key.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        const stream = createReadStream(file)
        stream.on('error', next)
        stream.pipe(response)
      })
    },
    generateBundle() {
      for (const [key, file] of assets) {
        this.emitFile({ type: 'asset', fileName: `pdfjs/${key}`, source: readFileSync(file) })
      }
    },
  }
}

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
  plugins: [react(), pdfjsAssets()],
})
