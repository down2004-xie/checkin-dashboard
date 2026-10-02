import type { Site } from '../types'

/**
 * 默认站点清单 —— **不是运行时数据源**，别在这里改站点。
 *
 * v2 起站点定义存在 localStorage 里，页面上直接增删改（点卡片上的 ✎ / ×，
 * 或用「＋ 添加站点」）。这个文件只剩一个用途：**兜底种子**。
 * 具体用在两处，都在 lib/migrate.ts 里：
 *   1. 把 v1 老数据升级到 v2 时，v1 没有 sites 字段，用它播种
 *   2. 数据损坏或为空时，让新用户第一次打开能看到几个示例站点
 *
 * 改了这里不会影响已有用户 —— 他们的站点已经落盘了，
 * 只在「清空数据」或「导入老备份」时才会再次读到。
 *
 * **加站点时必须让 id 等于 `siteIdFromUrl(url)`**（如 `https://www.jd.com` → `jd-com`），
 * 不能随手编一个。种子站点也会被 v1 迁移读到，id 形态和用户自己加的站
 * 必须一致，否则「删掉再加」接不回历史。
 * `site-form.test.ts` 里有一条测试专门钉这件事，写错了会当场失败。
 */
export const SITES: Site[] = [
  {
    id: 'bilibili-com',
    name: '哔哩哔哩',
    url: 'https://www.bilibili.com',
    category: '视频',
  },
  {
    id: 'jd-com',
    name: '京东',
    url: 'https://www.jd.com',
    category: '购物',
  },
  {
    id: 'taobao-com',
    name: '淘宝',
    url: 'https://www.taobao.com',
    category: '购物',
  },
  {
    id: 'music-163-com',
    name: '网易云音乐',
    url: 'https://music.163.com',
    category: '音乐',
  },
  {
    id: 'smzdm-com',
    name: '什么值得买',
    url: 'https://www.smzdm.com',
    category: '购物',
  },
  {
    id: 'github-com',
    name: 'GitHub',
    url: 'https://github.com',
    category: '开发',
  },
]

/**
 * v1 / v2 时代这些种子站点用的 id。
 *
 * 那时 id 由**名字**派生（`slugify(name)`，中文名退回 `site-N`），
 * v3 改成域名派生后才变成上面那些值。
 *
 * 为什么必须留着：v1 数据的 records 里存的是**旧 id**（如 `bilibili`）。
 * v1→v2 那一步如果直接播种上面这份新 id 的清单，后面的 v2→v3
 * 重写映射表里就没有 `bilibili` 这一项，那些历史记录全部映射不到、
 * 变成孤儿 —— **v1 用户升级后历史直接归零**。
 *
 * 所以 v1→v2 必须还原「v2 当时的样子」（旧 id），再由 v2→v3 统一重写。
 * 这是版本梯子的原则：每档只升一级，不能跳级产出最新形态。
 *
 * 只在 lib/migrate.ts 的 v1 分支里用。往 SITES 加新站点时这里不用加 ——
 * 新站点在 v1 时代不存在，没有旧 id 是对的。
 */
export const LEGACY_SEED_IDS: Record<string, string> = {
  'bilibili-com': 'bilibili',
  'jd-com': 'jd',
  'taobao-com': 'taobao',
  'music-163-com': 'netease-music',
  'smzdm-com': 'smzdm',
  'github-com': 'github',
}
