/* Canvas 尺寸上限 —— 纯函数，可单测（探测函数 probe 由组件注入）。
 *
 * 为什么需要：超过上限时浏览器不会报错。Chrome 会让 drawImage 静默不生效、
 * toDataURL 返回 "data:,"；iOS Safari 会让 getContext 返回 null。
 * 结果是用户拿到一张空图，界面还写着「已生成」（长图拼接踩过，见 MY-ISSUES）。
 *
 * 各浏览器上限不同，而且没有 API 可查：
 * - Chrome / Edge：单边 32767，总面积约 2.68 亿像素
 * - Firefox：单边 32767，总面积约 1.24 亿像素
 * - iOS Safari：总面积 16777216（4096×4096），单边约 4096×4 量级
 * 所以策略是「先按桌面上限算，再真建一个 canvas 探测能不能画；不行就退到 iOS 的保守上限」。
 */

export interface Size {
  width: number
  height: number
}

export interface CanvasLimit {
  maxSide: number
  maxArea: number
}

/** 桌面浏览器取 Chrome 和 Firefox 的交集 */
export const DESKTOP_LIMIT: CanvasLimit = { maxSide: 32767, maxArea: 124_000_000 }
/** iOS Safari 的保守上限：所有现代浏览器都能画 */
export const SAFE_LIMIT: CanvasLimit = { maxSide: 16384, maxArea: 16_777_216 }

export function exceedsLimit(size: Size, limit: CanvasLimit): boolean {
  return size.width > limit.maxSide || size.height > limit.maxSide || size.width * size.height > limit.maxArea
}

/** 等比缩小到上限以内（不放大）。返回整数尺寸，最小 1×1 */
export function fitWithin(size: Size, limit: CanvasLimit): Size {
  if (size.width <= 0 || size.height <= 0) return { width: 0, height: 0 }
  if (!exceedsLimit(size, limit)) return { width: Math.round(size.width), height: Math.round(size.height) }
  const sideScale = Math.min(limit.maxSide / size.width, limit.maxSide / size.height)
  const areaScale = Math.sqrt(limit.maxArea / (size.width * size.height))
  const scale = Math.min(1, sideScale, areaScale)
  // floor 而不是 round：round 可能刚好越过上限一个像素
  return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) }
}

export interface CanvasPlan {
  size: Size
  /** 实际尺寸 / 期望尺寸，1 表示没缩小 */
  scale: number
}

/**
 * 给出一个「这台浏览器真画得出来」的尺寸。
 * probe(size) 由组件注入：真建 canvas、在右下角画一个像素再读回来（见 canvasProbe）。
 * 两档都探测失败时返回 null，组件必须明确提示「图片太大」，不能提示「请重试」。
 */
export function planCanvas(wanted: Size, probe: (size: Size) => boolean): CanvasPlan | null {
  if (wanted.width <= 0 || wanted.height <= 0) return null
  for (const limit of [DESKTOP_LIMIT, SAFE_LIMIT]) {
    const size = fitWithin(wanted, limit)
    if (probe(size)) return { size, scale: size.width / wanted.width }
  }
  return null
}

/**
 * 浏览器里的真实探测。不纯（要建 canvas），放在这里是为了让所有工具用同一份；
 * 同 bookmarks.ts 的 parseBookmarks，这一个函数不进单测。
 * 只在右下角画 1 像素再读回：超限的 canvas 画不进去，读回来是全透明。
 */
export function canvasProbe(size: Size): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(size.width - 1, size.height - 1, 1, 1)
  const ok = ctx.getImageData(size.width - 1, size.height - 1, 1, 1).data[3] === 255
  // 立刻释放：探测用的大 canvas 不该一直占着显存
  canvas.width = 0
  canvas.height = 0
  return ok
}

/** 「图太大」的统一提示文案 */
export function tooLargeMessage(size: Size): string {
  return `图片太大（${size.width}×${size.height}），超过了这台浏览器能处理的画布上限。请先缩小图片或减少张数`
}
