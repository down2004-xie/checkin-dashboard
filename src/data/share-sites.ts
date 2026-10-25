/* 「网页分享」工具的静态精选清单 —— 手写，不来自网络（和 data/tools.ts、data/sites.ts 的定位一致）。
 *
 * 为什么单独一份数据：这批「有意思的网站」是站长精选的目录，属于编译期常量，
 * 不是用户数据。所以不进 localStorage、不升数据版本，改清单只改这个文件。
 *
 * category 是单值：一个站只归一类，便于 chips 筛选（分组逻辑见 lib/share-sites.ts）。
 * url 一律用 https:// 开头的真实地址，点卡片直接新标签打开。
 */

export interface ShareSite {
  id: string
  name: string
  url: string
  description: string
  category: string
}

export const SHARE_SITES: ShareSite[] = [
  {
    id: 'product-hunt',
    name: 'Product Hunt',
    url: 'https://www.producthunt.com',
    description: '每天发现全球新上线的产品和小工具，逛一圈就有新点子',
    category: '灵感',
  },
  {
    id: 'are-na',
    name: 'Are.na',
    url: 'https://www.are.na',
    description: '安静地收藏与整理灵感素材，像给自己搭一座视觉图书馆',
    category: '灵感',
  },
  {
    id: 'unsplash',
    name: 'Unsplash',
    url: 'https://unsplash.com',
    description: '海量免费高清图片，做封面、配图不用愁版权',
    category: '设计',
  },
  {
    id: 'coolors',
    name: 'Coolors',
    url: 'https://coolors.co',
    description: '一键生成配色方案，按空格换一套，挑到满意为止',
    category: '设计',
  },
  {
    id: 'excalidraw',
    name: 'Excalidraw',
    url: 'https://excalidraw.com',
    description: '手绘风在线白板，画流程图、架构图又快又好看',
    category: '设计',
  },
  {
    id: 'photopea',
    name: 'Photopea',
    url: 'https://www.photopea.com',
    description: '浏览器里跑的「在线 PS」，能直接打开 PSD 文件',
    category: '设计',
  },
  {
    id: 'tldraw',
    name: 'tldraw',
    url: 'https://www.tldraw.com',
    description: '极简的在线画板，随手涂鸦、画示意图很顺手',
    category: '设计',
  },
  {
    id: 'dillinger',
    name: 'Dillinger',
    url: 'https://dillinger.io',
    description: '在线 Markdown 编辑器，边写边预览，还能导出各种格式',
    category: '开发',
  },
  {
    id: 'codepen',
    name: 'CodePen',
    url: 'https://codepen.io',
    description: '前端代码试验场，HTML/CSS/JS 即写即看效果',
    category: '开发',
  },
  {
    id: 'hacker-news',
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    description: '技术圈的高质量资讯聚合，看评论区也能学到很多',
    category: '开发',
  },
  {
    id: 'internet-archive',
    name: 'Internet Archive',
    url: 'https://archive.org',
    description: '互联网的时光机，网页、书籍、音视频都有历史存档',
    category: '工具',
  },
  {
    id: 'ninite',
    name: 'Ninite',
    url: 'https://ninite.com',
    description: '勾选常用软件，一次性打包安装，重装系统省一半时间',
    category: '工具',
  },
  {
    id: 'alternativeto',
    name: 'AlternativeTo',
    url: 'https://alternativeto.net',
    description: '按用途找软件替代品，付费软件的免费平替一搜就有',
    category: '工具',
  },
  {
    id: 'wormhole',
    name: 'Wormhole',
    url: 'https://wormhole.app',
    description: '端到端加密的临时传文件，链接过期自动销毁',
    category: '工具',
  },
]
