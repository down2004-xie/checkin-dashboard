/* 图片压缩 —— 纯函数（尺寸计算 / 体积格式化 / 压缩率），可单测。
 * Canvas 绘制和 toBlob 那层在组件里，这里只放不碰 DOM 的可测逻辑。
 */

export interface Dimensions {
  width: number
  height: number
}

/**
 * 等比缩放：把长边缩到不超过 maxEdge，短边按同比例缩。
 *
 * 两条约束：
 * 1. **不放大**：原图长边本来就 ≤ maxEdge 时原样返回 —— 把 200px 的图
 *    放大到 1000px 只会变糊、体积变大，不是用户想要的「压缩」。
 * 2. 至少 1px：极端比例（比如 5000×1）缩放后短边 round 可能变 0，
 *    canvas 尺寸为 0 会报错，所以下限兜到 1。
 * maxEdge 非法（非正/非有限）时原样返回。
 */
export function fitDimensions(width: number, height: number, maxEdge: number): Dimensions {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) return { width, height }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * 解析「长边最大」输入框：正整数返回数字，空 / 非数字 / 非正数返回 null。
 *
 * 为什么不直接 Number(x)：Number('') === 0、Number('abc') 是 NaN，
 * 交给 fitDimensions 都会被当成「不限制」静默按原尺寸压，用户以为限了 1920 其实没限。
 * 返回 null 让组件明确提示。小数按四舍五入取整（canvas 尺寸只能是整数）。
 */
export function parseMaxEdge(input: string): number | null {
  const text = input.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Math.round(Number(text))
  return value >= 1 ? value : null
}

/**
 * 把字节数格式化成好读的字符串：B / KB / MB。
 * 保留一位小数，整数则省掉 .0（1 KB 而不是 1.0 KB）。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const rounded = Math.round(value * 10) / 10
  // 整数去掉小数点后的 .0
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 压缩率：压缩后比原来小了多少，返回 0~1 的比例（0.62 = 省了 62%）。
 * original 非正时返回 0（避免除零）。压缩后反而变大时返回负数，
 * 交给界面判断要不要提示「没有变小」。
 */
export function compressionRatio(original: number, compressed: number): number {
  if (!Number.isFinite(original) || original <= 0) return 0
  return (original - compressed) / original
}
