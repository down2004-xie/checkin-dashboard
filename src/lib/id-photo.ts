/* 证件照处理 —— 纯计算（尺寸表 / 颜色距离 / 背景估计 / 连通换背景 / 居中裁剪），可单测。
 *
 * 能力边界（重要，别夸大）：这里做的是「按颜色距离 + 连通性」的近似换背景，适合背景比较
 * 干净、颜色均匀的照片（纯色/近似纯色）。做不到 AI 发丝级抠图 —— 复杂背景
 * （阴影、渐变、杂物）效果有限。纯前端无模型，这是诚实的上限。
 *
 * 为什么要「连通」：早先的实现对整张图逐像素比颜色，白底换蓝底时白衬衫、眼白
 * 和背景颜色一样，也跟着变蓝。真正的背景有一个几何特征：它和画面边缘连成一片。
 * 所以改成从边缘出发做泛洪填充，只替换「和边缘连通」的背景色像素。
 */

export interface IdPhotoSize {
  id: string
  label: string
  /** 目标像素宽（按 300dpi 由毫米换算） */
  width: number
  /** 目标像素高 */
  height: number
}

/** 常见证件照尺寸（mm → px @300dpi：px = mm / 25.4 * 300，四舍五入） */
export const ID_PHOTO_SIZES: IdPhotoSize[] = [
  { id: 'one', label: '一寸 25×35mm', width: 295, height: 413 },
  { id: 'small-two', label: '小二寸 33×48mm', width: 390, height: 567 },
  { id: 'two', label: '二寸 35×49mm', width: 413, height: 579 },
]

export type Rgb = [number, number, number]

/** 常见背景色 */
export const BG_COLORS: { id: string; label: string; rgb: Rgb }[] = [
  { id: 'white', label: '白底', rgb: [255, 255, 255] },
  { id: 'blue', label: '蓝底', rgb: [67, 142, 219] },
  { id: 'red', label: '红底', rgb: [216, 64, 64] },
]

export type IdPhotoFormat = 'jpeg' | 'png'

/** 导出格式。JPG 排第一：很多报名系统只收 JPG；底色是不透明的，JPG 不丢东西 */
export const ID_PHOTO_FORMATS: { id: IdPhotoFormat; label: string; mime: string }[] = [
  { id: 'jpeg', label: 'JPG', mime: 'image/jpeg' },
  { id: 'png', label: 'PNG', mime: 'image/png' },
]

/** 两个 RGB 颜色的欧氏距离（0~441） */
export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * 判断某个像素是否属于「背景色」：与参考背景色的距离 ≤ tolerance。
 * tolerance 是 0~255 的距离阈值，越大替换越激进（会误伤主体边缘）。
 */
export function isBackgroundPixel(pixel: Rgb, reference: Rgb, tolerance: number): boolean {
  return colorDistance(pixel, reference) <= tolerance
}

/**
 * 从若干采样点里估一个「参考背景色」：取各通道的中位数。
 * 用中位数而不是平均值：采样区里若混进一小块非背景（头发、杂物），
 * 平均值会被拉偏，中位数更稳。
 */
export function estimateBackgroundColor(samples: Rgb[]): Rgb {
  if (samples.length === 0) return [255, 255, 255]
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return [
    median(samples.map((s) => s[0])),
    median(samples.map((s) => s[1])),
    median(samples.map((s) => s[2])),
  ]
}

/** alpha 低于这个值的像素视为「透明」= 背景。抠好图的 PNG 边缘常有几级残留 alpha */
export const TRANSPARENT_ALPHA = 16

export interface BackgroundEstimate {
  /** 背景色；输入的背景是透明的时为 null（此时只按透明度判背景，不按颜色） */
  color: Rgb | null
  /** 采样区里透明像素过半：这是一张抠好图的透明 PNG */
  transparent: boolean
}

/**
 * 从图片 RGBA 数据里估背景。采样区只取「两个上角 + 左右两侧上半部分」：
 * 证件照的肩膀常常压到底边，下角会混进衣服颜色，把背景估成衣服色。
 *
 * 透明像素单独计数、不进颜色样本：canvas 读透明像素得到的是 (0,0,0,0)，
 * 混进去会把背景估成黑色，深色头发就被当成背景换掉了。
 */
export function estimateBackground(data: Uint8ClampedArray, width: number, height: number): BackgroundEstimate {
  if (width <= 0 || height <= 0) return { color: [255, 255, 255], transparent: false }
  // 侧边条宽度：短边的 5%，至少 1 像素
  const strip = Math.max(1, Math.round(Math.min(width, height) * 0.05))
  const halfHeight = Math.max(1, Math.ceil(height / 2))
  const samples: Rgb[] = []
  let transparentCount = 0
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < TRANSPARENT_ALPHA) transparentCount += 1
    else samples.push([data[i], data[i + 1], data[i + 2]])
  }
  // 左右两侧上半部分（两个上角就落在这两条的顶端）。
  // 顶边中间不采：头顶常常贴着上边，采进去会混入头发色
  for (let y = 0; y < halfHeight; y += 1) {
    for (let x = 0; x < Math.min(strip, width); x += 1) take(x, y)
    for (let x = Math.max(strip, width - strip); x < width; x += 1) take(x, y)
  }
  const total = transparentCount + samples.length
  if (total > 0 && transparentCount * 2 > total) return { color: null, transparent: true }
  return { color: estimateBackgroundColor(samples), transparent: false }
}
/**
 * 算出「和边缘连通的背景像素」掩码：1 = 背景，0 = 主体。
 *
 * 种子只取上边 + 左右两侧上半部分，不从底边出发：白衬衫常常贴着底边，
 * 从底边灌进去会把整件衬衫当成背景。肩膀两侧的背景从上方照样灌得到。
 *
 * 用显式队列（BFS）而不是递归：一张几十万像素的纯色背景，递归深度就是几十万层，
 * 必然爆栈。visited 用 Uint8Array，一个像素一个字节，比 Set<number> 省一个数量级。
 *
 * reference 为 null（透明背景）时只按透明度判断，不比颜色：
 * 否则浅色衣服会因为「接近某个猜出来的颜色」被一起灌掉。
 */
export function backgroundMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  reference: Rgb | null,
  tolerance: number,
): Uint8Array {
  const total = width * height
  const mask = new Uint8Array(total)
  if (total <= 0) return mask
  const limit = tolerance * tolerance // 比平方，省掉每个像素一次开方
  const isBg = (p: number) => {
    const i = p * 4
    if (data[i + 3] < TRANSPARENT_ALPHA) return true
    if (!reference || tolerance <= 0) return false
    const dr = data[i] - reference[0]
    const dg = data[i + 1] - reference[1]
    const db = data[i + 2] - reference[2]
    return dr * dr + dg * dg + db * db <= limit
  }
  // 每个像素最多入队一次，定长 Int32Array 就够，不用动态数组
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const visit = (p: number) => {
    if (mask[p] || !isBg(p)) return
    mask[p] = 1
    queue[tail] = p
    tail += 1
  }
  for (let x = 0; x < width; x += 1) visit(x)
  const half = Math.ceil(height / 2)
  for (let y = 0; y < half; y += 1) {
    visit(y * width)
    visit(y * width + width - 1)
  }
  while (head < tail) {
    const p = queue[head]
    head += 1
    const x = p % width
    if (x > 0) visit(p - 1)
    if (x < width - 1) visit(p + 1)
    if (p >= width) visit(p - width)
    if (p + width < total) visit(p + width)
  }
  return mask
}

/**
 * 主体一侧紧挨背景的「边界环」：1 = 和背景直接相邻，2 = 隔一个像素，0 = 更远或本身是背景。
 * 羽化只处理这两圈，所以成本是 O(像素数)，不会拖慢预览。
 */
function edgeRings(mask: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  const ring = new Uint8Array(mask.length)
  const total = width * height
  const touches = (p: number, level: number) => {
    const x = p % width
    const hit = (q: number) => (level === 1 ? mask[q] === 1 : ring[q] === level - 1)
    return (x > 0 && hit(p - 1)) || (x < width - 1 && hit(p + 1)) ||
      (p >= width && hit(p - width)) || (p + width < total && hit(p + width))
  }
  for (let level = 1; level <= depth; level += 1) {
    for (let p = 0; p < total; p += 1) {
      if (!mask[p] && !ring[p] && touches(p, level)) ring[p] = level
    }
  }
  return ring
}
export interface ReplaceOptions {
  /** 原背景色；null 表示背景是透明的（只按透明度判背景） */
  reference: Rgb | null
  /** 颜色距离阈值（0~255）。0 表示不按颜色判背景，只有透明像素算背景 */
  tolerance: number
  /** 新背景色 */
  target: Rgb
  /** 羽化圈数（0~2）。0 = 硬边 */
  feather: number
}

/**
 * 只把「和边缘连通的背景」换成目标色，返回新的 RGBA 数组（不改原数组）。输出一律不透明。
 *
 * 三步：
 * 1. backgroundMask 泛洪出背景区，整块填成目标色。
 * 2. 羽化：主体紧挨背景的一两圈像素，通常是「主体色 + 旧背景色」的混合（拍照时的抗锯齿）。
 *    按它离旧背景色有多近估一个混合比例 t，把其中旧背景的那份换成新背景：
 *    out = pixel + t × (target − reference)。离旧背景越近 t 越大；第二圈再减半。
 *    不这么做，白底换蓝底后头发外沿会留一圈白边。
 * 3. 半透明像素按 alpha 叠在目标色上：JPG 没有透明通道，不叠的话透明处会变黑。
 */
export function replaceConnectedBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ReplaceOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const { reference, tolerance, target } = options
  const out = new Uint8ClampedArray(data.length)
  out.set(data)
  const mask = backgroundMask(data, width, height, reference, tolerance)
  const feather = Math.max(0, Math.min(2, Math.round(options.feather)))
  const ring = reference && feather > 0 ? edgeRings(mask, width, height, feather) : null
  // 羽化的作用范围：颜色距离在 tolerance 之外再多 band 以内的才算「混了背景」
  const band = Math.max(24, tolerance)
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    if (mask[p]) {
      out[i] = target[0]
      out[i + 1] = target[1]
      out[i + 2] = target[2]
      out[i + 3] = 255
      continue
    }
    if (ring && reference && ring[p]) {
      const d = colorDistance([data[i], data[i + 1], data[i + 2]], reference)
      const closeness = 1 - (d - tolerance) / band // tolerance 处 = 1，再远 band 处 = 0
      const t = Math.max(0, Math.min(1, closeness)) / ring[p]
      if (t > 0) {
        out[i] = data[i] + t * (target[0] - reference[0])
        out[i + 1] = data[i + 1] + t * (target[1] - reference[1])
        out[i + 2] = data[i + 2] + t * (target[2] - reference[2])
      }
    }
    const alpha = data[i + 3] / 255
    if (alpha < 1) {
      out[i] = out[i] * alpha + target[0] * (1 - alpha)
      out[i + 1] = out[i + 1] * alpha + target[1] * (1 - alpha)
      out[i + 2] = out[i + 2] * alpha + target[2] * (1 - alpha)
      out[i + 3] = 255
    }
  }
  return out
}

/**
 * 逐像素处理用的工作尺寸：最多约 2 倍目标尺寸，不放大。
 * 手机原图上千万像素，每拖一下容差滑块都对原图泛洪会卡；
 * 输出本来只有 295×413 这个量级，在 2 倍尺寸上处理再缩小，边缘也够细。
 */
export function workingSize(cropW: number, cropH: number, targetW: number, targetH: number): { width: number; height: number } {
  if (cropW <= 0 || cropH <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, (targetW * 2) / cropW, (targetH * 2) / cropH)
  return { width: Math.max(1, Math.round(cropW * scale)), height: Math.max(1, Math.round(cropH * scale)) }
}

/** 下载文件名。扩展名跟 blob 的真实类型走：toBlob 不支持某格式时会静默退回 PNG */
export function idPhotoFileName(sourceName: string, size: IdPhotoSize, blobType: string): string {
  const base = sourceName.replace(/\.[^./\\]+$/, '') || 'idphoto'
  const ext = blobType === 'image/jpeg' ? 'jpg' : 'png'
  return `${base}-${size.width}x${size.height}.${ext}`
}
/**
 * 居中裁剪到目标宽高比，返回源图上的裁剪矩形。
 * 目标比例 = targetW / targetH；从源图里取能容纳的、居中、比例相符的最大矩形。
 */
export function centerCropRect(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): { x: number; y: number; width: number; height: number } {
  if (srcW <= 0 || srcH <= 0 || targetW <= 0 || targetH <= 0) {
    return { x: 0, y: 0, width: Math.max(0, srcW), height: Math.max(0, srcH) }
  }
  const targetAspect = targetW / targetH
  const srcAspect = srcW / srcH
  if (srcAspect > targetAspect) {
    // 源更宽：高度铺满，裁左右
    const width = Math.round(srcH * targetAspect)
    return { x: Math.round((srcW - width) / 2), y: 0, width, height: srcH }
  }
  // 源更高或相等：宽度铺满，裁上下
  const height = Math.round(srcW / targetAspect)
  return { x: 0, y: Math.round((srcH - height) / 2), width: srcW, height }
}
