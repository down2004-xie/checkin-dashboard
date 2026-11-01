/**
 * 用独立缓存目录启动 Vite dev server（tool-harness 用）。
 * 用法：node scripts/lib/dev-server.mjs <port> <cacheDir>
 *
 * 为什么不直接用 vite CLI：CLI 没有设置 cacheDir 的参数，而并行验收时
 * 多个 dev server 共用 node_modules/.vite 会互相覆盖预构建产物。
 */
import { createServer } from 'vite'

const [port, cacheDir] = process.argv.slice(2)
const server = await createServer({
  cacheDir,
  clearScreen: false,
  logLevel: 'warn',
  optimizeDeps: { force: true },
  server: { host: '127.0.0.1', port: Number(port), strictPort: true },
})
await server.listen()
