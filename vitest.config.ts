import { defineConfig } from 'vitest/config'

// 只收集本项目的测试，不把隔离 worktree 的代码副本重复测一遍。
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts', 'smoke.test.tsx'],
  },
})
