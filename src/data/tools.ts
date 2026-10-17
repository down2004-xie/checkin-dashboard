/* 工具箱的静态清单 —— 手写，不来自网络（和 data/sites.ts 的定位一致）。
 *
 * 为什么单独一份数据：工具是「编译期就确定的目录」，不是用户数据。
 * 加一个工具只需在这里加一行 + 写对应组件，不碰 localStorage、不升数据版本。
 *
 * status 三态：
 * - ready：已实现，点卡片进入工具面板
 * - soon ：开发中，点了给提示（诚实占位，不假装能用）
 * - link ：外链，点卡片新标签打开（link 字段必填）
 */

export type ToolCategory = 'daily' | 'image' | 'document' | 'share'
export type ToolStatus = 'ready' | 'soon' | 'link'

export interface ToolDef {
  id: string
  name: string
  description: string
  category: ToolCategory
  status: ToolStatus
  /** 卡片左上角的图标字符（用 emoji，零依赖、跨平台） */
  icon: string
  /** status === 'link' 时的目标地址 */
  link?: string
}

export interface ToolCategoryDef {
  id: ToolCategory
  label: string
  /** 该分类图标块的底色，用 color-mix 派生浅底 */
  color: string
}

export const TOOL_CATEGORIES: ToolCategoryDef[] = [
  { id: 'daily', label: '日常', color: '#6ea8ff' },
  { id: 'image', label: '图片', color: '#ff9ec4' },
  { id: 'document', label: '文档', color: '#ffd98e' },
  { id: 'share', label: '分享', color: '#4ade80' },
]

export const TOOLS: ToolDef[] = [
  {
    id: 'unit-convert',
    name: '单位换算',
    description: '长度、重量、面积、温度多单位互转，输入即时出结果',
    category: 'daily',
    status: 'ready',
    icon: '📐',
  },
  {
    id: 'countdown',
    name: '倒计时与纪念日',
    description: '算还有多少天，或已经过去了多少天；数据存在本机',
    category: 'daily',
    status: 'ready',
    icon: '📅',
  },
  {
    id: 'random-pick',
    name: '随机抽签',
    description: '抽签转盘、掷骰子、抛硬币、名单随机分组',
    category: 'daily',
    status: 'ready',
    icon: '🎲',
  },
  {
    id: 'qr-code',
    name: '二维码与条形码',
    description: '把网址、文字、WiFi 密码生成二维码或条形码图片',
    category: 'daily',
    status: 'soon',
    icon: '🔗',
  },
  {
    id: 'image-convert',
    name: '图片格式互转',
    description: 'PNG / JPG / WebP / ICO 互转，ICO 可打包多尺寸',
    category: 'image',
    status: 'soon',
    icon: '🔄',
  },
  {
    id: 'image-compress',
    name: '图片压缩',
    description: '按长边和质量压缩，体积能小一大截',
    category: 'image',
    status: 'soon',
    icon: '🗜️',
  },
  {
    id: 'image-crop',
    name: '裁剪旋转翻转',
    description: '自由裁剪、任意角度旋转、水平垂直翻转',
    category: 'image',
    status: 'soon',
    icon: '✂️',
  },
  {
    id: 'image-watermark',
    name: '加水印',
    description: '文字或图片水印，可调位置、大小、透明度、平铺',
    category: 'image',
    status: 'soon',
    icon: '💧',
  },
  {
    id: 'image-grid',
    name: '九宫格切图',
    description: '把一张图切成九宫格，发朋友圈不用愁',
    category: 'image',
    status: 'ready',
    icon: '🔲',
  },
  {
    id: 'image-stitch',
    name: '长图拼接',
    description: '多张截图纵向或横向拼成一张长图',
    category: 'image',
    status: 'soon',
    icon: '🧩',
  },
  {
    id: 'image-mosaic',
    name: '打码与马赛克',
    description: '框选区域打马赛克或模糊，证件、聊天记录都能用',
    category: 'image',
    status: 'soon',
    icon: '🩹',
  },
  {
    id: 'id-photo',
    name: '证件照处理',
    description: '裁成常见证件尺寸，一键把纯色背景换成白/蓝/红',
    category: 'image',
    status: 'soon',
    icon: '🪪',
  },
  {
    id: 'pdf-convert',
    name: 'PDF 转换',
    description: 'PDF 与图片互转、多图合并成 PDF（全部在本地处理）',
    category: 'document',
    status: 'soon',
    icon: '📄',
  },
  {
    id: 'text-stats',
    name: '文本字数统计',
    description: '统计字数、字符数、段落数与阅读时长',
    category: 'document',
    status: 'soon',
    icon: '🔢',
  },
  {
    id: 'temp-share',
    name: '临时分享箱',
    description: '上传文件生成取件码，对方凭码下载',
    category: 'share',
    status: 'soon',
    icon: '📦',
  },
  {
    id: 'web-share',
    name: '有趣的网页分享',
    description: '站长精选的一批有意思的网站，点开即走',
    category: 'share',
    status: 'soon',
    icon: '✨',
  },
]

/** 按分类取工具；category 为 null 表示「全部」 */
export function filterTools(category: ToolCategory | null): ToolDef[] {
  return category === null ? TOOLS : TOOLS.filter((tool) => tool.category === category)
}

/** 名称/描述的关键字搜索（大小写不敏感）。空查询返回全部 */
export function searchTools(tools: ToolDef[], query: string): ToolDef[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return tools
  return tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(keyword) ||
      tool.description.toLowerCase().includes(keyword),
  )
}
