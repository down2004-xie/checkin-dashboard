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
| 框架 | React 18 + TypeScript | 严格模式，不用 `any` |
| 样式 | 原生 CSS + CSS 变量 | 不引入 UI 库，不引入 Tailwind |
| 路由 | 无 | 单视图，用条件渲染切换 |
| 状态 | React hooks + localStorage | 不引入 Redux/Zustand |
| 测试 | Vitest | 只测 `src/lib/` 下的纯函数 |

**不引入任何 UI 组件库。** 玻璃效果是这个项目的核心展示点，用别人的组件就失去了意义。

## 目录约定

```
src/
├─ data/        静态配置数据（站点清单），手写，不来自网络
├─ types.ts     全局类型定义（数据契约，改动牵连全局）
├─ hooks/       自定义 hooks，每个文件一个 hook
├─ lib/         纯函数，不 import React，必须可单测
├─ components/  React 组件，每个文件一个组件
└─ styles/      tokens.css（设计变量）+ global/app/features.css

fixtures/       开发期人工验收用的样本数据，不参与构建（不在 public/ 下）
```

`lib/` 现有模块的职责：

| 文件 | 职责 |
|---|---|
| `date.ts` | 日期 key 换算（本地时区） |
| `storage.ts` | localStorage 读写，唯一入口 |
| `migrate.ts` | 版本迁移 + 数据校验，**storage 和 backup 共用** |
| `reducer.ts` | 所有写操作的纯函数（新增/删除/勾选站点） |
| `backup.ts` | 备份导出、解析、合并 |
| `streak.ts` | 连续天数（全局 / 单站）、签到计数 |
| `daylight.ts` | 时段配色色板 |
| `heatmap.ts` | 热力图网格 + 强度分级 |
| `site-form.ts` | URL 校验 + **站点身份 id 生成**（`siteIdFromUrl`） |
| `bookmarks.ts` | 浏览器书签 HTML 解析 + 导入计划（去重、生成 id） |

`bookmarks.ts` 有一条特殊的**测试豁免**：`parseBookmarks` 依赖 `DOMParser`，
在 Vitest 的 node 环境里不存在（项目刻意不引入 jsdom），所以这一层没有单测，
只有 `planImport` 有。改动这个文件时必须**在浏览器里手工验一遍**，
样本文件见 `fixtures/sample-bookmarks.html`（照 Chrome 导出格式手写，
埋了根文件夹、嵌套文件夹、`javascript:` 小工具、`chrome://` 内部页、重复地址）。
这也是为什么解析层被拆成两个函数：把不可测的部分圈到最小。

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

localStorage 存一份带版本号的 JSON。**当前版本 3**：

```ts
{
  version: 3,
  sites: [                                // 站点定义，顺序即页面展示顺序
    { id: "bilibili-com", name: "哔哩哔哩", url: "https://...", category: "视频" }
  ],
  records: {
    "2026-10-02": ["jd-com", "github-com"] // 日期 -> 当天已签到的站点 id
  }
}
```

**v2 相对 v1 的变化**：新增 `sites` 字段。站点从「`data/sites.ts` 里的模块常量」
变成「用户数据」。这是「页面内增删站点」的前提——站点要能改，就不能是编译期常量。
`data/sites.ts` 因此降级为**兜底种子**，只在 v1 迁移和数据为空时被读一次。

**v3 相对 v2 的变化**：站点 `id` 从「名字派生的 slug」改成**由 URL 的域名派生**
（`siteIdFromUrl`，`https://www.jd.com` → `jd-com`），同时重写全部 `records`。
原因见下面「站点身份」一节。`data/sites.ts` 多出一张 `LEGACY_SEED_IDS` 对照表，
只在 v1 迁移里用。

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
   用户重新添加同域名站点时历史能恢复。因此**统计「今日进度」必须用
   `countCheckedValid`（只数当前存在的站点），不能用 `countChecked`**，
   否则会出现进度环超过 100%。
   注意：孤儿记录虽然永远匹配不到站点，但 `calcStreak`（全局连续天数）
   只判断「那天有没有记录」，**会把它算进去**。验「历史有没有断」必须用
   `calcSiteStreak`（单站），用 `calcStreak` 会得到假通过。

## 部署

- 产物目录 `dist/`，部署到 GitHub Pages
- `public/CNAME` 内容为二级域名（不带协议、不带路径），改动需谨慎
- `vite.config.ts` 的 `base` 必须与仓库形态匹配：
  - 用户站（仓库名 `xxx.github.io`）→ `base: '/'`
  - 项目站（仓库名 `checkin-dashboard`）→ `base: '/checkin-dashboard/'`
- **base 配错的表现是页面白屏 + 控制台一堆资源 404**

## 已知技术红线

1. **backdrop-filter 数量**：每张卡片都挂 `blur()` 在中低端手机上会掉帧。
   移动端必须降级（见 `styles/app.css` 底部的 `@media (max-width: 640px)`）。
2. **backdrop root 陷阱**：祖先元素带 `filter` / `opacity<1` / `mask` / `clip-path` /
   `mix-blend-mode` / `will-change` / 自身 `backdrop-filter` 时，
   玻璃只会「看到」该祖先之后的内容 → 表现为模糊失效。改动画时先查这条。
3. **不能做定时推送**：纯静态站无法在页面关闭时主动通知。不要为此加后端。

## 协作方式

- 先解释原理再给代码，一次只动一个功能
- 说「完成」前必须跑起来验证，附实际输出
- 每完成一个阶段更新 `PROGRESS.md`，踩坑记进 `MY-ISSUES.md`
