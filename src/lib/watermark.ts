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
