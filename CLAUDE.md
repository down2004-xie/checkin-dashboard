# checkin-dashboard — 项目规范

## 项目是什么

一个纯静态的个人「每日签到聚合站」。把每天需要签到的网站收拢成一个卡片网格，
点卡片跳转过去手动签到，回来打勾，页面显示今日进度和连续签到天数。

- 无后端、无数据库、无账号系统
- 数据只存在浏览器本地（localStorage），不跨设备同步
- 部署在 GitHub Pages，绑定一个二级域名

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 5+ | 产物是纯静态文件 |
| 框架 | React 19 + TypeScript | 严格模式，不用 `any` |
| 样式 | 原生 CSS + CSS 变量 | 不引入 UI 库，不引入 Tailwind |
| 路由 | 无 | 单视图，用条件渲染切换 |
| 状态 | React hooks + localStorage | 不引入 Redux/Zustand |
| 测试 | Vitest | `src/lib/` 纯函数 + 根目录既有 App 渲染冒烟；`vitest.config.ts` 显式限定范围，不扫描 `.claude/worktrees/` 副本 |

**不引入任何 UI 组件库。** 玻璃效果是这个项目的核心展示点，用别人的组件就失去了意义。

**功能库的准入规则（2026-11-01 放开）。** 手写成本不现实的格式处理允许引入功能库，
但必须同时满足：只由准入的工具 import（随工具的 lazy chunk 按需下载，主视图不预载）、
许可证是 MIT / Apache-2.0、能说清「为什么不手写」。目前准入的四个：

| 库 | 用在 | 为什么不手写 |
|---|---|---|
| `pdfjs-dist` | PDF 转图片、PDF 提取文字 | 渲染 PDF 要解析字体、压缩流、绘图指令，手写不现实 |
| `pdf-lib` | PDF 合并 / 拆分 | 要读写已有 PDF 的对象结构（图片转 PDF 只需「写」，所以那个仍手写） |
| `qrcode` | 二维码生成 | Reed-Solomon 纠错 + 8 种掩码评分，代码量大且易错 |
| `jsqr` | 二维码识别兜底 | 浏览器自带 `BarcodeDetector` 覆盖不全（Firefox / 部分桌面端没有） |

`pdfjs-dist` 的两条注意：worker 和中文字体映射（cMaps）都**本地托管**，不走 CDN
（工具箱承诺「文件不上传、全部本地处理」）；`isEvalSupported: false`，
并跟进安全更新（CVE-2024-4367：4.2.67 之前打开恶意 PDF 可执行任意脚本）。
PDF.js 的 cMaps、标准字体、WASM 由 `vite.config.ts` 在开发时提供本地路径、构建时输出到
`pdfjs/`；组件用相对当前页面的 URL 按需请求。资源只是静态附件，不进入主 JS，不在启动时预下载。
`pdf-lib` 自 2023 年起基本停更，出问题等不到上游修复，只用它做合并/拆分这类简单操作。

## 目录约定

```
src/
├─ data/        静态配置数据（站点清单 + 工具箱目录），手写，不来自网络
├─ types.ts     全局类型定义（数据契约，改动牵连全局）
├─ hooks/       自定义 hooks，每个文件一个 hook
├─ lib/         纯函数，不 import React，必须可单测
├─ components/  React 组件，每个文件一个组件；toolbox/ 是工具箱视图及其工具；DiaryView.tsx 是日记视图
└─ styles/      tokens.css（设计变量）+ global/app/features/sakura/dashboard/toolbox/diary.css

fixtures/       开发期人工验收用的样本数据，不参与构建（不在 public/ 下）
```

`lib/` 现有模块的职责：

| 文件 | 职责 |
|---|---|
| `date.ts` | 日期 key 换算（本地时区） |
| `storage.ts` | localStorage 读写，唯一入口 |
| `migrate.ts` | 版本迁移 + 数据校验，**storage 和 backup 共用**。`droppedEntries` 只数「真的读不回来」的条目，用来触发保护模式 |
| `reducer.ts` | 所有写操作的纯函数（新增/删除/勾选站点、移动顺序、待办）。勾选只有 `checkedSet`（显式目标状态 + 拒绝暂停站点） |
| `backup.ts` | 备份导出、解析、合并 |
| `streak.ts` | 连续天数（全局 / 单站）、签到计数 |
| `orphans.ts` | 孤儿记录（指向已删站点的 `records` 条目）的统计与清理。删除不自动发生，必须用户显式触发；只动 `records`，不碰 `targets` 快照 |
| `daylight.ts` | 时段色板（深色 `PALETTES` + 亮色 `LIGHT_PALETTES`）+ `resolvePalette(theme, appearance)`：明暗与色相两个正交维度 |
| `heatmap.ts` | 热力图网格 + 强度分级 + `groupByWeek` / `monthLabel` |
| `sites.ts` | 站点筛选/排序（搜索、分类、状态、置顶优先）+ `moveNeighbor`（**按可见列表**算换位邻居）+ `canReorder`（拖拽落点是否合法）+ `pendingSites`（「一键打开未签到」的目标：未签且未暂停的**全部**站点，不吃筛选）+ `nextBatch`（分批打开：跳过本次已打开的，每次最多 N 个） |
| `todo.ts` | 待办创建（`createTodo`，随机 UUID） |
| `diary.ts` | 电子日记：创建（`createDiaryEntry`，随机 UUID + 创建时间，`now` 可注入）、同天按时间排序、全量关键字搜索（标题 + 正文，日期从新到旧）、有日记的日期列表、时间格式化（本地 `HH:mm`）、正文单行预览（按码点截断） |
| `tween.ts` | 缓动函数（`easeOutCubic`） |
| `site-form.ts` | URL 校验 + **站点身份 id 生成**（`siteIdFromUrl`） |
| `bookmarks.ts` | 浏览器书签 HTML 解析 + 导入计划（去重、生成 id） |
| `sakura.ts` | 樱花树递归生成（固定种子伪随机）+ 花瓣粒子参数 |
| `unit-convert.ts` | 单位换算（长度/重量/面积/温度）。各量纲定基准单位、值先转基准再转出；温度单独走偏移公式 |
| `countdown.ts` | 倒计时 / 纪念日的自然日差。用 UTC 天序号相减，规避夏令时导致的偏一天 |
| `random-pick.ts` | 掷骰子 / 抛硬币 / 抽签 / 洗牌分组 / 名单解析。随机源 `random()` 可注入，便于单测确定性 |
| `answer-book.ts` | 答案之书：长按进度和随机答案选择；避免与上一条重复，随机源可注入 |
| `rmb.ts` | 人民币金额校验、四舍五入到分、中文大写与连续零规则 |
| `loan.ts` | 等额本息 / 等额本金逐月还款表与对比；金额全程用整数分、末期吸收尾差 |
| `color.ts` | HEX / RGB / HSL 解析互转、透明色合成、WCAG 对比度与可读性结论 |
| `image-slice.ts` | 切图矩形（边界取整不丢像素不重叠）、居中正方形裁剪、等比预览尺寸、切片和 ZIP 文件名。不碰 Canvas |
| `image-compress.ts` | 等比缩放尺寸（不放大）+ 字节格式化 + 压缩率。不碰 Canvas |
| `image-convert.ts` | 格式表（PNG/JPEG/WebP 的能力标记）+ 扩展名替换。不碰 Canvas |
| `image-transform.ts` | 裁剪/旋转/翻转几何：角度归一、旋转后尺寸、矩形 clamp、百分比↔像素、拖拽点→矩形。不碰 Canvas |
| `image-mosaic.ts` | 马赛克块尺寸（按长边比例）+ 网格切分 + 贴边格尺寸。不碰 Canvas |
| `id-photo.ts` | 证件照：尺寸表 + 颜色距离 + 背景判定/替换 + 估背景色（中位数）+ 居中裁剪。不碰 Canvas |
| `image-stitch.ts` | 长图拼接：统一一边（纵向统一宽/横向统一高）+ 各图等比缩放的位置尺寸布局。不碰 Canvas |
| `images-to-pdf.ts` | 手写最小 PDF 1.4（多图各一页，DCTDecode 直嵌 JPEG），xref 偏移用真实字节数算。不碰 Canvas |
| `exif.ts` | JPEG 段 / TIFF IFD / EXIF / GPS 解析，元数据无损剥离与展示格式化；不解码图像像素 |
| `file-accept.ts` | `accept` 规则匹配、多文件筛选和 HEIC 等浏览器不支持格式的人话提示 |
| `canvas-limits.ts` | Canvas 边长 / 面积上限、真机探测与等比缩小计划，避免超限画布静默导出空图 |
| `zip.ts` | 手写 ZIP store 模式 + CRC32；用于多文件一次下载和最小 DOCX 打包 |
| `barcode.ts` | Code 128（Code Set B/C）编码：107 项标准模式表 + 校验和 + 模块序列。纯算法 |
| `qr-code.ts` | 二维码纠错说明、颜色对比风险、识别图缩放、错误文案与仅放行 HTTP(S) 的安全链接判定；编解码交给准入库 |
| `page-range.ts` | PDF 合并 / 拆分：保序页码范围、拆分页文件名、加载错误文案和列表相邻换位 |
| `pdf-pages.ts` | PDF 转图片 / 提取文字共用的升序页码范围、页码压缩展示、DPI 比例与导出文件名 |
| `pdf-text-layout.ts` | 按 PDF 文字坐标聚行、处理中英文空格和启发式分段；不伪造表格 / 多栏等版面结构 |
| `docx.ts` | PDF 提取文字的最小 DOCX 导出：段落转 OOXML、XML 转义、复用 `zip.ts` 打包；不保留 PDF 排版，不做 OCR |
| `text-stats.ts` | 文本统计（字符/汉字/英文词/数字串/行/段/阅读时长）。中英混排逐字符状态机分词 |
| `diff.ts` | Myers 行级最短编辑脚本 + 有预算的行内字素差异；大文本 / 长行设上限防止卡主线程 |
| `encoding.ts` | UTF-8、Base64（含 URL-safe）、URL、Unicode 转义和十六进制的严格编解码 |
| `classic-cipher.ts` | 凯撒移位和国际摩斯电码编解码；明确不把中文当作国际摩斯字符 |
| `md5.ts` | 可分块增量计算的手写 MD5，供浏览器原生 WebCrypto 不支持的 MD5 使用 |
| `hash.ts` | MD5 / SHA-1 / SHA-256 / SHA-512 计算、进度和期望值比对；文件上限防整块读盘崩溃 |
| `text-crypto.ts` | PBKDF2-SHA256 派生密钥 + AES-256-GCM 文本加解密，自定义带版本 / 盐 / IV 的 Base64 格式 |
| `password.ts` | `crypto.getRandomValues` + 拒绝采样生成密码，保证每类字符出现，计算熵和强度 |
| `share-sites.ts` | 网页分享精选清单的分组（按分类、首次出现顺序）+ 模糊过滤。纯函数 |
| `watermark.ts` | 水印坐标计算：九宫格锚点 + 平铺点位 + 颜色转 rgba + 对比阴影色。只算几何/颜色，不碰 Canvas |

**测试文件样本的编码必须和格式声明一致。** EXIF 中中文字段若模拟 UTF-8，要用 `TextEncoder` 写真实 UTF-8 字节，不可把 `charCodeAt` 塞入 `Uint8Array` 后期待中文还在。

**保护模式的判据只有一条**：`droppedEntries > 0`（真的读不回来），
**去重不算**。这个数字唯一的用途就是决定要不要只读停写，而保护模式的代价
（整个管理区被禁用、一律拒绝写入）很重，判据一宽用户就会被锁死在一份
其实没坏的数据上。见 MY-ISSUES #13 —— 加严任何 `sanitize*` 之前都要先想这条。

**「顺序」相关的操作要按用户看得见的列表算。** 页面可以带着筛选显示一部分站点，
而 `sites` 在存储里是全集。移动站点时如果拿存储索引 ±1 当邻居，用户换掉的可能
是屏幕外那张卡 —— 可见列表一动不动，存储顺序却被改了。所以
`moveNeighbor`（`lib/sites.ts`）按**可见列表**算邻居，`reducer` 只执行交换。
同理，置顶与普通站之间不许互换：置顶的显示位置由置顶决定，换了屏幕上也不会动。

**拖拽排序**（手动顺序下的把手）走另一条路：落点可以是任意一张可见卡，语义是「移动到目标位」
而不是「和邻居交换」。合法性统一由 `canReorder` 判定（原地 / 不存在 / 跨置顶三组拒绝），
reducer 的 `siteReordered` 用 splice 把被拖项插到目标位（`from < to` 时插入点要减 1）。
组件侧算落点高亮也调同一个 `canReorder`，**校验只写一份**。
`SiteGrid` 用 window 上的 pointermove/pointerup 驱动（把手 pointerdown 时 `setPointerCapture`，
事件仍冒泡到 window），`elementFromPoint` 命中 `[data-site-id]` 算落点；
落点另存一份 ref 供 pointerup 读，避免闭包拿到上一帧的 state。
**验收必须用 CDP 真鼠标事件** —— 合成 `PointerEvent` 不触发 pointer capture，
`npm run test:drag` 就是为此写的。

`sakura.ts` 的核心约束是**确定性**：同一种子必须生成同一棵树。
组件会因为勾选签到而重渲染，用 `Math.random()` 的话树会在用户眼皮底下换形状。
所以这里用固定种子的 mulberry32，不返回 `Math.random()`。
改这个文件时注意一条踩过的坑：**递归里的角度边界只能用反射，不能用截断**
（截断会让边界变成吸引子，整棵树退化成一把平行的扫帚，见 MY-ISSUES #9）。
`sakura.test.ts` 里有一条专门守方向分散度的测试，阈值是靠注入 bug 反验过的。

`bookmarks.ts` 有一条特殊的**测试豁免**：`parseBookmarks` 依赖 `DOMParser`，
在 Vitest 的 node 环境里不存在（项目刻意不引入 jsdom），所以这一层没有单测，
只有 `planImport` 有。改动这个文件时必须**在浏览器里手工验一遍**，
样本文件见 `fixtures/sample-bookmarks.html`（照 Chrome 导出格式手写，
埋了根文件夹、嵌套文件夹、`javascript:` 小工具、`chrome://` 内部页、重复地址）。
这也是为什么解析层被拆成两个函数：把不可测的部分圈到最小。

**工具箱是「第二个视图」，不是第二个项目。** 顶层用 `view` state 在「签到 / 日记 / 工具箱」
三个视图之间条件渲染（项目刻意无路由）。

**切视图只能走 `App.tsx` 的 `navigate()`，不要在别处直接调 `setView`。** 顶部按钮由文件顶部的
`VIEWS` 清单生成，加新页面只需：`VIEWS` 加一行 + 加一处 `view === 'xxx' && <Xxx />`。
因为所有切换都过 `navigate()`，新页面自动带上「离开前确认未保存内容」（机制见下面日记一节第 5 条）。
新页面里如果有草稿，也调 `useLeaveGuard` 登记，不用改 `App`。

工具目录是 `data/tools.ts` 里的静态数组，
**不进 localStorage、不升数据版本**——工具是编译期确定的目录，不是用户数据。
加一个工具只需：`data/tools.ts` 加一行 + 写组件 + 在 `ToolboxView` 里加一条 `React.lazy` 绑定
并在 `<Suspense>` 内挂上（工具按需加载，每个工具一个独立 chunk，主视图不预载工具箱 JS）。
`status` 四态：`ready`（可用，进面板）/ `soon`（开发中，点了给提示）/ `unavailable`（当前架构无法实现，点了说明原因）/ `link`（外链）。
新工具若含纯逻辑，逻辑一律进 `lib/`（如 `unit-convert.ts` / `countdown.ts`）并单测；
组件只做渲染。**临时分享箱这类要后端的工具标 `unavailable`**，不能暗示会在纯静态架构下实现。

工具箱的几条通用约定（2026-11-01 工具箱大修时定下）：

- **工具名和描述只写真实存在的功能。** 审核时查出过五处名不副实（不存在的「转盘」、
  不存在的「本机存储」、条形码挂着二维码的 id）。描述就是对用户的承诺。
- **选文件统一用 `components/toolbox/FilePicker.tsx`**：点击选择 + 拖放 + Ctrl+V 粘贴三合一，
  类型过滤走 `lib/file-accept.ts`。不要在工具里各自写 `<input type="file">`。
- **多文件下载统一打 ZIP**（`lib/zip.ts`，手写 store 模式 + CRC32）。连续 `a.click()` 会被浏览器拦截。
- **建 canvas 之前先过 `lib/canvas-limits.ts`。** 超过浏览器上限时 canvas 不报错，
  只会静默画成空图（长图拼接踩过）。超限要么等比缩小，要么明确告诉用户「图太大」，不能说「请重试」。
- **大图预览用缩小版，全分辨率只在导出时画一次。** 每次调参都在主线程编码全尺寸 PNG 会卡死。
- **导出时核对 `blob.type`。** Safari 不支持编码 WebP，`toBlob` 会静默退回 PNG，
  文件名必须跟实际格式走。
- **每个新工具的专属样式放 `styles/tools/<tool-id>.css`，由工具组件自己 import**，
  随工具 chunk 按需加载。`toolbox.css` 只放工具箱外壳和多个工具共用的类。
- **工具绑定在 `ToolboxView` 的映射表里**，每个 `ready` 工具都必须有一条；
  `test:toolbox` 会逐个点开所有 `ready` 工具，断言面板真的渲染出来。

**电子日记是「第三个视图」，和工具箱的性质正好相反：它是用户数据。** 工具是编译期目录、
不进 localStorage；日记是用户写下的字，进 `CheckInData.diary`、进备份、升了数据版本（v7）。
用途不限：实习日志、会议记录、普通日记都记在这里。

- **按天归属、一天多条。** 和待办同构（`Record<DateKey, DiaryEntry[]>`），迁移、清洗、
  备份合并都照抄待办那一套。一天多条是因为上午的会议和晚上的随笔混在一篇里会互相干扰。
- **标题可选、正文必填。** 只有标题没有正文的条目没有内容；标题对会议有用、对随笔多余。
  空标题统一不存这个字段（不存空串），否则「刚写完」和「刷新后」同一条日记长得不一样。
- **纯文本，不存图片。** localStorage 每源约 5 MB，图片转 base64 几张就把配额写满，
  之后所有写操作（包括签到）都会保存失败。纯文本 5 MB 够写几百万字。
- **不参与进度环，也不触发樱花满开。** 和待办同一条理由：它是「今天记下的东西」，
  不是「今天要完成的任务」，混进进度环会让「100%」的含义变模糊。
- **所有写操作走 reducer 的四个 action**：`diaryAdded` / `diaryUpdated` / `diaryRemoved` /
  `diaryRestored`（撤销删除）。组件不自己拼数据。

**长文本写盘规则（改日记组件前必读）。** 不能在 textarea 的 `onChange` 里直接 dispatch：
`commitAction` 每次都把**整份** `CheckInData`（站点、全部签到记录、待办、日记）
`JSON.stringify` 后写进 localStorage，每敲一个字写一次，打字会卡，日记越多越卡。所以：

1. 草稿只存在组件本地 state，停止输入约 600 ms 或失焦时才提交**一次** `diaryUpdated`。
2. 保存失败**不清草稿**，界面显示「未保存」。日记丢了是心血，签到勾丢了只是少个勾。
3. 草稿只在**开始编辑时**从数据初始化一次，之后不再跟着数据同步。原因：
   `useCheckInStore` 在窗口 `focus` / `storage` 事件时会重新读盘刷新快照，
   如果草稿跟着快照走，用户切个窗口回来，没保存的字就被旧数据覆盖了。
4. **关页提醒只在「真的会丢东西」时出现**（`hooks/useLeaveGuard.ts` + `lib/diary.ts` 的 `hasUnsavedDraft`）。
   判据：正文有字，且和已保存版本不同。也就是新建框写了字没点保存、编辑后自动保存还没完成、保存失败这三种情况。
   正常关页（没写东西、自动保存已完成、只填了标题）**不弹**。
   `beforeunload` 监听**按需挂、用完就摘**，不要改成「一直挂着、在回调里判断」：一直挂着会让浏览器
   不把页面放进往返缓存（bfcache），而且判据一宽，每次关页都要多点一下，用户很快就学会无视它。
   提示文字由浏览器决定，页面改不了。`test:diary` 两头都守着：该弹时弹，每一次正常 reload 都断言不弹。
5. **切视图确认靠组件自己登记，不靠 App 判断页面名。** `useLeaveGuard({ pageClose, viewSwitch })`
   的 `viewSwitch` 为真时，组件进入一份「未保存名单」。`App` 的 `navigate()` 只问名单里有没有人，
   有就弹 `window.confirm`。它不管从哪页去哪页，所以以后加的页面自动受保护。
   - 新建框：`viewSwitch` 跟 `pageClose` 一样。组件卸载时本地 state 就没了，切走就全丢。
   - 编辑已有条目：正常情况下 `viewSwitch` 为假，卸载时会补交保存，页面还活着、能跑完，不打扰用户。
     只有「上次成功保存后失败过」才为真。看的是单独记的 `failedSinceSave`，不是 `state === 'failed'`：
     失败后用户接着打字，`state` 会变回 `'idle'`，只看它就会漏拦。

**保护模式下日记只读**：能看、能搜，不能写。和签到页的管理区同一条规则 ——
保护模式意味着存储里有读不回来的数据，此时任何写入都可能覆盖掉用户还没救出来的原始内容。

**分层铁律**：`lib/` 里的代码不允许 import React。一旦某个逻辑能在 lib 里写，
就不要放进 hooks 或 components——因为纯函数好测试、好理解、面试好讲。
状态变更同理：**所有写操作都写进 `lib/reducer.ts`**，hooks 只负责 dispatch 和落盘。

## 编码约定

- 组件用函数式 + 具名导出（`export function GlassCard()`），不用 `export default`
- 类型用 `interface`，联合类型用 `type`
- 时间统一用 `YYYY-MM-DD` 字符串作为「一天」的 key（本地时区），不用 Date 对象做 key
- 所有 localStorage 读写必须经过 `lib/storage.ts`，组件里不许直接碰 `localStorage`
- CSS 类名用 kebab-case，不用 CSS Modules

## 数据约定

localStorage 存一份带版本号的 JSON。**当前版本 7**：

```ts
{
  version: 7,
  sites: [                                // 站点定义，顺序即页面展示顺序
    { id: "bilibili-com", name: "哔哩哔哩", url: "https://...", category: "视频",
      paused: false, pinned: false }
  ],
  records: {
    "2026-10-02": ["jd-com", "github-com"] // 日期 -> 当天已签到的站点 id
  },
  todos: {                                // 日期 -> 当天待办（v4 新增）
    "2026-10-02": [{ id: "<uuid>", text: "买牛奶", done: false }]
  },
  targets: {                              // 日期 -> 当天的目标快照（v5 新增，见下）
    "2026-10-02": [{ id: "jd-com", name: "京东", url: "https://..." }]
  },
  diary: {                                // 日期 -> 当天日记，一天可多条（v7 新增，见下）
    "2026-10-02": [{ id: "<uuid>", title: "周会纪要", text: "……",
                     createdAt: "2026-10-02T02:30:00.000Z" }] // title / createdAt 可缺省
  },
  preferences: { theme: "auto", effects: "full", compact: false, appearance: "dark" } // v5 新增，v6 加 appearance
}
```

**v2 相对 v1 的变化**：新增 `sites` 字段。站点从「`data/sites.ts` 里的模块常量」
变成「用户数据」。这是「页面内增删站点」的前提——站点要能改，就不能是编译期常量。
`data/sites.ts` 因此降级为**兜底种子**，只在 v1 迁移和数据为空时被读一次。

**v3 相对 v2 的变化**：站点 `id` 从「名字派生的 slug」改成**由 URL 的域名派生**
（`siteIdFromUrl`，`https://www.jd.com` → `jd-com`），同时重写全部 `records`。
原因见下面「站点身份」一节。`data/sites.ts` 多出一张 `LEGACY_SEED_IDS` 对照表，
只在 v1 迁移里用。

**v4 相对 v3 的变化**：新增 `todos`（按天归属的每日待办）。纯加字段。

**v5 相对 v4 的变化**：新增 `targets` 和 `preferences`。

- `targets` 是**当天目标快照**：`snapshotDay` 在每天首次写入时把「当时还启用着的
  站点」拷一份存下来。有了它，历史格子的完成率才不会被「今天加/删站点」改写 ——
  以前热力图强度按「当前站点总数」算，加一个站会让所有历史格子一起变浅。
- 历史记录没有快照（`targets[day] === undefined`）时，`summarizeDay` 返回
  `total: null`，界面上显示「目标未知」而**不推测**完成率。迁移刻意不伪造
  历史快照 —— 那是编数据。
- `preferences` 是主题/特效/紧凑/明暗四项用户偏好。它属于**用户数据和设备**两个判断的夹缝：
  目前按「数据」处理（进备份、合并时保留本机值），换设备想跟着走就带着它。

**v6 相对 v5 的变化**：`preferences` 新增 `appearance: 'dark' | 'light'`（明暗外观）。

- 纯加字段，老数据没有它 → `sanitizePreferences` 的 `pickOption` 退回 `'dark'`，
  升级后外观不变，不会突然把用户从深色切到亮色。
- **为什么升版本而不是"藏"在 CSS 里**：外观是用户偏好，必须进 localStorage 才能持久化，
  而持久化的偏好属于数据契约，改契约就必须升版本 —— 这是项目铁律，不能因为「看起来只是个 CSS 开关」就绕过。
- `appearance` 与 `theme` **正交**：`theme` 决定色相（清晨紫/晴日蓝…），`appearance` 决定明暗。
  两者的组合在 `lib/daylight.ts` 的 `resolvePalette(theme, appearance)` 里落成一个具体色板。
  `useDaylight` 同时做两件事：给 `<html>` 写 `data-appearance`（切 CSS 变量组）、用 `resolvePalette` 选色板。
  **两者必须同时生效** —— 只换变量不换色板（或反之）会得到「浅底白字」的崩坏画面。

**v7 相对 v6 的变化**：新增 `diary`（按天归属的电子日记，一天可多条）。

- **纯加字段，不占版本梯子的档位。** 和 v4 的 `todos` 一样，不写 `if (version === 6)` 分支，
  而是在 `migrate()` 末尾统一 `sanitizeDiary(candidate.diary)` 兜底 —— 这一步对 v1~v6 所有
  老数据都成立（没有 `diary` 就归一化成 `{}`），写成分支反而让人误以为只有 v6 需要。
  梯子（v1→v2→v3）只留给真正要重写历史的档位。
- **正文比元数据值钱。** `id` / `text` 缺失或为空 → 整条丢弃（没有身份或没有内容，这条没法用）；
  `title` / `createdAt` 缺失或类型不对 → 只是不写这个字段，**不丢整条**。
  `droppedEntries` 用同一把尺子：只把「id、text 读不回来」的条目算作丢弃，
  缺标题、缺时间都不算，否则一份只是缺元数据的老数据会把用户锁进保护模式（见 MY-ISSUES #13）。
- **`createdAt` 只用于同一天内排序，不是身份。** 迁移刻意不给老条目补时间戳 ——
  那是编数据（和「不伪造历史 targets 快照」同一条原则）。缺时间的条目排在当天最前。
- **`mergeData` 已同步合并 `diary`**：按天 + 按 id 取并集，同 id 保留本机版本。
  `dataProblem` 对 `version >= 7` 的数据要求 `diary` 是对象。

### 偏好校验的一条硬规则

`sanitizePreferences` 里的枚举校验**必须先 `typeof x === 'string'` 再 `includes`**，
不能用 `includes(String(x))`。原因：`String(['auto']) === 'auto'`，
数组会通过判断，而 `as` 断言只让编译器闭嘴、运行时不转换，
于是 `theme` 变成 `['auto']`，下游 `PALETTES[theme]` 取到 `undefined`、
`palette.bg1` 抛异常 → **整页白屏且用户无法在界面里修**（MY-ISSUES #12）。
凡是用 `as` 的校验，都要问一句「判断用的值和返回的值是同一个吗」。

### 站点身份（这是全项目最要命的一条约定）

**`site.id` 是历史记录的锚，必须由域名派生，一旦确定就不再改。**

为什么不能用名字：名字是标签，用户随时会改；而且中文名转不出 slug，
v2 只能退回 `site-N`，而 N 取决于「当时哪些号没人占」——同一个站删掉再加
会拿到不同 id，历史静默断掉（连续天数归零，且全局连续天数看起来还正常）。
改用域名后，同一个站必然算出同一个 id，于是「删掉再加」能自动接回历史，
「id 撞车」也恰好等价于「域名重复」，不需要额外判重。

代价（刻意接受）：**同一个域名只能有一张卡片**，没法把 `bilibili.com` 和
`bilibili.com/anime` 当两个独立签到项。对「每日签到看板」来说一个站就是一张卡。

推论：`SiteForm`（手动添加/编辑）和 `planImport`（书签导入）和迁移
**三处都必须调 `siteIdFromUrl`**，不许各自造 id，否则身份会漂移。

**为什么带 version**：以后加字段（备注、标签）时能写迁移逻辑，
否则只能让用户清库重来。

**改结构时的铁律**：
1. 升 `DATA_VERSION`，并在 `lib/migrate.ts` 里加一个迁移分支。
2. **迁移逻辑只允许有一份**。本机读取（`storage.ts`）和备份导入（`backup.ts`）
   必须调用同一个 `migrate()`——两处各写一份必然漂移，会出现
   「本机老数据能自动升级，但导入老备份却报错」这种极难定位的割裂 bug。
3. **每档只升一级，不能跳级产出最新形态**。梯子写成顺序链（v1→v2→v3），
   每一档负责还原「那一版当时的样子」。跳级的后果很具体：v1→v2 若直接播种
   **当前**的 `SITES`（id 已是域名形态），后面 v2→v3 的重写映射表就认不出
   v1 记录里的旧 id，全部变成孤儿 —— **v1 用户升级后历史归零，且不报任何错**。
   所以 `LEGACY_SEED_IDS` 那张表必须留着。`backup.test.ts` 有一条测试守着这条链。
4. `records` 里可以存在指向已删站点的「孤儿记录」，这是**刻意保留**的：
   用户重新添加同域名站点时历史能恢复。**清理必须由用户显式点击**
   （页面底部的「清理孤儿记录」，没有孤儿时整块不渲染），绝不自动执行 ——
   清理掉的历史无法恢复。清理只动 `records`，不碰 `targets` 快照。
   因此**统计「今日进度」必须用 `countCheckedValid`（只数当前存在的站点），
   不能用 `countChecked`**，否则会出现进度环超过 100%。
   注意：孤儿记录虽然永远匹配不到站点，但 `calcStreak`（全局连续天数）
   只判断「那天有没有记录」，**会把它算进去**。验「历史有没有断」必须用
   `calcSiteStreak`（单站），用 `calcStreak` 会得到假通过。
5. **`mergeData` 每加一个新字段都要同步合并**。合并只写 `records`/`sites` 时，
   用户在新设备上导入备份，页面一切正常但待办（或目标快照、日记）全部消失，
   **且不报错**。`preferences` 刻意保留本机值；`targets` 按天取「本机的优先」；
   `todos` 和 `diary` 都是按天 + 按 id 取并集，同 id 保留本机版本。
6. **判定「要不要进保护模式」只能用 `droppedEntries`**，不能用「清洗前后长度差」。
   去重（`['a','a']`、同 id 站点）属于「内容还在」，把它算成丢弃会让用户一打开
   页面就被锁成只读，而数据其实没坏。这条踩过，见 MY-ISSUES #13；
   加严 `sanitize*` 之前先想一遍它会不会误触发保护模式。

## 部署

- 产物目录 `dist/`，部署到 GitHub Pages
- `public/CNAME` 内容为二级域名（不带协议、不带路径），改动需谨慎
- `vite.config.ts` 的 `base` 必须与仓库形态匹配：
  - 用户站（仓库名 `xxx.github.io`）→ `base: '/'`
  - 项目站（仓库名 `checkin-dashboard`）→ `base: '/checkin-dashboard/'`
- **base 配错的表现是页面一直停在启动画面（樱花一直轮流亮、不消失）+ 控制台一堆资源 404**。
  加启动画面之前的表现是白屏；启动画面是内联在 `index.html` 里的，JS 加载失败它也照样显示

## 已知技术红线

1. **backdrop-filter 数量**：每张卡片都挂 `blur()` 在中低端手机上会掉帧。
   移动端必须降级（见 `styles/app.css` 底部的 `@media (max-width: 640px)`）。
2. **backdrop root 陷阱**：祖先元素带 `filter` / `opacity<1` / `mask` / `clip-path` /
   `mix-blend-mode` / `will-change` / 自身 `backdrop-filter` 时，
   玻璃只会「看到」该祖先之后的内容 → 表现为模糊失效。改动画时先查这条。
3. **不能做定时推送**：纯静态站无法在页面关闭时主动通知。不要为此加后端。
4. **装饰层的分层规则（会动的一律放前面）**：樱花树是**静止/慢摆**的，放背景层
   （`z-index: -1`，卡片背后），让玻璃把它糊成柔光；花瓣是**持续动**的，放前景层
   （`z-index: 1`，内容之上），走纯合成层。
   反过来放的话，花瓣每帧都在逼浏览器重新模糊每张卡片背后的像素 —— 必掉帧。
   **判断标准：新加一个装饰元素前，先问它动不动。**
5. **`position: fixed` 的装饰层写在 `.app` 里**（`SakuraTree` / `PetalLayer`）。
   它们以视口定位，不受 `.app` 的 `max-width` / `padding` 影响。
   但这意味着 `.app` 一旦被加上 `transform` / `filter` / `will-change`，
   包含块会从视口变成 `.app` —— 和红线 2 是同一个根因，同时会废掉卡片的玻璃。
6. **启动画面写在 `index.html` 的 `#root` 里，不是 React 组件。** 它要在主 JS 下载完之前显示，
   所以不能依赖任何打包产物：样式内联、颜色**手抄** `tokens.css` 的默认值（`--bg-1/2/3`、`--sakura-bloom/petal/core`）。
   改了那几个默认值要同步改 `index.html`，否则挂载那一刻会跳色。
   图形是内联 SVG 樱花（一片花瓣 `<use>` 旋转复用 5 次），**不用 GIF 等图片文件**：
   启动画面只在网慢时可见，再加一个要下载的文件会和主 JS 抢带宽，还没下完页面就挂载了。
   React 首次 `render()` 会清空 `#root` 原有内容，所以**不写「关闭启动画面」的代码**。
   樱花延迟约 300 ms 才淡入（快的时候根本看不到，避免一闪），花瓣依次亮起；
   `prefers-reduced-motion` 下花瓣不轮流亮，显示一朵静止的花。
   `npm run test:boot` 守着这几条。

## 协作方式

- 先解释原理再给代码，一次只动一个功能
- 说「完成」前必须跑起来验证，附实际输出
- 每完成一个阶段更新 `PROGRESS.md`，踩坑记进 `MY-ISSUES.md`
