# PROGRESS — checkin-dashboard

> 用途：任何人（包括未来的我）看一眼就知道项目到哪一步了。
> 只记「决策和状态」，不抄代码。

## 阶段清单

- [x] 阶段 0：需求确认 + 技术方案（含液态玻璃/沉浸光感可行性评估）
- [x] 阶段 1：项目规范（CLAUDE.md）+ 进度记录
- [x] 阶段 2：Vite + React + TS 骨架跑起来
- [x] 阶段 3：类型定义 + 站点清单数据
- [x] 阶段 4：存储层（storage.ts + 版本号 + 数据校验）
- [x] 阶段 5：纯函数层（date / streak / daylight / backup）+ 单测
- [x] 阶段 6：核心 hooks（useCheckInStore / useToday / useDaylight / usePointerLight / useCardHighlight）
- [x] 阶段 7：玻璃卡片 + 网格布局（液态玻璃 A 路线）
- [x] 阶段 8：指针跟随高光 + 时间驱动配色（沉浸光感）
- [x] 阶段 9：今日进度 + 连续天数 + 未签提示
- [x] 阶段 10：导出/导入 JSON 备份
- [x] 阶段 11：数据契约升 v2 + 迁移链 + reducer 纯函数化
- [x] 阶段 12：页面内增删改站点 + 分类筛选 + 每站连续天数 + 历史热力图
- [x] 阶段 13：浏览器书签导入（导出 HTML → 按文件夹勾选）
- [x] 阶段 14：数据契约升 v3 —— 站点身份改为域名派生 + 迁移存量数据
- [~] 阶段 15：部署到 GitHub Pages + 绑定二级域名（站点已上线 2026-10-02；二级域名未绑）
- [x] 阶段 17：樱花装饰 —— 背景樱花树 + 前景飘落花瓣 + 满签爆发（2026-10-06）
- [x] 阶段 18：数据契约升 v4 —— 按天的每日待办（2026-10-07）
- [x] 阶段 18.5：数据契约升 v5 —— 每日目标快照 `targets` + 偏好设置 `preferences`
- [x] 阶段 19：v5 改动的代码审查 + 修复（#12 白屏 / #13 误锁只读 / #14 去重放错层，
      外加 6 条 UI 与契约遗留）+ 浏览器回归脚本转正（2026-10-12）
- [x] 阶段 20：工具箱视图（同页第二个视图，顶部切换）+ 两个可用工具（单位换算 / 倒计时）（2026-10-17）
- [x] 阶段 20.5：工具箱第三个工具 —— 随机抽签（掷骰子/抛硬币/抽签/随机分组）（2026-10-17）
- [x] 阶段 20.6：工具箱第四个工具 —— 九宫格切图（Canvas，第一个文件处理类）（2026-10-17）
- [x] 阶段 20.7：工具箱第五个工具 —— 图片压缩（toBlob + 质量参数，前后体积对比）（2026-10-17）
- [x] 阶段 20.8：工具箱第六个工具 —— 文本字数统计（中英混排逐字符分词）（2026-10-17）
- [x] 阶段 20.9：工具箱第七个工具 —— 加水印（文字水印，位置/透明度/旋转/平铺）（2026-10-17）
- [x] 阶段 20.10：加水印增强 —— 可调文字颜色 + 阴影随颜色自适应（2026-10-17）
- [x] 阶段 20.11：工具箱第八个工具 —— 图片格式互转（PNG/JPEG/WebP）（2026-10-17）
- [x] 阶段 20.12：工具箱第九个工具 —— 裁剪旋转翻转（拖拽框选 + 90°旋转 + 翻转）（2026-10-17）
- [x] 阶段 20.13：工具箱第十个工具 —— 打码与马赛克（拖拽框选 + 马赛克/模糊，可多次累积）（2026-10-17）
- [x] 阶段 20.14：工具箱第十一个工具 —— 证件照处理（按颜色近似换背景 + 居中裁到证件尺寸）（2026-10-25）
- [x] 阶段 21：并行三个工具 —— 长图拼接 / 图片转 PDF / Code128 条形码（多子代理并行，2026-10-25）
- [x] 阶段 22：网页分享工具 + 临时分享箱如实标注（需后端，保持 soon）（2026-10-25）
- [x] 阶段 16（杂项桶）：亮色主题 ✅ / 清理孤儿记录 ✅ / 真折射玻璃实测 ✅（结论：不做，见验证记录）
- [x] 阶段 23：三项并行 —— 站点拖拽排序 / 工具箱按需加载 / 验收脚本迁入 `scripts/`（多子代理并行，2026-10-26）

> 编号说明：16 是早就预留的「v4 杂项」桶，17 是临时插入的装饰功能，
> 18 是待办，18.5 和 19 是 2026-10-12 补的。**不重编号** ——
> 「留到阶段 16」这句话在 MY-ISSUES 和本文的已知缺口表里被引用了好几处，
> 改号会造成指向错误。
>
> ⚠️ 「阶段 18 的 v4」和「阶段 16 的 v4」不是一回事：阶段 16 里那个
> 「v4」指的是早就想做的**一篮子杂项**（真折射玻璃、亮色主题……），
> 而阶段 18 把数据契约的版本号真的升到了 4。两处都叫 v4 纯属撞名，
> 看的时候认准「数据契约 v4」还是「杂项阶段」。

## 当前进度

**阶段 2~14、17、18、18.5、19、20~23 已全部写完，自动化验证通过。
阶段 16（杂项桶）三项已全部有结论：亮色主题 ✅、清理孤儿记录 ✅、
真折射玻璃实测 ✅（结论：不做，理由见验证记录）。
阶段 15 的「部署」已完成，站点已上线；「绑定二级域名」未做。
浏览器的人工验收大部分已被 `npm run test:browser`（23 项）接管，
另有 5 个专项脚本（工具 / 外观 / 孤儿 / 拖拽 / 原人工验收）各管一块，
剩几条必须人手点的见「下一步」。**

自动化验证结果（2026-10-02，阶段 14 结束时）：
- `npx vitest run` → 11 个测试文件 / 158 个用例全通过
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 构建成功（JS 247 KB / gzip 78 KB，CSS 12.1 KB / gzip 2.9 KB）
- `<App/>` 渲染冒烟测试通过（react-dom/server 渲染无异常）

自动化验证结果（2026-10-02，安全修复 #8 之后）：
- `npx vitest run` → 11 个测试文件 / **165 个用例**全通过（新增 7 条，见 MY-ISSUES #8）
- `npx tsc --noEmit` → 退出码 0

自动化验证结果（2026-10-06，阶段 17 樱花装饰之后）：
- `npx vitest run` → 12 个测试文件 / **192 个用例**全通过（新增 27 条，全部在 `sakura.test.ts`）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 251.5 KB / gzip 79.7 KB，CSS 14.9 KB / gzip 3.7 KB；
  相对阶段 14 各涨了约 4.5 KB / 2.8 KB）
- **浏览器实拍验收**（用 Playwright 驱动本机已有的 Chromium 1217，
  未下载任何新东西；脚本是临时的，跑完已删）：默认态 / 满签爆发瞬间 / 满开 /
  爆发回收 / 二次满签重播 / 移动端 390×844 / `prefers-reduced-motion`，
  共 11 张截图留在 `shots/`（**未纳入构建，可随时删**）。
  控制台除 `favicon.ico` 404（`index.html` 本就没声明图标，与本次改动无关）外无报错。

自动化验证结果（2026-10-07，阶段 18 待办之后）：
- `npx vitest run` → 13 个测试文件 / **225 个用例**全通过（新增 33 条：
  reducer 的待办 action 15 条、migrate 的 v4 迁移与 `sanitizeTodos` 10 条、
  backup 的待办合并 5 条、`todo.test.ts` 4 条）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 254.6 KB / gzip 80.5 KB，CSS 17.3 KB / gzip 4.0 KB）
- **浏览器实拍验收**：**在真实 Chromium 里点了一遍**（临时脚本，未入库，
  放在已 gitignore 的 `shots/` 下），15 项断言全部通过 ——
  空态文案 / 添加两条 / 输入框自动清空 / 计数 `0→1` / **纯空格不产生待办** /
  勾选后 `done:true` 且打勾符号出现 / **写入 localStorage 时 `version` 是 4
  且 `todos` 结构正确、`records` 未受影响** / **刷新页面后待办仍在** /
  删除 / 删光后回到空态文案且**天的 key 被整个移除**（`todos` 变回 `{}`）。
  另截一张面板特写（`shots/todo-panel.png`）确认玻璃底、勾选态划线、
  计数徽标渲染正常。

  > 这次没有装 Playwright：浏览器内核早已缓存在 `ms-playwright/chromium-1217`，
  > 直接用 Chrome DevTools Protocol 驱动它即可（Node 22 自带全局 `fetch`
  > 和 `WebSocket`，零新依赖）。踩到的坑记在 MY-ISSUES #11。

自动化验证结果（2026-10-07，樱花树视觉重设计之后）：
- `npx vitest run` → 13 个测试文件 / **228 个用例**全通过
  （sakura.test.ts 形态类断言随新结构重写：枝条 255→127 段、
  花苞/大圆斑改为 flowers/blooms/mist 三层，新增 3 条结构断言）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 256 KB / gzip 80.9 KB，CSS 17.4 KB / gzip 4.0 KB）
- **浏览器实拍验收**（无头 Edge + CDP，脚本 `shots/sakura-shot.mjs`）：
  含苞态 / 满开态两张截图确认 —— 枝条从「灰粉粗线」改为深棕细枝，
  花从「大圆斑叠成的棉花糖」改为清晰的五瓣小花（`<defs>` 定义一次花型 +
  `<use>` 复用，DOM 不膨胀），花后垫 6 团极淡柔光云做景深。
  截图在 `shots/sakura-new-*.png`。

自动化验证结果（2026-10-07，卡片悬停立体感 + 勾选弹性动画之后）：
- `npx vitest run` → 13 个测试文件 / 228 个用例全通过（无新增测试：
  动画是纯视觉行为，断言在浏览器验收脚本里做）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（CSS 18.1 KB / gzip 4.2 KB）
- **浏览器行为验收**（无头 Edge + CDP，脚本 `shots/toggle-verify.mjs`），
  7 项断言全过：加载时不播动画 / 点击后 pop 类出现 / `card--done` 挂上 /
  `getAnimations` 确认动画在播 / 播完 pop 类被摘 / **刷新后已签卡片不重播** /
  取消勾选不播。动画特写 `shots/toggle-pop-mid.png`。
  改动：`.card:hover` 补双层外阴影（上浮配阴影才有「浮起来」）；
  勾选瞬间 `card__toggle--pop` 弹性过冲 + `::after` 绿色涟漪，
  类由 GlassCard 用 ref 记跳变沿挂载、`onAnimationEnd` 摘除，
  `prefers-reduced-motion` 下全部关掉。

自动化验证结果（2026-10-07，满签祝贺文案之后）：
- `npx vitest run` → 13 个测试文件 / 228 个用例全通过
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功
- **浏览器行为验收**（无头 Edge + CDP，脚本 `shots/celebrate-verify.mjs`），
  6 项断言全过：未满签时无祝贺 / 签完最后一单 celebrate 类出现 /
  文案正确（streak=1 时是「今天全部签完了 🎉」，>1 才带「连续 N 天」）/
  动画在播 / **刷新后不重播** / 取消勾选祝贺消失。
  头部特写 `shots/celebrate-header.png`。
  改动：ProgressHeader 满签分支换成金色渐变文字（`background-clip: text`
  + 纯色兜底），淡入上浮动画；金色刻意不跟时段色板走（祝贺是奖励语义）。

自动化验证结果（2026-10-07，数字平滑过渡之后 —— 美化系列全部完成）：
- `npx vitest run` → 14 个测试文件 / **232 个用例**全通过
  （新增 `lib/tween.ts` + 4 条缓动测试：端点精确、值域、单调、缓出特性）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 256.8 KB / gzip 81.2 KB）
- **浏览器行为验收**（无头 Edge + CDP，脚本 `shots/tween-verify.mjs`），
  5 项断言全过：点击后 120ms 的中间帧显示 11%（0→17% 的补间路上，
  不是瞬间跳变）/ 弧的 `--ratio` 与文字同步 / 终值稳定在 17% / 终态同步。
  改动：新增 `useTweenNumber` hook（rAF 补间，首帧即终值不播加载动画、
  中途变目标从当前值接着滚、reduced-motion 直达终值）；
  ProgressHeader 的弧和百分比由同一补间值驱动（aria-label 仍用真实值）；
  删掉 `.ring` 上对 conic-gradient 无效的安慰剂 transition。

自动化验证结果（2026-10-12，v5 改动代码审查 + 修 #12/#13 之后）：
- `npx vitest run` → 15 个测试文件 / **274 个用例**全通过
  （新增 3 条：`sanitizePreferences` 拒数组/拒假 toString、
  `droppedEntries` 只数真丢的、保护模式不误触发 + 反面守「真坏的仍要报」）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 276.1 KB / gzip 87.6 KB，CSS 22.6 KB / gzip 5.2 KB）
- **修复的两条**（细节见 MY-ISSUES #12/#13）：
  - `sanitizePreferences` 的 `includes(String(x))` 会让**数组**通过校验 →
    `PALETTES[['auto']]` 为 undefined → 整页白屏。改成先 `typeof` 再 `includes`
  - 保护模式的判据从「清洗前后长度差」换成 `droppedEntries`（只数真的读不回来的），
    无害去重不再把用户锁进只读模式；`sanitizeSites` 与它共用同一个 `isUsableSite`
- **两条新测试都做了「注入旧实现会变红」的反验**（不是只写了永远通过的断言）
- ⚠️ 本次审查还留了 7 条未修，已全部记进 MY-ISSUES 待解决表
  （热力图 range 与网格不一致、筛选下移动顺序、键盘漫游失效、
  `sanitizeSites` 不校验域名派生、无 locks 浏览器吞操作、文档版本落后、`toggled` 死代码）

自动化验证结果（2026-10-12，审查遗留 7 条全部修完）：
- `npx vitest run` → 15 个测试文件 / **284 个用例**全通过
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 276.6 KB / gzip 87.7 KB）
- **改动**（细节见 MY-ISSUES #14 与待解决表）：
  - 热力图：`weeks` 成为唯一口径（下拉框改 4/13/26 周），`buildHeatmap` 删掉
    早已失效的第三个参数，新增 `groupByWeek` / `monthLabel`，网格和统计
    吃的是同一批格子 —— 以前选「近 7 天」只改文字、26 周网格一格不动
  - 移动站点：新增 `moveNeighbor`，邻居按**可见列表**算（以前拿未筛选的全集比索引，
    会亮起一个点了没效果的按钮、还悄悄改掉屏幕外的顺序）；
    并拒绝跨「置顶/普通」分组互换（换了屏幕上也不动）
  - 热力图键盘漫游：`focusKey` 改为可推导的纯值，不再在 render 阶段读 `refs.current`
  - `sanitizeSites` 补上按域名去重，但**必须放在迁移梯子之后**（放前面会让
    v2 数据的记录变孤儿 → 静默少一天签到，见 #14）
  - `useCheckInStore` 的 `expectedRaw` 改为在队列闭包内读（无 `navigator.locks`
    的浏览器上，连点两次会吞掉第二次）
  - `reducer.ts` 删掉死 action `toggled`；测试改写为 `checkedSet`
- ⚠️ 只剩一条真正的已知边界：`sanitizeSites` 允许 `https://`（协议合法但缺 host）
  这种 URL 通过（它算不出域名，没法判身份）。不修的理由：正常输入进不来
  （`normalizeUrl` / `parseBookmarks` 都会拦），放宽白名单又会让
  「空协议字符串」有缝可钻 —— 详细取舍见 `isSafeHttpUrl` 的注释

自动化验证结果（2026-10-12，浏览器端回归 **22 → 23 项**）：
- **`npm run test:browser` → 23 项场景全过**，浏览器是 Edge
  （Chromium 内核，CDP 驱动，脚本 `scripts/browser-check.mjs`）
- 新增 8 项，全部对应这一轮改掉的东西 —— 它们**都是单测够不着的**
  （要真渲染 + 真读 localStorage），也**都是肉眼看不出来的**：

  | 场景 | 守的是 |
  |---|---|
  | Array-valued preferences fall back instead of white-screening | #12 白屏 |
  | Harmless duplicates no longer latch protection mode | #13 误锁只读 |
  | Genuinely unreadable entries still trigger protection | #13 的反面（别修过头） |
  | Move buttons follow the filtered visible list | 筛选下移动顺序 |
  | Moving swaps with the visible neighbour | 移动真的生效且网格跟着变 |
  | Pinned sites cannot be swapped across the boundary | 置顶分组不可跨 |
  | Two clicks in one tick persist without Web Locks | 无 locks 浏览器吞操作 |
  | Stat range drives the grid itself | 热力图 range 与网格一致 |

- **其中 3 条做了「注入旧实现会变红」的反验**（不是只写了永远通过的断言）：
  - 按可见列表与否的按钮状态 → 改回按全集判断后**变红**
  - 热力图 range → 网格写死 26 周后**变红**
  - `expectedRaw` 提到队列外 → `Error: Queued clicks without Web Locks lost a checkin`
- 截图：`shots/regression/desktop.png`（1440）和 `mobile.png`（390×844），已 gitignore
- ⚠️ **顺序陷阱**：`test:browser` 跑的是 `vite preview`，即 **`dist/` 里的旧产物**。
  改完源码必须先 `npm run build` 再跑，否则验的是上一版 —— 第一轮注入反验就
  因此假绿过一次（先跑脚本、后补构建顺序）。已在脚本外的流程里记住。
- ⚠️ 脚本仍未纳入 CI（见「已知缺口」）：它要起服务 + 起浏览器，和
  「纯函数单测」是两个层次的成本

自动化验证结果（2026-10-17，阶段 20 工具箱之后）：
- `npx vitest run` → 17 个测试文件 / **318 个用例**全通过
  （新增 2 个测试文件 / 32 条：`unit-convert.test.ts` 21 条、`countdown.test.ts` 11 条）
- `npx tsc --noEmit` → 退出码 0
- `npx vite build` → 成功（JS 287.7 KB / gzip 91.4 KB，CSS 27.0 KB / gzip 5.8 KB）
- **`npm run test:browser` → 23 项全过**（证明用 `view` 包住签到区没破坏任何既有行为）
- **一次性工具箱实拍验收**（`shots/toolbox-verify.mjs`，跑完即删、未入库），7 项全过：
  切到工具箱 16 卡 / 2 个可用；搜索「证件照」剩 1 张；分类「图片」8 张；
  单位换算 1米=100厘米、2米=200、100°C=212°F；倒计时「今天=就是今天」「+10天=还有 10 天」；
  移动端 390px 无横向溢出；切回签到视图看板正常。截图 `shots/regression/toolbox-*.png`
- **改动**：
  - 顶层加 `view: 'dashboard' | 'tools'` 状态 + `.view-switch` 切换条；
    原签到 JSX 整段用 `{view === 'dashboard' && <> … </>}` 包住，**签到逻辑与数据契约一行未动**
  - 新增 `data/tools.ts`（16 个工具的静态清单 + 分类/搜索纯函数，**不进 localStorage、不升数据版本**）
  - 新增 `components/toolbox/`：`ToolboxView`（卡片墙 + 分类 chips + 搜索）+ `UnitConverter` + `CountdownTool`
  - 新增 `lib/unit-convert.ts`（长度/重量/面积/温度，走「基准单位中转」，温度单独处理偏移）
    和 `lib/countdown.ts`（用 UTC 天序号相减算自然日差，规避夏令时 23/25 小时导致的天数漂移）
  - 新增 `styles/toolbox.css`，全复用 `--glass-*` 变量，和签到卡同一套玻璃
  - 两工具**无持久化**：刷新即清空，符合「工具箱不碰用户数据」的边界

自动化验证结果（2026-10-17，阶段 20.5 随机抽签之后）：
- `npx vitest run` → 18 个测试文件 / **337 个用例**全通过
  （新增 `random-pick.test.ts` 19 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 292.6 KB / gzip 92.6 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`，跑完即删）扩展了随机抽签 4 种玩法：
  掷骰子范围 1..6 且合计对得上、抛硬币结果为正/反、抽签命中名单、3 人分 2 组无遗漏无重复。
  8 项全过，截图 `shots/regression/toolbox-random.png`
- **改动**：`lib/random-pick.ts`（骰子/硬币/抽签/Fisher-Yates 洗牌/round-robin 分组/名单解析，
  随机源 `random()` 可注入）+ `RandomPick.tsx`（四模式单组件）+ `data/tools.ts` 该卡改 `ready`
- 关键取舍：洗牌用 Fisher-Yates，**不用 `sort(() => random()-0.5)`**（后者比较函数不满足
  传递性、分布不均匀）；分组用 round-robin 而非按块切（后者末组可能只剩 1 人）

自动化验证结果（2026-10-17，阶段 20.6 九宫格切图之后）：
- `npx vitest run` → 19 个测试文件 / **347 个用例**全通过
  （新增 `image-slice.test.ts` 10 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 296.1 KB / gzip 93.7 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增切图项，**用 canvas 现造一张
  300×300 图塞进真实 `<input type=file>`**，断言：切成 9 张、每张 naturalWidth/Height 都是
  100×100、文件名 `test-1-1.png`…`test-3-3.png`、**中央格（第 5 张）像素命中绿色区域**。
  9 项全过，截图 `shots/regression/toolbox-slice.png`
- **改动**：`lib/image-slice.ts`（切图矩形计算 + 文件名，纯函数不碰 Canvas）
  + `ImageSlice.tsx`（FileReader/ObjectURL 读图 → drawImage → toDataURL 预览与下载）
  + `data/tools.ts` 该卡改 `ready`
- 关键取舍：切图边界用 `Math.round(i*total/parts)` 生成 N+1 条整数边界线，每格取相邻差 ——
  **保证各格首尾相接、总和正好等于原图**（100 宽切 3 列不整除时也不丢像素、不重叠）；
  这一性质由单测守着。Canvas 绘制层不可测，改用浏览器实测像素颜色兜底

自动化验证结果（2026-10-17，阶段 20.7 图片压缩之后）：
- `npx vitest run` → 20 个测试文件 / **360 个用例**全通过
  （新增 `image-compress.test.ts` 13 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 300.7 KB / gzip 94.9 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增压缩项：造一张 400×400 噪点 PNG
  塞进真实文件输入，长边限 200 → 断言压缩后 200×200、摘要显示「体积减少 N%」。
  实测 538.3 KB → 18.3 KB（减少 97%）。10 项全过，截图 `shots/regression/toolbox-compress.png`
- **改动**：`lib/image-compress.ts`（等比缩放不放大、字节格式化、压缩率）
  + `ImageCompress.tsx`（读图 → 缩放到 canvas → `toBlob(类型, 质量)` → 前后对比 + 下载）
  + `data/tools.ts` 该卡改 `ready`
- 关键取舍：`fitDimensions` **不放大**（原图长边 ≤ 上限时原样返回，放大只会变糊变重）；
  JPEG 输出前**铺白底**（jpeg 不支持透明，否则透明区变黑）；`toBlob` 是异步回调、质量参数
  只对 jpeg/webp 生效，组件里按异步等待处理

自动化验证结果（2026-10-17，阶段 20.8 文本字数统计之后）：
- `npx vitest run` → 21 个测试文件 / **373 个用例**全通过
  （新增 `text-stats.test.ts` 13 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 302.5 KB / gzip 95.5 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增统计项：输入「你好world 2026」→
  断言 汉字 2 / 英文单词 1 / 数字串 1 / 字符 11。11 项全过，
  截图 `shots/regression/toolbox-text-stats.png`
- **改动**：`lib/text-stats.ts`（逐字符状态机分类，中英无缝相接也能正确分词）
  + `TextStatsTool.tsx`（受控 textarea + useMemo 派生统计，不存 state）
  + `data/tools.ts` 该卡改 `ready`
- 关键取舍：统计结果用 `useMemo` 从文本**派生**，不存进 state ——
  存了就有第二个真源，会出现「改了文本统计没跟上」的失同步；
  `chars` 口径定为「含标点的可见字符数」（不含空白），比「只数汉字+字母」更常用

自动化验证结果（2026-10-17，阶段 20.9 加水印之后）：
- `npx vitest run` → 22 个测试文件 / **386 个用例**全通过
  （新增 `watermark.test.ts` 13 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 307.0 KB / gzip 96.7 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增水印项：深色图 + 白字，
  用「近白像素数」量化 —— 单水印 2183、平铺 13379（显著增多）；平铺时位置 chips 隐藏。
  12 项全过，截图 `shots/regression/toolbox-watermark.png`
- **改动**：`lib/watermark.ts`（九宫格锚点坐标 + 平铺点位，纯几何不碰 Canvas）
  + `ImageWatermark.tsx`（读图 → drawImage → fillText 叠加，参数变化用 useEffect 实时重绘预览）
  + `data/tools.ts` 该卡改 `ready`
- **只做文字水印**：描述已从「文字或图片水印」改成「文字水印」——图片水印（贴图 + 缩放）
  留作以后，不假装已实现
- 踩坑记录：平铺间隔一开始写成了魔数、又一度改太小导致更密；**最终靠看截图定稿**
  （横向 0.8 水印宽、纵向 2.5 字号），验证脚本的近白像素计数只用来守「平铺确实铺得更多」，
  不用来猜疏密

自动化验证结果（2026-10-17，阶段 20.10 水印颜色之后）：
- `npx vitest run` → `watermark.test.ts` 23 条全过（新增 hexToRgba 6 条 + shadowColorFor 5 条，共 10 条；全量 396 用例）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 307.8 KB / gzip 97.0 KB）
- **dev server（5173）实测**：灰底图 + 红色水印，预览里红色像素 9081 → 颜色生效
- **改动**：`lib/watermark.ts` 加 `hexToRgba`（#rgb/#rrggbb → rgba，非法退回白）和
  `shadowColorFor`（按 Rec.601 感知亮度：亮字配黑影、暗字配白影）；组件加 `<input type=color>`
- 关键取舍：文字颜色用 `rgba()` 一步带上透明度，**不改 `ctx.globalAlpha`**——
  globalAlpha 会连带影响阴影等其它绘制；阴影色随文字色自适应，深浅底色都看得清

自动化验证结果（2026-10-17，阶段 20.11 图片格式互转之后）：
- `npx vitest run` → 23 个测试文件 / **405 个用例**全通过（新增 image-convert.test.ts 9 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 311.8 KB / gzip 97.7 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增互转项：PNG 320×240 → JPEG，
  断言尺寸不变、文件名 `pic.jpg`。13 项全过，截图 `shots/regression/toolbox-convert.png`
- **改动**：`lib/image-convert.ts`（格式表含 supportsQuality/supportsAlpha 能力标记 + 扩展名替换）
  + `ImageConvert.tsx`（不缩放、纯转码；目标格式不支持透明时铺白底）+ `data/tools.ts` 改 ready
- **只做 PNG/JPEG/WebP**：描述从「PNG/JPG/WebP/ICO」改成「PNG/JPG/WebP」——ICO 没做，
  不假装已实现（ICO 是容器格式、要打包多尺寸，比转码复杂，留以后）

自动化验证结果（2026-10-17，阶段 20.12 裁剪旋转翻转之后）：
- `npx vitest run` → 24 个测试文件 / **420 个用例**全通过（新增 image-transform.test.ts 15 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 317.0 KB / gzip 99.2 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增裁剪项：400×200 图顺时针 90° →
  断言「变换后尺寸 200×400」（宽高互换）。14 项全过，截图 `shots/regression/toolbox-crop.png`
- **改动**：`lib/image-transform.ts`（角度归一/旋转后尺寸/矩形 clamp/百分比↔像素/拖拽点→矩形）
  + `ImageCrop.tsx`（旋转翻转画到 canvas → 预览上拖拽画百分比裁剪框 → 导出按框取像素）
  + `data/tools.ts` 改 ready
- 关键取舍：
  - 裁剪交互做成「拖拽重画新框」，不给旧框加 8 个手柄 —— 「裁一张图」重画比调手柄简单够用
  - 裁剪框用**百分比坐标**存（`RatioRect`），和显示尺寸解耦，窗口缩放不会错位
  - 旋转只做 90° 步进（不是任意角度）—— 描述已如实写成「90° 旋转」，任意角度旋转要处理
    旋转后留白/裁剪边界，复杂度高，留以后
  - 拖拽产生的浮点误差（0.8-0.2=0.6000000000000001）让测试用 `toBeCloseTo` 而非 `toEqual`

自动化验证结果（2026-10-17，阶段 20.13 打码马赛克之后）：
- `npx vitest run` → 25 个测试文件 / **432 个用例**全通过（新增 image-mosaic.test.ts 12 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 322.3 KB / gzip 100.4 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增打码项：造 200×200 噪点图，
  拖框 25%~75% 打码，中心区域颜色种类 **6400 → 16**（细节被抹掉）。15 项全过，
  截图 `shots/regression/toolbox-mosaic.png`
- **改动**：`lib/image-mosaic.ts`（块尺寸按长边比例 + 网格切分 + 贴边格尺寸）
  + `ImageMosaic.tsx`（复用拖拽框选；工作画布在 ref 里累积，可多次打码；马赛克取格中心色填满、
  模糊用 ctx.filter）+ `data/tools.ts` 改 ready
- 关键取舍：
  - 马赛克块尺寸**按图片长边比例**定（不是固定像素）——4000px 大图和 400px 小图同样强度观感才一致
  - 网格切分用 ceil，贴边格用 `cellExtent` 截断 —— 否则右/下边会留一条没打码的缝
  - 工作画布放 ref 累积，支持「多次打码不同区域」，比每次从原图重画灵活
- **踩坑（重要）**：验证脚本里用 `dispatchEvent(new PointerEvent(...))` 模拟拖拽**无效** ——
  合成 PointerEvent 不会触发 React 的 `setPointerCapture`，导致拖拽状态没建立。
  必须用 CDP 的 `Input.dispatchMouseEvent`（真实鼠标事件，浏览器自动生成 pointer 事件）才能测拖拽。
  这条对所有「拖拽类」工具的浏览器验收都适用

自动化验证结果（2026-10-25，阶段 20.14 证件照之后）：
- `npx vitest run` → 26 个测试文件 / **451 个用例**全通过（新增 id-photo.test.ts 19 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 327.4 KB / gzip 101.9 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）新增证件照项：绿底 + 中央红方块，
  换白底后断言 角落 255,255,255（背景替换成功）、中央 204,0,0（主体保留）、尺寸 295×413。
  16 项全过
- **改动**：`lib/id-photo.ts`（尺寸表 / 颜色距离 / 背景判定替换 / 中位数估背景色 / 居中裁剪）
  + `ImageIdPhoto.tsx`（采样四角估背景色 → 按容差替换 → 居中裁到目标尺寸）+ `data/tools.ts` 改 ready
- **能力边界（重要，已在界面明说）**：这是按「颜色接近度」的近似换背景，只适合背景干净、
  颜色均匀的照片；复杂背景（阴影/渐变/杂物）边缘会偏硬。**纯前端无 AI 模型，做不到发丝级抠图**，
  不夸大。描述也从「一键把纯色背景换成白/蓝/红」改成「纯色背景换成白/蓝/红，裁成常见证件尺寸」

自动化验证结果（2026-10-25，阶段 21 并行三工具之后）：
- **用多子代理并行开发**：长图拼接 / 图片转 PDF / Code128 条形码 三个工具由 3 个子代理
  各自独立开发（只建自己的 lib + 组件 + 测试，不碰共享文件），主代理统一接线（tools.ts、
  ToolboxView.tsx、toolbox.css）并全量验证。这样并行不打架。
- `npx vitest run` → 29 个测试文件 / **487 个用例**全通过
  （新增 barcode 15 + images-to-pdf 9 + image-stitch 12 = 36 条）
- `npx tsc --noEmit` → 退出码 0（子代理没跑 tsc，主代理统一发现并修了一处：
  `buildPdf` 返回 `Uint8Array<ArrayBuffer>` 才能当 BlobPart，和 id-photo 同类问题）
- `npx vite build` → 成功（JS 340.4 KB / gzip 105.5 KB）
- 一次性浏览器实拍（`shots/toolbox-verify.mjs`）扩到 **19 项**，新增三条全过：
  长图拼接 100×80+100×40 → 100×120（gap 设 0）；图片转 PDF 两张图 → 2894 字节、
  头部 `%PDF-1.4`（拦截 createObjectURL 读 blob 首字节验证）；条形码 ABC123 →
  canvas 363×104、黑条像素 11040
- **三个工具的能力边界（如实）**：
  - 长图拼接：纵向统一宽/横向统一高，各图等比缩放；间隔默认 8px
  - 图片转 PDF：手写 PDF 1.4，JPEG 用 DCTDecode 直嵌（不二次压缩）；只做「图片→PDF」，
    不做「PDF→图片」
  - 条形码：Code 128 Code Set B（ASCII 32–126）；**不是二维码**，卡片名已从
    「二维码与条形码」改为「条形码生成」

自动化验证结果（2026-10-25，阶段 22 网页分享之后）：
- 网页分享工具（子代理开发，主代理接线）：`data/share-sites.ts`（14 个真实精选站）
  + `lib/share-sites.ts`（groupByCategory / filterShareSites）+ `WebShare.tsx`
- `npx vitest run` → 30 个测试文件 / **498 个用例**全通过（新增 share-sites 11 条）
- `npx tsc --noEmit` → 退出码 0；`npx vite build` → 成功（JS 344.7 KB / gzip 107.1 KB）
- 一次性浏览器实拍扩到 **20 项**，新增：网页分享 14 张卡片、外链 target=_blank/rel=noopener、
  搜索过滤生效；20 项全过
- 临时分享箱（temp-share）保持 `soon`：要后端存文件，纯静态站无法实现。**描述已改成
  「需后端，纯静态站无法实现」**，不再让用户点了困惑
- 至此工具箱 16 卡 **15 个可用**，仅剩「临时分享箱」因需后端保持 soon

自动化验证结果（2026-10-26，阶段 16 亮色主题之后）：
- **数据契约升 v6**：`preferences` 新增 `appearance: 'dark' | 'light'`。
  外观是持久化偏好 → 属于数据契约 → 按项目铁律必须升版本（不能「藏在 CSS 里」）。
  老数据无该字段，`sanitizePreferences` 的 `pickOption` 退回 `'dark'`，升级后外观不变。
- 核心是 `resolvePalette(theme, appearance)`：`theme` 决定色相、`appearance` 决定明暗，两维正交。
  `useDaylight(theme, appearance)` 同时做两件事：给 `<html>` 写 `data-appearance`
  （切 `tokens.css` 里 `:root[data-appearance='light']` 那组变量）+ 用 `resolvePalette` 选色板。
  **只做其一都会得到「浅底白字」崩坏画面**。
- `LIGHT_PALETTES` 四套亮色板（dawn/day/dusk/night），背景亮度均 > 200 且高于对应深色版。
- 硬编码色清理：`app.css`/`features.css`/`toolbox.css` 里散落的 `rgba(255,255,255,.06…)/rgba(0,0,0,.22…)/#fdba74/#1a2033`
  等全部换成 `tokens.css` 新增的语义变量（`--surface-inset`、`--hover-tint`、`--border-hover`、
  `--shadow-card`、`--warn`、`--card-fallback` 等），亮色块里逐条覆盖。这样切外观只切变量组，组件 CSS 不感知明暗。
- `SettingsPanel` 新增「明暗外观」下拉（`select[aria-label="明暗外观"]`）。
- `npx vitest run` → 30 个测试文件 / **503 个用例**全通过（新增 daylight 的 LIGHT_PALETTES/resolvePalette 5 条）
- **多时区**：`TZ=UTC` → 503 全绿；`TZ=America/New_York` → 503 全绿
- `npx tsc --noEmit` → 0 错误；`npx vite build --logLevel warn` → 成功（无告警输出）
- `node scripts/browser-check.mjs` → 23 项全过（其中硬编码的 `version === 5` 断言改成 6 + appearance='dark'）
- `node shots/toolbox-verify.mjs` → 21 项全过
- `node shots/appearance-verify.mjs` → **9 项全过**：默认深色正文浅色 → 切浅色后正文 `rgb(15,23,42)`、
  `--bg-1=#f2f4fa`、`--glass-bg` 为白色系 → 浅色下工具箱文字也是深色（无白字白底）→
  刷新后浅色保持（已入库持久化）→ 切回深色正常 → 数据版本为 6。
  截图人工确认：浅紫底、深墨字、白玻璃卡、樱花淡化，对比度正常。

自动化验证结果（2026-10-26，阶段 16 清理孤儿记录之后）：
- 新增 `lib/orphans.ts`：`findOrphans`（统计孤儿 id / 涉及天数 / 条目数，同一天同 id 只算一条）
  + `removeOrphans`（剔除孤儿，某天清空就删 key，无变化返回原对象）。纯函数，不 import React。
- 写操作走 `reducer`：新增 action `orphansCleared`，只调 `removeOrphans`。**不新增数据字段、不升版本**（仍是 v6）。
- UI 是「有才显示」的 `components/OrphanCleanup.tsx`，挂在热力图和备份条之间。
  没有孤儿时整块不渲染 —— 避免常驻一个不可逆的破坏性按钮诱导误点；
  有孤儿时如实报数（N 条 / M 个已删站点 / K 天），点击前再 `confirm`，并把「以后加回同域名就接不回历史」讲清楚。
- **为什么清理不自动做**：孤儿记录是刻意保留的（删卡片不删历史，加回同域名能接回）。
  自动清理会破坏这个恢复能力，而清理本身不可逆 —— 只能用户显式点。
- 只动 `records`，不碰 `targets` 快照（快照记的是当时确实存在的站点，站点后来被删不该改写历史）。
- `npx tsc --noEmit` → 0 错误；`npx vitest run` → 31 文件 / **515 用例**全通过（新增 orphans.test.ts 9 条 + reducer 2 条）
- `npx vite build --logLevel warn` → 成功
- `node scripts/browser-check.mjs` → 23 项全过（签到主链路未受影响）
- `node shots/orphan-verify.mjs` → **9 项全过**：无孤儿时区块不渲染 → 塞入带孤儿数据后报数正确（3 条/2 站点/2 天）
  → 浅色下标题用深色警示色 rgb(180,83,9)（不是浅底亮橙）→ 清理前孤儿确实在存储里
  → 点清理后孤儿全剔除、有效记录保留、只剩孤儿的日期 key 消失
  → 顶部提示「已清理 3 条」→ 刷新后仍干净（真写盘）→ 站点清空时全部记录判为孤儿 → 版本仍为 6。

真折射玻璃实测结论（2026-10-26）：**技术上可行，但决定不做**。
- 用 `shots/backdrop-support-probe.mjs`（零下载，复用本机已装 Edge）做了最小实验：
  同一块黑白竖条纹区域分别设 `backdrop-filter: none / blur(8px) / url(#disp)` 截图比对。
  - `blur` 与 `none` 不同 → 正对照成立，检测手段有效
  - `url(#disp)` 与 `none` 不同，且截图里竖条纹被**弯成波浪** → **Chromium 156 上确实应用了 feDisplacementMap**
  - `CSS.supports('backdrop-filter','url(#disp)')` → `true`；`-webkit-` 版本 → `false`
- **不做**的理由（三条权衡，不是技术不通）：
  1. 只验了 Chromium。本机没有 Firefox；Windows 上无法验 Safari（iPhone 用户的主要浏览器），
     而 `-webkit-backdrop-filter` 对 `url()` 报 false，iOS 很可能走不通。
  2. `feDisplacementMap` 每帧对整块 backdrop 逐像素位移，卡数一多必掉帧 ——
     正是「已知技术红线 1」；无头浏览器也测不出真实帧率，只能真机验。
  3. 调试靠肉眼、几乎无法自动化断言，和维护成本不成比例。
- 结论：维持 A 路线（`blur + saturate + 内阴影 + 指针高光`）的磨砂玻璃。
  以后若真想再评估，**先跑 `shots/backdrop-support-probe.mjs`**，不要重复查资料。

自动化验证结果（2026-10-26，把剩余人工验收转自动化之后）：
- 新增 `shots/acceptance-verify.mjs`（零依赖、复用本机 Chrome/Edge、跑完自清理），
  覆盖 4 类一直标着「必须人手点」的场景，共 **8 项断言全过**：
  1. **删掉再加接回历史**（最核心）：先给 bilibili-com 造今天/昨天/前天 3 天记录，
     删卡后记录仍在（孤儿）→ 用同样网址加回 → id 恢复 `bilibili-com`、
     今日已签接回、**「连续 3 天」「累计 3 天」都接回**。
  2. **表单三条判重**：同域名不同路径被拦（`已经有「bilibili.com」的卡片了`）、
     只改分类能存（不被自己域名判重）、编辑改到别的域名被拦（`更换网站请新建站点`）。
  3. **点卡片跳转**：`target=_blank`、`rel` 含 `noopener`、`href` 是绝对 http(s) 地址。
  4. **悬停高光跟随**：用 CDP 真派发 `Input.dispatchMouseEvent`，
     卡片写入 `--mx/--my`、页面写入 `--pointer-x`（合成 PointerEvent 不可靠，见既有教训）。
  5. **v1 老备份导入**：旧 id `bilibili`/`jd` 被重写成 `bilibili-com`/`jd-com`，原始旧 id 不残留。
- 顺带把 `PROGRESS.md`「未验证项」里能被自动化覆盖的条目标成 `[x]` 并注明脚本；
  留下 4 条确实只能手点的（hover 图标出现、删除后百分比回落、热力图格子深浅、导出文件落盘）。
- 本轮**没有改任何产品代码**：只是验证 + 文档。`tsc` / `vitest` 基线不变（31 文件 / 515 用例）。

自动化验证结果（2026-10-26，阶段 23 三项并行之后）：
- **站点拖拽排序**：`lib/sites.ts` 新增 `canReorder`（拒绝原地 / 不存在 / 跨置顶三组），
  reducer 新增 `siteReordered`（把被拖项**移动到**目标位，中间项让位；`from < to` 时插入点 `to-1`）。
  `GlassCard` 加拖拽把手（`card__handle`，仅手动顺序下渲染），`SiteGrid` 用 window 上的
  pointermove/pointerup 驱动（指针捕获后事件仍冒泡到 window），`elementFromPoint` 算落点。
  `onDragStart` 比规格多一个 `point` 参数 —— 4px 误触阈值需要按下坐标，否则只能读 `window.event`。
  `overIdRef` 是必要的：pointerup 闭包里读 state 会拿到旧值（move→up 同轮到达时还没重渲染）。
  - `sites.test.ts` 8 条 + `reducer.test.ts` 新增 `siteReordered` 6 条
  - `scripts/drag-check.mjs`（`npm run test:drag`）**4 项全过**：手动顺序下 6 个把手 →
    向下拖 bilibili 到 taobao 位（顺序变 `jd/bilibili/taobao/...`）→ 置顶 github →
    普通站拖到置顶卡被拒（存储顺序一字不变）。**必须用 CDP 真鼠标事件**：合成 PointerEvent 不触发 pointer capture
- **工具箱按需加载**：`ToolboxView` 把 15 个工具改成 `React.lazy` + 外层 `<Suspense>`，
  fallback 是 `.toolbox__loading`（正在加载工具…）。构建产物确认 **15 个工具各自独立 chunk**
  （最大 `ImageMosaic` 5.28 kB），主包不再预载工具箱 JS
- **验收脚本迁入 `scripts/`**：`shots/` 整个目录被 `.gitignore` 忽略，之前的专项脚本只存在于本地、
  换机即失。现迁入 `scripts/` 并加 npm 入口：`test:toolbox` / `test:appearance` / `test:orphan` /
  `test:acceptance` / `test:drag` / `probe:backdrop`，workspace 统一用 `fileURLToPath(new URL('..', import.meta.url))` 解析
- `npx tsc --noEmit` → 0 错误；`npx vitest run` → **32 文件 / 529 用例**全通过（+14 条拖拽相关）
- `npx vite build` → 成功，产物见上
- 全部浏览器脚本实跑：`test:browser` 23 / `test:toolbox` 20 / `test:appearance` 6 /
  `test:orphan` 9 / `test:acceptance` 8 / `test:drag` 4 → **全绿**

自动化验证结果（2026-10-13，CI 首次跑通）：
- **CI 第一次执行 `npm test` 就红了** —— 见 MY-ISSUES #15。不是新 bug：
  `date.test.ts` 的对照断言用了 `new Date(2026, 9, 2, 0, 30)`，
  这行按**运行机器的时区**解释，开发机 UTC+8 得到 16:30Z、CI（UTC）得到 00:30Z，
  断言方向正好反过来。而 `deploy.yml` 里的 `npm test` 是本次才加的 ——
  这条坏断言从项目初始化就躺着，只是第一次被跑出来。
- 修复：`date.test.ts` 新增 `localTime()`（`Date.UTC` + `getTimezoneOffset()` 平移），
  三处依赖本地时区的断言改用它；`backup.test.ts` 同源的一处一并改
- **四种时区各跑一遍**：本机默认（UTC+8）/ `TZ=UTC` / `TZ=Asia/Shanghai` /
  `TZ=America/New_York` → **286 用例全绿**
- 注入反验（把 `toDateKey` 换成 `toISOString().slice(0,10)`）：
  本机 **4 条红**，`TZ=UTC` **只 1 条红** —— 实证了「UTC 机器上这个 bug
  原理上不可测」，写进了 #15 的学习 3 和已知缺口

## 部署状态

- 站点地址：https://down2004-xie.github.io/checkin-dashboard/
- 仓库：https://github.com/down2004-xie/checkin-dashboard
- **默认分支是 `master`，不是 `main`** —— 本地 `git init` 默认 master，GitHub 网页新建仓库默认 main。
  workflow 里写成 `main` 的话推送后 Actions **完全不触发且不报错**，是最难查的一种失败。
- 部署方式：GitHub Actions，推送到 master 自动构建发布（`.github/workflows/deploy.yml`）
- `dist/` 不进版本库（`.gitignore` 里），由 CI 每次构建生成
- 首次部署失败过一次：报 `Get Pages site failed`，原因是仓库 Settings → Pages 的 Source
  没设成 "GitHub Actions"。改完 Re-run 即通过。**这条不进 MY-ISSUES** —— 报错信息
  本身已给出原因和文档链接，属于「一查就明白」，不符合「非平凡」标准。
- **安全审查结论（2026-10-02）**：远端 URL 无内嵌凭据、commit 邮箱已是 GitHub noreply
  形式、全项目无密钥特征、`node_modules`/`dist` 未误提交。发现并修复 1 处注入点（见 #8）。

**阶段 14（v3 身份改造）会在页面加载时自动改写 localStorage**，把已有的站点 id
重写成域名形态并同步重写历史记录。迁移逻辑本身有 20 个单测覆盖（含塌陷合并、
新旧 id 交叉、v1 链条、幂等），但**「真的在浏览器里跑一遍」没验证过**。
（原先这里写着「项目不是 git 仓库，出问题没有版本可回退」—— 已经过期了，
项目现在是 git 仓库、有提交历史。但**迁移本身仍然没在真实 localStorage 上验过**，
这条验收别跳过。）

**阶段 13 有验证盲区**：`parseBookmarks` 依赖 `DOMParser`，
Vitest 默认跑在 node 环境没有这个 API（已确认 Node v22.17.0 下 `typeof DOMParser === 'undefined'`），
项目也刻意不引入 jsdom。所以 DOM 解析那一层**没有自动化保护**，只有 `planImport` 有单测。
已备好样本文件 `fixtures/sample-bookmarks.html`，里面埋好了边界情况，可直接拿来验收，不必先导出自己的真实书签。

未验证项（需要你在浏览器里实际操作）：

阶段 17 新增（樱花装饰）—— 这组我已经用 Playwright 实拍验证过，
列在这里是为了**换台机器/换个浏览器时能快速复核**，不必逐项重跑：
- [x] 右下角有一棵樱花树，树干从画面右下角长进来，不是悬空的
- [x] 花瓣持续从上往下飘，形状是叶尖状的、半透明
- [x] 玻璃卡片把身后的樱花糊成粉色光斑（**这是整个效果的核心**，桌面端最明显）
- [x] 点完最后一个签到 → 花瓣从右下角树根涌起再散落，同时树从「含苞」变成「满开」
- [x] 保持 100% 时不再重复爆发；取消一个再勾回来 → 会重新爆一次
- [x] 爆发约 7 秒后，DOM 里那 44 个花瓣节点被回收（`document.querySelector('.petal-layer--burst')` 返回 null）
- [x] 移动端（DevTools 切设备）树不摆、花瓣减半为 7 片、卡片上的樱花是极淡的纹理而不是灰线
- [x] 系统开「减少动效」后花瓣整层消失、树静止但仍显示
- [ ] **在真实手机上过一遍**（我只在 Chromium 的移动端视口里验过，没用真机）

阶段 14 新增（迁移 + 身份）：
- [x] **打开页面无报错，原有卡片都还在、签到记录没丢** —— 对应浏览器场景
      `Fresh load migrates to v5 and creates today target snapshot`
- [x] **DevTools → Application → Local Storage → 看存的 JSON，
      `version` 是 6、站点 id 是 `jd-com` 这种形态** —— 同上，脚本里直接断言了
- [x] **删掉一张卡片，再用同样的网址加回来 → 「连续 N 天」和「累计」没归零，今天已勾的也还在**
      —— `npm run test:acceptance`（`scripts/acceptance-check.mjs`，真删、真加，连续 3 天 / 累计 3 天 / 今日已签全部接回）
- [x] **用同一个域名的不同路径加两个站（如 `jd.com` 和 `jd.com/index.html`）→ 提示「已经有 jd.com 的卡片了」**
      —— 同上，断言了 `已经有「bilibili.com」的卡片了`
- [x] **编辑一张卡片，只改分类不改网址 → 能保存成功**（不能被自己的域名判成重复）—— 同上
- [x] 编辑卡片把网址改成另一张卡的域名 → 应该被拦下 —— 同上，断言了「更换网站请新建站点」

阶段 19（2026-10-12 代码审查修复）新增：
- [x] **把 localStorage 里的 `preferences.theme` 手改成 `["auto"]` → 刷新，
      页面正常打开并退回默认主题**（以前是整页白屏）—— 场景
      `Array-valued preferences fall back`
- [x] **`records` 里塞一条重复 id → 刷新，管理区照常可用**（以前会被锁成只读）—— 场景
      `Harmless duplicates no longer latch protection mode`
- [x] **`records` 里塞一个 `5`（不是字符串）→ 刷新，进保护模式且拒绝写入** —— 场景
      `Genuinely unreadable entries still trigger protection`
- [x] **筛到只剩一张卡 → 「前移/后移」都置灰**（以前按全集算索引，会亮着）—— 场景
      `Move buttons follow the filtered visible list`
- [x] **在「手动顺序」下点「前移」→ 卡片真的换了位，网格顺序跟着变** —— 场景
      `Moving swaps with the visible neighbour`
- [x] **置顶站和普通站之间不能互换**（换了屏幕上也不动，所以按钮置灰）—— 场景
      `Pinned sites cannot be swapped across the pinned boundary`
- [x] **把「统计范围」从近 26 周改成近 4 周 → 网格列数从 26 变成 4** —— 场景
      `Stat range drives the grid itself`
- [x] **同一帧内连点两张卡 → 两个都保存上**（脚本里先把 `navigator.locks` 藏掉）—— 场景
      `Two clicks in one tick both persist without Web Locks`

> 上面带 `[x]` 的都是 2026-10-12 的 `scripts/browser-check.mjs` 自动跑过的
> （23 项），不再需要人工点。留 `[ ]` 的是脚本没覆盖、**必须人手点一次**的。

阶段 13 新增：
- [ ] **点「从书签导入」选 `fixtures/sample-bookmarks.html`，面板弹出且显示「共解析 13 条」**
- [ ] **面板里「购物」「开发」两个文件夹置灰不可勾（站点已全部存在），其余可勾且默认勾上**
- [ ] **「未分类」「签到」等分组名正确，没有出现叫「书签栏」「其他书签」的分类**
- [ ] **导入按钮上的数字 = 4，点击后提示「已从书签导入 4 个站点」**
- [ ] **导入后卡片出现在网格里，且分类筛选 chips 多出「签到」「学习」**
- [ ] **同一个样本再导一次 → 提示没有新站点（去重生效）**
- [ ] 在自己真实导出的书签文件上再走一遍

前几轮遗留（2026-10-26 复核：能被自动化覆盖的已标 `[x]` 并注明脚本，其余确实只能手点）：
- [x] 页面渲染正常，无控制台报错 —— `browser-check.mjs` 结尾断言 `failures` 为空
- [x] 点卡片跳转到目标站（新标签页）—— `acceptance-verify.mjs`（target=_blank / rel=noopener / href）
- [x] 点勾选按钮能打勾/取消，刷新后状态还在 —— `browser-check.mjs`（checkin + reload persistence）
- [ ] 卡片悬停时右上角出现 ✎ / × 图标，能编辑和删除（纯 CSS hover 显示，无头下难验「出现」这一步）
- [ ] 删除后今日百分比会回落（不是虚高超过 100%）
- [x] 顶部分类 chips 能筛选卡片，「全部」能还原 —— `browser-check.mjs`（分类筛选 + 重置）
- [ ] 热力图每个格子颜色深浅随当天签到比例变化（脚本只验了列数/范围，没验深浅）
- [x] 卡片显示「连续 N 天」—— `acceptance-verify.mjs`（断言「连续 3 天」）
- [x] 鼠标悬停卡片时高光跟随；页面背景光晕跟随鼠标 —— `acceptance-verify.mjs`（真派发 pointermove，读 --mx/--my/--pointer-x）
- [ ] 导出备份能下载 JSON 文件，再导入提示合并成功（导入合并有自动化，**下载落盘**那一步未断言）
- [x] 老版本（v1）备份文件也能导入成功 —— `acceptance-verify.mjs`（旧 id 重写成域名形态）
- [x] 手机尺寸下（DevTools 切设备）布局正常、无明显卡顿 —— `browser-check.mjs`（390px 无横向溢出 + reduced-motion）

## 下一步（下次开工第一件事）

1. **先跑一遍自动化确认基线是绿的**：
   `npm test && npm run build && npm run test:browser`
   （当前应为 32 文件 / **529 用例**、构建成功、23 项浏览器场景通过。
   **注意顺序**：`test:browser` 跑的是 `dist/`，必须先 build）
   想更保险再加一眼时区：`TZ=UTC npm test`
2. **确认 CI 已经变绿** —— 见 MY-ISSUES #15：首次推送时 build job 在
   `npm test` 上失败（测试把开发机时区写死了）。修复已提交，需要
   **再推一次**才能看到 Actions 转绿。绿了才说明「CI 会跑测试」这件事
   真的建立起来了
3. **在真实手机上打开线上站点看一眼** —— 樱花这块的移动端降级我只在
   Chromium 的移动端视口里验过，真机的 GPU 和视口行为可能不同（已知缺口表里有这条）
4. **剩下的人工验收**（自动化已经吃掉大部分，现在只剩下面这些）：
   - 阶段 13：书签导入面板的 6 条（用 `fixtures/sample-bookmarks.html`，不必碰真实书签）
   - 前几轮遗留里确实只能手点的 4 条：hover 图标出现、删除后百分比回落、
     热力图格子深浅、导出文件真的落盘
   - 阶段 14 / 点卡片跳转 / 悬停高光 / v1 老备份：**已由 `npm run test:acceptance` 接管**
     （8 项，一条命令跑完，零新依赖）
5. 验收没问题后绑定二级域名 —— 需要先确定「完整域名」和「DNS 在哪家服务商」，
   两处都要配：DNS 的 CNAME 记录 + 仓库里的 `public/CNAME` 文件（`public/` 目录
   目前不存在，要新建）

> MY-ISSUES 待解决表里的 **🟠 待修** 已在本轮全部清空（7 条全修 + #14），
> 表里剩下的都是 `🟦 暂时绕过 / 无法解决`，属于「想清楚了才留的」，
> 不需要再排优先级。

## 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 签到方式 | 半自动（手动跳转 + 打勾记录） | 自动签到必须有后端，且要在服务器存账号密码，GitHub Pages 做不到 |
| 数据同步 | 不做，只存本机 localStorage | 用户确认不需要跨设备；加同步就要引入第三方服务 |
| 路由 | 不引入 react-router | 单视图够用；一个域名一个部署的场景下 basename 极易配错 |
| UI 库 | 不引入 | 玻璃效果是本项目核心展示点，用现成组件就失去意义 |
| **Vite base** | **`'./'` 相对路径** | 两种仓库形态（用户站/项目站）都能跑，直接消掉 base 配错白屏的坑 |
| 玻璃效果路线 | A 路线（backdrop-filter 模糊 + 内阴影高光 + 指针高光） | 背景用 CSS 渐变时观感已足够；真折射成本高且有兼容风险。**2026-10-26 实测**：Chromium 支持 `backdrop-filter: url()`，但 Safari/iOS 的 `-webkit-` 变体不支持、逐像素位移会掉帧，决定仍走 A 路线 |
| 背景 | CSS 渐变（固定层），不用照片 | 玻璃性能 = 元素数 × 背后像素复杂度。渐变便宜，照片昂贵 |
| 提醒方式 | 打开页面时顶部提示 + 未签数量 | 纯静态站无法定时推送 |
| 连续天数的定义 | 当天未签不算断（显示昨天的连续数） | 否则每天早上一睁眼看到「连续 0 天」，会以为记录丢了 |
| 导入策略 | 合并（取并集）而不是覆盖 | 新设备导入旧备份时，直接覆盖会丢掉本机已有记录 |
| **不使用 `contain: paint`** | 刻意排除 | 它会让元素成为自己的 backdrop root，导致玻璃效果消失。见 app.css 注释 |
| streak 用字符串排序 | `'YYYY-MM-DD'` 字典序 == 时间序 | 不用把每个 key 解析成 Date 再排序 |
| **站点定义存哪** | **存进 localStorage（v2）** | 要支持页面内增删站点，站点就不能是模块常量。`data/sites.ts` 降级为「兜底种子」，只在 v1 迁移和数据为空时读 |
| **迁移逻辑放哪** | **`lib/migrate.ts`，storage 和 backup 共用** | 本机读取和备份导入是两条路径，各写一份校验必然漂移，会出现「本机能升级、导入报错」的割裂 bug |
| **写操作放哪** | **`lib/reducer.ts` 纯函数** | 增删改站点让写操作从 2 条涨到 6 条，散在 hook 里没法测。抽成纯函数后每条规则都有单测 |
| 删站点后历史记录 | **保留（孤儿记录）** | 删了就丢历史太狠；保留后加回同 id 站点能恢复。代价是 records 里会有指向已删 id 的记录 |
| 今日进度统计口径 | **只数当前仍存在的站点**（`countCheckedValid`） | 否则「签了 A → 删掉 A → done 虚高」，进度环会超过 100% |
| 热力图强度 | **已签数 / 当前站点总数 的比例分 4 档** | 绝对数量下，加几个站点会让历史格子突然变深，观感不稳。代价：删站点会让历史格子变深，彻底解决要存「当天站点总数」，留 v3 |
| 热力图起点 | **从今天所在周的周一往前 26 周** | 对齐到周才不会出现半截列；周一为一周之首，符合中文习惯 |
| URL 校验 | **用 `new URL`，不用正则** | URL 合法形态太多，正则必漏。副作用：中文域名会被转成 punycode 视为合法（这是标准行为，接受） |
| **URL 协议校验（存储层这一道）** | **字面量白名单 `/^https?:\/\//i`，不复用 `normalizeUrl`** | 判断的是**原值**，而 `normalizeUrl` 检查的是**改写后的结果**。`javascript:1234` 会被 `parseUrl` 补成 `https://javascript:1234`（合法 URL）从而被 `normalizeUrl` 放行，但原值仍是可执行的 javascript: URL。和上一条不矛盾：`new URL` 负责「解析各种合法形态」，正则负责「匹配固定模式的协议前缀」，各司其职。见 MY-ISSUES #8 |
| 站点 id 生成 | **英文名转 slug，中文名退回 `site-N`** | 中文转不出 slug；id 必须稳定唯一，否则两个站共享 id 会互相污染历史 |
| 卡片上的编辑/删除按钮 | **默认透明，悬停才显示** | 一直显示会让卡片视觉噪音过大。触屏没有 hover，用 `@media (hover: none)` 让它常驻 |
| **书签怎么导入** | **导出 HTML 文件再导入** | 网页读不到浏览器书签（安全边界），`chrome.bookmarks` 只在扩展里可用。只剩这条路 |
| **书签导入是全导还是勾选** | **解析出文件夹列表让用户勾选** | 书签里绝大多数不是每天要签到的站，全导会让页面变成没法用的链接墙。导入的意义是省手输 URL，不是搬整个书签库 |
| 书签文件夹 → 分类 | **只取直接父文件夹名，根文件夹拉黑名单** | 拼全路径会得到「书签栏/技术/前端」这种长串，撑爆筛选 chips；不拉黑名单则每个顶层书签都被打上无意义的「书签栏」分类 |
| 书签去重口径 | **按 URL，不按名字** | 书签名常被用户改（「京东」→「京东(签到)」），只有地址是可靠身份 |
| 书签导入的 id 生成 | **中文名拿不到 slug 时退回域名** | `makeSiteId` 对纯中文名会退回 `site-1`、`site-2`…，导一百个中文书签就是 `site-1…site-100`，看不出谁是谁。用域名得到 `jd-com`、`taobao-com` |
| 书签的 ICON 属性 / favicon | **都不做** | ICON 是 base64 内嵌图，一份书签能到几 MB；抓 favicon 要发网络请求，破坏「纯静态离线可用」 |
| 批量写入 | **加 `sitesAdded`，不循环 `siteAdded`** | 循环要么触发 N 次状态更新，要么做不了「本批次内部去重」——每条的 id 都依赖当时的状态，必须一次算完 |
| **站点身份** | **由 URL 的域名派生，不用名字** | 名字是标签、用户随时会改；且中文名转不出 slug，v2 只能退回 `site-N`，而那个号取决于删除时谁还占着 —— 同一个站删掉再加会拿到不同 id，历史静默断掉。域名派生后同一个站必然同一个 id |
| 同域名只能一张卡片 | **接受这个代价** | 身份就是域名，域名重复即站点重复。代价：不能把 `bilibili.com` 和 `bilibili.com/anime` 当两个独立签到项 |
| 域名去掉 `www.` | **去掉** | `www.jd.com` 和 `jd.com` 是同一个站的两种写法，不去掉会被当成两个站、各记一份历史 |
| 域名之外的部分 | **全部丢掉（路径 / query）** | 每日签到是按站点不是按页面。副作用：`normalizeUrl('not-a-url')` 会补协议并接受，`siteIdFromUrl` 也接受，两者判断必须一致（见 MY-ISSUES #7） |
| 迁移时同域名站点塌陷 | **站点定义留先出现的，records 取并集** | 丢记录比丢一个重复的站点定义严重得多。两条站点的历史都并到保留者名下，一天都不丢 |
| 迁移时映射不到的孤儿记录 | **原样保留，不删** | 删用户数据得用户自己决定；而且阶段 16 本来就有「清理孤儿记录」按钮。代价：这些记录永久失联（MY-ISSUES #6 记录了这个限制） |
| 种子站点 id | **额外维护一张 `LEGACY_SEED_IDS` 对照表** | 种子既被「新建」读、又被「v1 迁移」读。v1 那一步必须播种**旧 id**，否则 v2→v3 的重写映射认不出它们，v1 用户历史全变孤儿 |
| 迁移梯子的写法 | **顺序链，每档只升一级** | 跳级产最新形态会让后面几档失去输入前提。这个原则是踩了 MY-ISSUES #6 之后补上的 |
| 「删了再加接回历史」怎么测 | **用 `calcSiteStreak`（单站），不用 `calcStreak`** | 全局连续天数只判断「那天有没有记录」，孤儿记录照样算数 —— 用它验会得到**假通过**的测试（第一版就写错过） |
| **樱花树放哪一层** | **背景层（`z-index: -1`），在卡片背后** | 卡片的 `backdrop-filter` 会把它糊成一片粉色光斑 —— 这是玻璃效果最好的展示。代价：树一动，背后卡片的模糊每帧重算，所以摆动幅度压到 1 度以内、周期 11 秒、移动端关掉 |
| **飘落花瓣放哪一层** | **前景层（`z-index: 1`），在所有内容之上** | 和树相反。花瓣在卡片背后飘的话，每帧都要重新模糊每张卡片背后的像素，中低端机必掉帧。放最上层走纯合成层（只动 transform/opacity）成本接近零，还多了层「花从眼前飘过」的景深 |
| **樱花树怎么生成** | **递归分形 + 固定种子的伪随机（mulberry32）** | 用 `Math.random()` 的话，勾一次签到触发重渲染，树就在用户眼皮底下换个形状。固定种子保证「同一种子 → 同一棵树」，重渲染和刷新都不变，而且这让生成逻辑成了**可单测的纯函数** |
| 樱花树用图片还是 SVG | **SVG path** | 几百字节的 path 字符串 vs 一张背景图；能直接吃 CSS 变量跟着主题走；形态可调参数，图片改不动 |
| **递归里的角度边界** | **反射（`-0.3 → +0.3`），绝不用截断** | 截断会让边界成为**吸引子**（被截到 0 的枝条，子枝再减又被截回 0，整条支路永远垂直），实测 29% 的枝条塌成平行线，树变成扫帚。见 MY-ISSUES #9 |
| 树冠的花怎么画 | **一个渐变圆 = 一朵花，不逐朵画五瓣** | 树冠近 300 朵，逐朵画花瓣 DOM 涨到几千节点；而一朵在屏幕上只有十几像素，肉眼分辨不出单瓣 —— 看到的本来就是「一簇粉」 |
| **满签爆发的触发条件** | **用「事件计数」（`useCompletionBurst`），不用 `done === total` 这个布尔值** | 布尔值是**状态**不是**事件**：拿它当触发条件会「只要保持满签就一直重爆」，而且一进页面就是满签的话会立刻炸一次烟花（用户什么都没做）。用 ref 记住上一次的值，只在 **false→true 翻转**时自增计数 |
| 移动端樱花怎么降级 | **压淡树的 opacity，不改卡片底色** | 移动端卡片本来就没有 `backdrop-filter`（既有降级），枝条会清晰地透过卡片显出来。改卡片底色会牵连到不是本次引入的问题，改树的影响面小得多。见 MY-ISSUES #10 |
| **待办怎么存** | **按天分组（`Record<DateKey, Todo[]>`），和 `records` 同构** | 这个项目的核心维度就是「一天」：签到记录、连续天数、热力图全挂在日期上。待办跟日期走才和它们同源。落个不分日期的扁平列表，等于在同一个存储里塞两套时间模型 |
| **待办 id 怎么生成** | **随机 UUID，不派生自文本** | 和站点 id「由域名派生」是**相反**的取舍：站点 id 是历史记录的锚，必须稳定（删了再加要能接回历史）；待办只需要当天内唯一定位得了一条。用随机 id 反而更简单，还顺带避开「同一天写两条一模一样的待办（两次「买牛奶」）互相顶掉」 |
| **待办和签到什么关系** | **两条平行的数据线，互不影响** | 待办**不进签到进度环、不触发樱花满开**。两者虽然同构，语义不同：签到是「每天固定要签的站」，待办是「今天顺手记的一件事」。混进进度环会让「100%」的含义变模糊（没写完待办算不算今天没完成？） |
| **给 `CheckInData` 加字段时必须动的地方** | **`migrate` + `emptyData` + `mergeData` 三处，一个都不能漏** | `mergeData` 漏了最隐蔽 —— 导入备份会**静默丢光**新字段（导入成功、页面正常、数据没了）。和当初「只合并 records 不合并 sites」是同一类 bug。`backup.test.ts` 里加了一条「导出再导入，待办一条不少」的端到端测试钉住它 |
| 待办这一版做到哪 | **只做增 / 勾 / 删，只显示今天** | 小步快跑。编辑文本、把昨天没做完的顺延到今天、历史回顾都留到以后；数据已经按天存好了，加这些不用再改存储结构 |
| **工具箱放哪** | **同项目第二个视图，顶部切换，不做路由** | 项目刻意无路由（单视图条件渲染）。加个 `view` state 切换，签到逻辑零改动；工具不需要 URL 可分享 |
| **工具箱数据存哪** | **静态清单 `data/tools.ts`，不进 localStorage、不升数据版本** | 工具是编译期确定的目录，不是用户数据。加工具只改这一个文件 + 写组件 |
| **工具做到什么程度** | **先外壳 + 2 个纯前端工具（单位换算/倒计时），其余 `soon` 占位** | 29 个工具每个都是独立工作量，一次铺完违背「小步快跑」。`soon` 卡诚实标注「开发中」，不假装能用 |
| **工具要不要持久化** | **不要，刷新即清空** | 单位换算/倒计时都是「当下算一下」，没有跨会话保留的价值。要持久化就得再开一个存储键，超出「工具箱不碰用户数据」的边界 |
| **临时分享箱能不能做** | **不能（纯静态）** | 「上传文件生成取件码」必须有后端存文件。项目是纯静态站，标 `soon` 不实现，除非将来接第三方存储 |
| **单位换算怎么实现** | **各量纲定一个基准单位，值先转基准再转出；温度单独走偏移公式** | 每对单位写一条换算率要 N² 条且必抄错；基准中转只需 N 条。温度有偏移量（非线性），不能用 factor |
| **倒计时的天数怎么算** | **把两个纯日期折成 UTC 天序号相减，不用时间戳除 86400000** | 夏令时那天只有 23/25 小时，除法得小数、round 后会随季节偏一天。UTC 无夏令时，天序号差就是精确自然日差 |
| **明暗外观怎么建模** | **`appearance` 与 `theme` 正交**：`theme` 定色相、`appearance` 定明暗 | 用户要的是「白天能看清」而不是「只能选清晨/晴日/黄昏/夜晚」。做成两维后 4 相 × 2 明暗 = 8 套组合，由 `resolvePalette(theme, appearance)` 一次算出一个具体色板 |
| **外观开关要不要升数据版本** | **要，升 v6** | 外观是持久化偏好，持久化的偏好属于数据契约。看起来「只是个 CSS 开关」，但只要它进了 localStorage 就必须有版本和迁移分支，否则以后没法给老用户补默认值 |
| **切外观时改变量还是改组件样式** | **只切 `data-appearance` 下的变量组，组件 CSS 不感知明暗** | 组件里写死颜色就等于把两套主题抄两遍，改一处漏一处。先把散落的 `rgba(255,255,255,.06)` 这类硬编码收敛成语义变量（`--hover-tint` / `--surface-inset` / `--shadow-card`…），再整组覆盖 |

## 已知缺口（故意留到以后）

| 缺口 | 计划处理阶段 | 说明 |
|---|---|---|
| 真·定时推送提醒 | 不做（除非加后端） | 纯静态站无法在页面关闭时唤醒 |
| 真折射玻璃（SVG feDisplacementMap / WebGL） | ✅ 已结论（2026-10-26）：不做 | 实测 Chromium 156 **支持** `backdrop-filter: url(#f)`（条纹确实被弯折，见验证记录），但 Safari/iOS 的 `-webkit-` 变体不支持 `url()`、且逐像素位移在中低端机上会掉帧（红线 1）。维护成本高、不可自动化。维持磨砂玻璃。想重启评估先跑 `npm run probe:backdrop` |
| 跨设备同步 | 阶段 16 | 需接 Supabase / Firebase 免费层 |
| 清理孤儿记录 | ✅ 已解决（2026-10-26） | `lib/orphans.ts` + `orphansCleared` action + `OrphanCleanup` 区块。平时不渲染（有孤儿才出现），点击前二次确认；只动 `records`，不碰 `targets` |
| 热力图存「当天站点总数」 | ✅ 已解决（v5） | v5 的 `targets` 快照已经在数据层解决：`summarizeDay` 优先读当天的目标快照，增删站点不会再改写历史格子的深浅。没有快照的老记录显示「目标未知」而不推测 —— 刻意不伪造历史 |
| 站点拖拽排序 | ✅ 已解决（2026-10-26） | 手动顺序下每张卡有拖拽把手，pointer 事件 + `elementFromPoint` 算落点，落库走 `siteReordered`（移动到目标位）。`canReorder` 挡住跨置顶分组；`npm run test:drag` 4 项守着。原来的「前移/后移」按钮保留，供键盘用户使用 |
| IndexedDB + storage.persist() | 阶段 16 | 降低 localStorage 被清概率，当前数据量属过度设计 |
| 环境光传感器（AmbientLightSensor） | 仅作彩蛋 | MDN 标注实验性、非 Baseline，不能作为依赖 |
| `parseBookmarks` 的 DOM 解析层无单测 | ⚠️ 部分解决 | 依赖 `DOMParser`，node 环境没有。刻意不装 jsdom。**2026-10-12 起有兜底**：`npm run test:browser` 里有一项在真实浏览器里跑它（`Bookmark HTML parser renders an import plan in a real browser`），不再是纯人工 |
| storage.ts 的浏览器环境单测 | ✅ 已补（2026-10-12） | v5 改动引入了 `protected persistence` 一组共 16 条：用手写的 Map 假 localStorage + `vi.stubGlobal` 覆盖了读保护、配额满、无 locks 时的陈旧写入、多标签串行、恢复前归档、快照不重复落盘 |
| 亮色主题 | ✅ 已解决（v6，2026-10-26） | `preferences.appearance` + `LIGHT_PALETTES` + `resolvePalette`，硬编码色已换成语义变量；`npm run test:appearance` 6 项浏览器断言守着「切过去不能白字白底」 |
| v3 迁移前就已删除的站点，历史永久失联 | 不处理 | 迁移要算新身份得有 url，孤儿记录里只有一个旧 id，信息在删除那刻就丢了。**v3 之后不会再有这个问题**（删了再加能接回），但迁移前丢的补不回来 |
| 迁移在真实 localStorage 上的行为 | ⚠️ 部分解决（2026-10-12） | `npm run test:browser` 的第一项就跑通了「空库打开 → 落盘 v5 → 建当天快照」，真实链路有覆盖了。**没覆盖的是「老版本真实数据升上来」** —— 单测里 v1→v5 有链式测试，但没在真浏览器里塞一份 v1 的 localStorage 跑过 |
| 樱花的**视觉**效果无自动化验收 | 阶段 16 | `lib/sakura.ts` 的生成逻辑有 27 条单测（确定性 + 方向分散度），但「树看起来像不像树」「爆发像不像从树下涌起」只能靠人眼。项目刻意不引入 jsdom，视觉回归要额外引 Playwright + 基线图管理，对当前体量不划算。现在 `npm run test:browser` 会截 `desktop.png` / `mobile.png` 两张图，但那只是**留档**，没有基线比对 |
| 樱花在**真机**上的表现未验证 | 阶段 16 | 移动端降级只在 Chromium 的移动端视口里验过（390×844）。真机的 GPU 合成、`backdrop-filter` 支持度、滚动性能都可能不同。上线后拿手机开一次即可 |
| 移动端树的压淡系数是口味值 | 阶段 16 | `sakura.css` 里 0.26 这个数是照截图调的，没有可量化判据。改一个数就能调 |
| 浏览器回归脚本未进 CI | 阶段 16 | `npm run test:browser`（23 项，`scripts/browser-check.mjs`）已能一条命令跑完并自清理。不并入 `npm test` 的原因：它要起服务 + 起浏览器，会让纯函数单测从 2 秒变分钟级。要进 CI 应该单开一个 job |
| 待办只能看「今天」，没有历史回顾 | 待定 | 数据按天存着，历史都在 localStorage 里，加一个折叠列表就能看。当前刻意不做：待办是「今天要做什么」的即时清单，翻昨天的没意义（没做完的应该今天重记一条） |
| 待办没有排序 / 拖拽 / 优先级 | 待定 | 当前按添加顺序。排序要往 `Todo` 上加字段（或改数组顺序的持久化方式），属于功能扩张，先不做 |

## 验证方式

### 开发环境

```bash
cd D:/Code/test/3/checkin-dashboard
npm run dev
```

打开 http://localhost:5173，按上面「未验证项」清单逐项操作。

### 书签导入怎么手工验（不用碰真实书签）

点页面下方「从书签导入」，选 `fixtures/sample-bookmarks.html`。
这个文件是照 Chrome 导出格式手写的，里面埋了：根文件夹（书签栏/其他书签）、
嵌套两层文件夹（其他书签/学习）、`javascript:` 书签小工具、`chrome://` 内部页、
组内重复地址。文件末尾注释里写了每一项的期望结果。
期望看到：共解析 13 条，「购物」「开发」两个文件夹置灰，导入按钮显示 4。

想用真实书签测：Chrome / Edge → 书签管理器 → 右上角 ⋮ → 导出书签，
得到一个 `bookmarks_*.html`，喂给同一个入口即可。

### 单元测试（纯函数层）

```bash
npm test
TZ=UTC npm test              # 换时区再跑一遍，够快，值得养成习惯
TZ=America/New_York npm test # 反向半球也扫一下
```

> **为什么会需要多跑几个时区**：测试里 `new Date(y, m, d)` 这类写法隐含了
> 「运行机器的时区」这个前提，本地绿不代表 CI（UTC）也绿 —— 2026-10-13
> 就是栽在这上面，见 MY-ISSUES #15。改动任何跟日期相关的东西后，
> 至少补一条 `TZ=UTC`。

覆盖：日期换算（含跨时区/跨月/跨年/闰年）、连续天数算法（全局 + 单站）、
时段配色、备份解析与合并、v1→v2→v3→v4→v5 完整迁移链、reducer 各分支、
站点身份生成与 URL 校验、热力图网格与每日目标快照、站点筛选排序、
书签导入的合并去重、樱花树的生成、待办的增改删与校验、
**localStorage 持久化的保护分支**（mock 掉 localStorage，不需要 jsdom）、
**工具箱的单位换算与倒计时**（单位表无重复 id、温度交叉点、夏令时无关的天数差）、
**随机抽签**（洗牌是排列、不改原数组、分组人数差≤1、名单去重、随机源可复现）、
**九宫格切图**（切格首尾相接不丢像素、不整除时均匀、文件名规则）、
**图片压缩**（不放大、极端比例短边保 1px、字节格式化、压缩率正负）、
**文本统计**（中英混排分词、标点计字符、空文本、emoji 代理对、阅读时长）、
**加水印坐标**（九宫格锚点、平铺点位、水印大于画布可为负、非法尺寸判空、hex→rgba、对比阴影色）、
**图片格式**（三种格式能力标记、MIME 唯一、扩展名替换）、
**裁剪几何**（角度归一、旋转后尺寸互换、矩形 clamp、拖拽点→正向矩形）、
**马赛克**（块尺寸按比例、网格 ceil 铺满、贴边格截断）、
**证件照**（颜色距离、容差判定、替换保留 alpha、中位数估色抗离群、居中裁剪）、
**长图拼接**（统一边、等比缩放、gap 计入、空/单图）、
**PDF**（结构头/尾、页数、xref 偏移真能解析到 `N 0 obj`）、
**条形码**（Code128 模式表、校验和公式、START/STOP、模块长度）、
**网页分享**（按分类分组、组顺序首次出现、模糊过滤、大小写不敏感）、
**明暗色板**（亮色结构与深色一致、亮度确实更高、dark/light 路由、auto 按时辰选色相但明暗仍由 appearance 决定）、
**孤儿记录**（统计去重、暂停站点不算孤儿、只动 records、清空的天删 key、无变化返回原引用、幂等）、
**拖拽排序**（`canReorder` 拒绝原地/不存在/跨置顶；`siteReordered` 的移动到目标位 splice 语义）。
共 32 个测试文件 / 529 个用例。

其中重点守着的几条：
- `migrate.test.ts` —— v2→v3 的塌陷合并、新旧 id 交叉不互相污染、v1 链条、
  幂等、非整数版本号
- `backup.test.ts` —— v1 备份导入后旧 id 必须被接续（守着「跳级迁移」那个坑）
- `site-form.test.ts` —— 种子站点 id 必须等于 `siteIdFromUrl(url)`；
  `normalizeUrl` 接受的输入 `siteIdFromUrl` 必须也算得出身份
- `reducer.test.ts` —— 「删掉再加能接回历史」的端到端场景，含一条反面对照
- `sakura.test.ts` —— **同一种子必须生成同一棵树**（组件重渲染时树不能变形）；
  枝条方向的分散度（防退化成平行扫帚，见 MY-ISSUES #9）。
  这条的阈值是**靠注入 bug 反验过的**：把角度边界改回截断，测试必须变红
- `migrate.test.ts` 的 v4 段落 —— 守着「给数据契约加字段时，每一档老数据
  都要被补上这个字段」。特别是 v1 一路升到 v4 那条：`todos` 的兜底写在版本
  梯子**外面**，如果把兜底写进 `if (version === 3)` 分支里，v1/v2 升上来的数据
  就会缺字段，而这条测试立刻变红
- `backup.test.ts` 的待办段落 —— 「导出再导入，待办一条不少」，钉住
  `mergeData` 别忘了合并新字段（漏了是**静默丢失**，最隐蔽的一类 bug）
- `improvements.test.ts` 的偏好段落 —— `sanitizePreferences` 必须拒绝**数组**
  和带假 `toString` 的对象（MY-ISSUES #12，放进去会让整页白屏）
- `storage.test.ts` 的 `protected persistence` —— 「能就地修好的数据不许触发
  保护模式」+ 反面「真读不回来的必须报警」成对存在（MY-ISSUES #13）。
  这两条和 sakura 那条一样，**都做过「注入旧实现确认会变红」的反验**
- `date.test.ts` 的 `localTime()` —— 凡是断言「本地几号」的地方都必须用它构造
  Date，**不许直接写 `new Date(2026, 9, 2)`**：那行隐含了运行机器的时区，
  本地绿、CI 红，而且失败方向会把你误导成「被测代码写反了」（MY-ISSUES #15）。
  改动任何日期相关代码后，跑一遍 `TZ=UTC npm test`。

**测不到的地方**（见「已知缺口」）：`parseBookmarks` 依赖 `DOMParser`，node 环境没有，
只能人工验收。另外**迁移在真实 localStorage 上跑一遍**这件事没有自动化覆盖
（`storage.test.ts` 用的是 mock，不是真浏览器存储）。

写新测试时的一条硬要求：**断言必须能抓住它要防的那个 bug**。写完把实现改回旧的
错法跑一次，测试不变红就说明它什么也没守住（MY-ISSUES #9 的学习 2、
#13 的学习 2 都是这个教训）。

### 类型检查

```bash
npm run typecheck
```

### 生产构建

```bash
npm run build
npm run preview
```

`build` 会先跑 `tsc --noEmit`，类型有错会直接中断构建。

### 浏览器回归（一条命令，不装 Playwright）

**现在有一条命令了** —— 不用再手搓临时脚本：

```bash
npm run build          # ⚠️ 必须先构建：preview 跑的是 dist/，不是源码
npm run test:browser   # → 23 项场景 + 截图，落在 shots/regression/（已 gitignore）
```

脚本 `scripts/browser-check.mjs` 自己会把该起的东西都起起来
（`vite preview` + 无头浏览器 + CDP 连接），跑完自动清理临时 profile 和进程。
浏览器按 `CHROME_PATH` → Chrome → Edge → Linux/macOS 常见路径**依次找第一个存在的**；
这台机器上命中的是 Edge（同为 Chromium 内核）。

它做的是「**真的点、真的读 localStorage**」：改受控输入框走原生 setter、
多标签页并发勾选、导入备份走真实的 `<input type=file>`、
甚至把 `navigator.locks` 藏掉来复现「没有 Web Locks 的浏览器」。
所以它能抓住**单测够不着、肉眼也看不出来**的问题（22 项里的 8 项就是这一轮新加的）。

三个必须知道的坑（都是实际踩过的）：

1. **`test:browser` 验的是 `dist/`，不是源码。** 改完代码不 `npm run build`
   就跑，验的是上一版 —— 我做「注入 bug 确认会变红」的反验时，
   第一轮就因为顺序反了而**假绿**。这个坑还有一个具体形态：
   `npm test` 的 `build` 脚本是 `tsc --noEmit && vite build`，
   若所有改动都只发生在**渲染层**，`tsc` 不会因为「产物过期」报错，脚本也不会提示。
2. **一律用 `localhost` / `127.0.0.1` 要看清绑在哪。** 这台机器上 vite 的
   dev/preview 默认只绑 `[::1]`，写死 IPv4 会**连接被拒**而 `curl` 只回 `000`。
   脚本里显式传了 `--host 127.0.0.1` 就是为了躲开这条；自己手动起服务时别忘。见 MY-ISSUES #11。
3. **想改 React 受控输入框的值，必须走原生 setter + 派发 `input` 事件**：
   ```js
   const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
   setter.call(el, '文本')
   el.dispatchEvent(new Event('input', { bubbles: true }))
   ```
   直接 `el.value = '文本'` 不会触发 React 的 `onChange`，表现是「点了没反应」。

**这套东西没纳入 CI** —— 它要起服务和浏览器，和「纯函数单测」是两个层次的成本，
混进 `npm test` 会让它从 2 秒变成分钟级。见「已知缺口」里那条。

另有五个**专项**脚本，全部在 `scripts/` 下、随仓库走、零新依赖、跑完自动清理、
截图默认写临时目录。各有 npm 入口：

| 命令 | 脚本 | 覆盖 |
|---|---|---|
| `npm run test:toolbox` | `scripts/toolbox-check.mjs` | 20 项，逐个工具点一遍 + 移动端溢出检查 |
| `npm run test:appearance` | `scripts/appearance-check.mjs` | 6 项，明暗切换全链路（含刷新后持久化、版本号 = 6） |
| `npm run test:orphan` | `scripts/orphan-check.mjs` | 9 项，孤儿记录统计 / 清理 / 落盘 / 浅色可见性 / 生效边界 |
| `npm run test:acceptance` | `scripts/acceptance-check.mjs` | 8 项，原「只能手工点」的验收：删掉再加接回历史、表单三条判重、点卡片跳转、悬停高光、v1 老备份导入 |
| `npm run test:drag` | `scripts/drag-check.mjs` | 4 项，拖拽把手渲染 / 向下拖落位 / 跨置顶拒绝 |

> ⚠️ **历史坑**：这些脚本以前散落在 `shots/` 下，而 `shots/` 整个目录被 `.gitignore` 忽略 ——
> 换机器/重新 clone 后全丢。现已迁入 `scripts/`，随仓库分发。

它们是「改到哪个大块就跑哪个」，没有并进 `browser-check.mjs`：主回归脚本只跑签到主链路，
工具和外观的交互细节放专项脚本里，失败时定位更快。
