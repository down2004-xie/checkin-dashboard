/* 证件照处理 —— 纯计算（尺寸表 / 颜色距离 / 背景判定与替换 / 居中裁剪），可单测。
 *
 * 能力边界（重要，别夸大）：这里做的是「按颜色距离」的近似换背景，适合背景比较
 * 干净、颜色均匀的照片（纯色/近似纯色）。做不到 AI 发丝级抠图 —— 复杂背景
 * （阴影、渐变、杂物）效果有限，边缘偏硬。纯前端无模型，这是诚实的上限。
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

/** 两个 RGB 颜色的欧氏距离（0~441） */
export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * 判断某个像素是否属于「背景」：与参考背景色的距离 ≤ tolerance。
 * tolerance 是 0~255 的距离阈值，越大替换越激进（会误伤主体边缘）。
 */
export function isBackgroundPixel(pixel: Rgb, reference: Rgb, tolerance: number): boolean {
  return colorDistance(pixel, reference) <= tolerance
}

/**
 * 把像素数组里「接近参考背景色」的像素替换成目标色，返回新数组（不改原数组）。
 * data 是 canvas getImageData 的 Uint8ClampedArray（RGBA 交错，每 4 个一组）。
 *
 * 只改 RGB、保留 A（透明度），避免把不透明区打成透明。
 * tolerance <= 0 时不替换任何像素（返回副本）。
 */
export function replaceBackground(
  data: Uint8ClampedArray<ArrayBuffer>,
  reference: Rgb,
  tolerance: number,
  target: Rgb,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data) as Uint8ClampedArray<ArrayBuffer>
  if (tolerance <= 0) return out
  for (let i = 0; i < out.length; i += 4) {
    const pixel: Rgb = [out[i], out[i + 1], out[i + 2]]
    if (isBackgroundPixel(pixel, reference, tolerance)) {
      out[i] = target[0]
      out[i + 1] = target[1]
      out[i + 2] = target[2]
      // 不透明度保持原值
    }
  }
  return out
}

/**
 * 从若干采样点里估一个「参考背景色」：取各通道的中位数。
 * 用中位数而不是平均值：四角里若有一角恰好不是背景（比如拍了杂物），
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
