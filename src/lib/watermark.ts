/* 水印位置计算 —— 纯函数（只算坐标，不碰 Canvas/DOM），可单测。
 *
 * 水印要放哪、铺不铺满，本质是「给定画布和水印的尺寸，算出水印左上角的坐标」。
 * 把这段几何计算抽出来，就能脱离浏览器单测；组件只负责 drawImage / fillText。
 */

/** 九宫格锚点 */
export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** 把 #rgb / #rrggbb / rrggbb 解析成 {r,g,b}；非法返回 null */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  let value = hex.trim().replace(/^#/, '')
  if (value.length === 3) value = value.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

/**
 * 把 #rgb / #rrggbb 的十六进制颜色转成 rgba() 字符串，供 canvas 的 fillStyle 用。
 *
 * 为什么单独抽出来：canvas 的 fillStyle 吃 #rrggbb 也吃 rgba()，但透明度要单独叠加。
 * 用 rgba 能一步把「颜色 + 透明度」定下来，不用改 ctx.globalAlpha（那个会影响阴影等其它绘制）。
 * 支持 3 位简写（#fff）；解析失败退回白色，绝不抛异常 —— 颜色来自 <input type=color>，
 * 正常不会非法，但兜底能防住手改 DOM 之类的边界。
 */
export function hexToRgba(hex: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1))
  const rgb = parseHexColor(hex)
  if (!rgb) return `rgba(255, 255, 255, ${a})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
}

/**
 * 给水印文字配一个「对比阴影」颜色：亮字配黑影、暗字配白影，
 * 保证文字在任何底色的照片上都看得清。
 *
 * 用感知亮度公式（Rec.601：0.299R+0.587G+0.114B），阈值 128。
 * 解析失败按亮字处理（配黑影），和 hexToRgba 的兜底白字一致。
 */
export function shadowColorFor(hex: string): string {
  const rgb = parseHexColor(hex)
  if (!rgb) return 'rgba(0, 0, 0, 0.5)'
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  return luminance > 128 ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)'
}


export interface Point {
  x: number
  y: number
}

/**
 * 算出水印左上角坐标。padding 是水印到画布边缘的最小间距。
 *
 * 为什么返回左上角而不是中心：canvas 的 drawImage / fillText 都按左上角定位，
 * 返回中心点调用方还得自己减半宽半高，容易错。这里直接给可用坐标。
 * 各方向用三档：左/中/右、上/中/下。中间档把剩余空间对半分。
 * 结果**可能为负**（水印比画布大时），刻意不钳到 0 —— 钳了会改变用户看到的相对位置。
 */
export function anchorPosition(
  canvasW: number,
  canvasH: number,
  wmW: number,
  wmH: number,
  anchor: Anchor,
  padding = 0,
): Point {
  const [vertical, horizontal] = anchor.split('-')
  const x =
    horizontal === 'left' ? padding
    : horizontal === 'right' ? canvasW - wmW - padding
    : (canvasW - wmW) / 2
  const y =
    vertical === 'top' ? padding
    : vertical === 'bottom' ? canvasH - wmH - padding
    : (canvasH - wmH) / 2
  return { x, y }
}

/**
 * 平铺坐标：从左上 padding 处起，按「水印宽 + 横向间隔」「水印高 + 纵向间隔」
 * 逐格铺，直到超出画布右下角。
 *
 * 边界处理：只要水印的**左上角**落在画布内就铺（右/下边缘的水印允许被裁掉一部分）。
 * 换成「整块都要在画布内」的话，边缘会空出一条，看起来像没铺满。
 * 水印尺寸非正或画布非正时返回空数组（避免死循环）。
 */
export function tilePositions(
  canvasW: number,
  canvasH: number,
  wmW: number,
  wmH: number,
  gapX = 0,
  gapY = 0,
  padding = 0,
): Point[] {
  if (wmW <= 0 || wmH <= 0 || canvasW <= 0 || canvasH <= 0) return []
  const stepX = wmW + gapX
  const stepY = wmH + gapY
  // 步长非正会让循环原地打转，直接判空
  if (stepX <= 0 || stepY <= 0) return []
  const points: Point[] = []
  for (let y = padding; y < canvasH; y += stepY) {
    for (let x = padding; x < canvasW; x += stepX) {
      points.push({ x, y })
    }
  }
  return points
}
