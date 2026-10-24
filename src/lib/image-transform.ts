/* 图片裁剪 / 旋转 / 翻转 —— 纯几何计算，不碰 Canvas/DOM，可单测。
 *
 * 分工：这个文件只算「尺寸、矩形、坐标映射」；真正的 translate/rotate/drawImage
 * 在组件里。这样最容易出错的几何逻辑能被单测钉住。
 */

export type Rotation = 0 | 90 | 180 | 270

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 用百分比表示的矩形（0~1，相对图像宽高）。拖拽选框用它，避免和显示像素耦合 */
export interface RatioRect {
  x: number
  y: number
  width: number
  height: number
}

/** 把任意角度归一化到最近的 0/90/180/270 档（含负数） */
export function normalizeRotation(deg: number): Rotation {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return n as Rotation
}

/** 旋转 90° 或 270° 时宽高互换，180° 不变 */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}

/** 整张图的矩形 */
export function fullRect(size: Size): Rect {
  return { x: 0, y: 0, width: size.width, height: size.height }
}

/**
 * 把矩形约束进 [0, size] 范围内，并保证宽高至少 1px。
 * 裁剪框可能因为旋转后尺寸变化、或拖拽越界而超出，导出前必须 clamp。
 * 先钳左上角、再按剩余空间钳宽高，保证右下角也不越界。
 */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const x = Math.min(Math.max(0, rect.x), Math.max(0, bounds.width - 1))
  const y = Math.min(Math.max(0, rect.y), Math.max(0, bounds.height - 1))
  const width = Math.min(Math.max(1, rect.width), bounds.width - x)
  const height = Math.min(Math.max(1, rect.height), bounds.height - y)
  return { x, y, width, height }
}

/**
 * 百分比矩形 → 像素矩形（按给定尺寸）。
 * 会顺手 clamp 到尺寸内并取整，保证 drawImage 的参数合法。
 */
export function ratioRectToPixels(ratio: RatioRect, size: Size): Rect {
  return clampRect(
    {
      x: Math.round(ratio.x * size.width),
      y: Math.round(ratio.y * size.height),
      width: Math.round(ratio.width * size.width),
      height: Math.round(ratio.height * size.height),
    },
    size,
  )
}

/**
 * 把两个对角点（拖动起止）规范成一个正向的百分比矩形。
 * 拖拽时用户可能从右下往左上拖，x2 < x1，必须交换。
 * 结果 clamp 到 0~1，避免拖出容器。
 */
export function pointsToRatio(ax: number, ay: number, bx: number, by: number): RatioRect {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const x = clamp01(Math.min(ax, bx))
  const y = clamp01(Math.min(ay, by))
  const width = clamp01(Math.max(ax, bx)) - x
  const height = clamp01(Math.max(ay, by)) - y
  return { x, y, width, height }
}
