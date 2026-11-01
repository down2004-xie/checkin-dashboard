/* 工具箱的静态清单 —— 手写，不来自网络（和 data/sites.ts 的定位一致）。
 *
 * 为什么单独一份数据：工具是「编译期就确定的目录」，不是用户数据。
 * 加一个工具只需在这里加一行 + 写对应组件 + 在 ToolboxView 的映射表里绑定，
 * 不碰 localStorage、不升数据版本。
 *
 * status 四态：
 * - ready      ：已实现，点卡片进入工具面板
 * - soon       ：开发中，点了给提示（诚实占位，不假装能用）
 * - unavailable：纯静态站做不到（如需要后端），点了说明原因。和 soon 分开，
 *                否则角标写「开发中」却永远不会上线，是对用户撒谎
 * - link       ：外链，点卡片新标签打开（link 字段必填）
 *
 * 描述只写真实存在的功能：描述就是对用户的承诺（见 CLAUDE.md 工具箱约定）。
 */

export type ToolCategory = 'daily' | 'image' | 'document' | 'security' | 'share'
export type ToolStatus = 'ready' | 'soon' | 'unavailable' | 'link'

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
  { id: 'security', label: '编码与加密', color: '#b794f6' },
  { id: 'share', label: '分享', color: '#4ade80' },
]

export const TOOLS: ToolDef[] = [
  // ── 日常 ──
  {
    id: 'unit-convert',
    name: '单位换算',
    description: '长度、重量、面积、温度多单位互转，含市制单位，输入即时出结果',
    category: 'daily',
    status: 'ready',
    icon: '📐',
  },
  {
    id: 'countdown',
    name: '倒计时与纪念日',
    description: '算某天还有多少天、已经过去多少天，纪念日可按每年重复算下一次',
    category: 'daily',
    status: 'ready',
    icon: '📅',
  },
  {
    id: 'random-pick',
    name: '随机抽签',
    description: '掷骰子、抛硬币、从名单里抽人、随机分组',
    category: 'daily',
    status: 'ready',
    icon: '🎲',
  },
  {
    id: 'answer-book',
    name: '答案之书',
    description: '心里默念一个问题，按住翻开，看看书给你的答案（仅供娱乐）',
    category: 'daily',
    status: 'ready',
    icon: '📖',
  },
  {
    id: 'rmb-uppercase',
    name: '人民币大写',
    description: '把金额转成报销单、收据上用的中文大写，如「壹佰元整」',
    category: 'daily',
    status: 'ready',
    icon: '💴',
  },
  {
    id: 'loan-calc',
    name: '房贷计算器',
    description: '等额本息与等额本金对比：月供、总利息、逐月还款表',
    category: 'daily',
    status: 'ready',
    icon: '🏠',
  },
  {
    id: 'color-tool',
    name: '颜色工具',
    description: 'HEX / RGB / HSL 互转，检查文字和背景的对比度够不够',
    category: 'daily',
    status: 'ready',
    icon: '🎨',
  },
  {
    id: 'barcode',
    name: '条形码生成',
    description: '把数字、字母生成 Code 128 条形码图片',
    category: 'daily',
    status: 'ready',
    icon: '▥',
  },
  {
    id: 'qr-code',
    name: '二维码生成与识别',
    description: '文字或网址生成二维码；上传或粘贴截图识别二维码内容',
    category: 'daily',
    status: 'ready',
    icon: '🔳',
  },
  // ── 图片 ──
  {
    id: 'image-convert',
    name: '图片格式互转',
    description: 'PNG / JPG / WebP 互转，PNG 无损可保留透明',
    category: 'image',
    status: 'ready',
    icon: '🔄',
  },
  {
    id: 'image-compress',
    name: '图片压缩',
    description: '按长边和质量压缩，体积能小一大截',
    category: 'image',
    status: 'ready',
    icon: '🗜️',
  },
  {
    id: 'image-crop',
    name: '裁剪旋转翻转',
    description: '拖拽框选裁剪、90° 旋转、水平垂直翻转',
    category: 'image',
    status: 'ready',
    icon: '✂️',
  },
  {
    id: 'image-watermark',
    name: '加水印',
    description: '文字水印，可调位置、大小、透明度、旋转、平铺',
    category: 'image',
    status: 'ready',
    icon: '💧',
  },
  {
    id: 'image-grid',
    name: '九宫格切图',
    description: '把一张图切成九宫格，可先裁成正方形，一键打包下载',
    category: 'image',
    status: 'ready',
    icon: '🔲',
  },
  {
    id: 'image-stitch',
    name: '长图拼接',
    description: '多张截图纵向或横向拼成一张长图，可调整顺序',
    category: 'image',
    status: 'ready',
    icon: '🧩',
  },
  {
    id: 'image-mosaic',
    name: '打码与马赛克',
    description: '框选区域打马赛克或模糊，证件、聊天记录都能用',
    category: 'image',
    status: 'ready',
    icon: '🩹',
  },
  {
    id: 'id-photo',
    name: '证件照处理',
    description: '纯色背景换成白/蓝/红，裁成常见证件尺寸',
    category: 'image',
    status: 'ready',
    icon: '🪪',
  },
  {
    id: 'exif-viewer',
    name: '照片信息查看与清除',
    description: '查看照片里的拍摄时间、相机、GPS 位置，分享前一键清除',
    category: 'image',
    status: 'ready',
    icon: '🔍',
  },
  // ── 文档 ──
  {
    id: 'pdf-convert',
    name: '图片转 PDF',
    description: '多张图片按顺序合并成一个 PDF，可选 A4 或原尺寸页面',
    category: 'document',
    status: 'ready',
    icon: '📄',
  },
  {
    id: 'pdf-to-image',
    name: 'PDF 转图片',
    description: '把 PDF 每一页导出成 PNG 或 JPG，打包下载',
    category: 'document',
    status: 'ready',
    icon: '🖼️',
  },
  {
    id: 'pdf-merge-split',
    name: 'PDF 合并与拆分',
    description: '多个 PDF 合成一个，或按页码范围提取出新的 PDF',
    category: 'document',
    status: 'ready',
    icon: '📑',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF 提取文字（导出 Word）',
    description: '提取 PDF 里的文字并按段落导出成 .docx；不保留原排版，扫描件无法提取',
    category: 'document',
    status: 'ready',
    icon: '📝',
  },
  {
    id: 'text-stats',
    name: '文本字数统计',
    description: '统计字数、字符数、段落数与阅读时长',
    category: 'document',
    status: 'ready',
    icon: '🔢',
  },
  {
    id: 'text-diff',
    name: '文本对比',
    description: '比较两段文字的差异，标出新增和删除的行与字',
    category: 'document',
    status: 'ready',
    icon: '🆚',
  },
  // ── 编码与加密 ──
  {
    id: 'encode-convert',
    name: '编码转换',
    description: 'Base64、URL、Unicode、十六进制编码与解码，另有凯撒密码和摩斯电码',
    category: 'security',
    status: 'ready',
    icon: '🔤',
  },
  {
    id: 'hash-calc',
    name: '哈希计算',
    description: '计算文字或文件的 MD5 / SHA-1 / SHA-256 / SHA-512，校验下载是否完整',
    category: 'security',
    status: 'ready',
    icon: '#️⃣',
  },
  {
    id: 'text-encrypt',
    name: '文本加密',
    description: '用密码对文字做 AES 加密和解密，只能用本工具解开',
    category: 'security',
    status: 'ready',
    icon: '🔐',
  },
  {
    id: 'password-gen',
    name: '密码生成器',
    description: '按长度和字符类型生成安全的随机密码，并估算强度',
    category: 'security',
    status: 'ready',
    icon: '🔑',
  },
  // ── 分享 ──
  {
    id: 'temp-share',
    name: '临时分享箱',
    description: '上传文件生成取件码，对方凭码下载。需要后端存储文件，纯静态站无法实现',
    category: 'share',
    status: 'unavailable',
    icon: '📦',
  },
  {
    id: 'web-share',
    name: '有趣的网页分享',
    description: '站长精选的一批有意思的网站，点开即走',
    category: 'share',
    status: 'ready',
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
