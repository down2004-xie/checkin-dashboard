# 工具箱大修：并行子代理共用规则（保留作为协作参考，不自动删除）

项目根目录：`d:\Code\test\3\checkin-dashboard`。纯静态 React 19 + TS + Vite，部署 GitHub Pages。

## 开工前必读
1. `CLAUDE.md`：重点读「分层铁律」「编码约定」和「工具箱的几条通用约定」一节（刚加的）。
2. 公共模块（只读，不要改）：
   - `src/components/toolbox/FilePicker.tsx`：选文件统一入口（点击 + 拖放 + 粘贴）。`label` 同时是 input 的 aria-label。
   - `src/lib/zip.ts`：`createZip(entries)` 手写 ZIP（store 模式）。
   - `src/lib/file-accept.ts`：`unsupportedHint(file)` 给 HEIC 等格式一句人话提示。
   - `src/lib/canvas-limits.ts`：`planCanvas(size, canvasProbe)` 得到浏览器真画得出的尺寸，`tooLargeMessage(size)`。
   - `scripts/lib/tool-harness.mjs`：单工具浏览器验收脚手架，示例 `scripts/checks/barcode.mjs`。

## 硬规则
- **只改你被分配的文件。** 以下文件由主代理负责，不要改：`src/data/tools.ts`、`ToolboxView.tsx`、
  `src/styles/toolbox.css`、`FilePicker.tsx`、`lib/zip.ts`、`lib/file-accept.ts`、`lib/canvas-limits.ts`、
  `CLAUDE.md`、`PROGRESS.md`、`MY-ISSUES.md`、`package.json`、`package-lock.json`、`scripts/lib/*`、
  `scripts/toolbox-check.mjs`。需要这些文件改动时，写进最终报告。
- 其他子代理同时在改别的工具。`tsc` 报出不属于你的文件的错，不用管，报告里提一句即可。
- 不跑 `npm install`、`npm run build`、`vite build`（`dist/` 是共享的）。不跑任何改动 git 状态的命令。不删除文件。
- 纯逻辑一律进 `src/lib/<模块>.ts` 并写 `<模块>.test.ts`（Vitest，node 环境，没有 DOM）。lib 不许 import React。
  组件只做渲染和浏览器 API 调用。不用 `any`；组件用具名导出函数；类型用 `interface`，联合类型用 `type`。
- 新样式放 `src/styles/tools/<tool-id>.css`，由组件自己 `import '../../styles/tools/<tool-id>.css'`。
  可以复用 `toolbox.css` 里已有的类（`tool-panel`、`unit-row`、`unit-field`、`unit-field__label`、`site-form__input`、
  `btn`、`btn--primary`、`chip`、`chip--active`、`hint`、`site-form__error`、`stat-grid`、`stat-tile` 等），先读一遍再决定。
  颜色用 `tokens.css` 的变量（`--text-primary`、`--accent`、`--glass-border`、`--surface-inset` 等），亮色主题下也要可读。
  移动端 390px 宽不能横向溢出。
- 注释用中文，写「为什么」，风格对齐现有文件（先读一个现有工具和它的 lib 当范本）。
- 组件根元素是 `<div className="tool-panel">`（验收脚本靠它判断面板出现）。
- 选文件一律用 `FilePicker`。现有图片工具的 label 保持「选择图片」，`scripts/toolbox-check.mjs` 按 aria-label 找输入框。
- 不碰 localStorage（工具箱不存用户数据）。

## 验证（说「完成」前必须全跑，报告附实际输出）
1. `npx vitest run <你的测试文件...>`
2. `npx tsc --noEmit`
3. 写 `scripts/checks/<tool-id>.mjs`（用 tool-harness），覆盖每个工具的主路径和你修的关键 bug，然后 `node scripts/checks/<tool-id>.mjs` 跑通。
   测试图片用页面里的 canvas 现造（见 `scripts/toolbox-check.mjs` 的写法）。
   PDF 这类依赖本地静态附件的工具还要在主线程 build 后运行 `TOOL_CHECK_PREVIEW=1 node scripts/checks/<tool-id>.mjs`，验证真正构建产物；默认模式仍使用独立缓存的 dev server。
4. 如果你改了现有工具的 DOM 结构，读 `scripts/toolbox-check.mjs` 里对应工具的那一段，
   在报告里写清「哪些选择器 / 文案 / 行为变了，那段断言该怎么改」。

## 最终报告（中文，精简，不贴大段代码）
- 改了 / 新建了哪些文件。
- 每个任务项：做了什么、怎么做的；没做的写原因。
- 新 lib 模块：每个一行职责说明（主代理要写进 CLAUDE.md 的 lib 表）。
- 非平凡问题（排查超 30 分钟、原因不直观、或要查资料）：现象 / 根因 / 解决 / 验证 / 关键学习，主代理要记进 MY-ISSUES.md。
- 验证输出：vitest 文件数和用例数、tsc 结果、checks 脚本的 PASS 行。
- 需要主代理改的共享文件（如 toolbox-check.mjs 断言、toolbox.css）。
