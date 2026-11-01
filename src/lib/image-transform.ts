/* 图片裁剪 / 旋转 / 翻转 —— 纯几何计算，不碰 Canvas/DOM，可单测。
 *
 * 分工：这个文件算「尺寸、矩形、坐标映射、变换矩阵」；组件只拿矩阵去
 * setTransform + drawImage。最容易出错的几何逻辑（翻转沿哪根轴）由单测钉住。
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

/* ---------- 方向（旋转 + 镜像）与变换矩阵 ---------- */

/**
 * 图片当前的方向：先把原图左右镜像（mirror），再顺时针转 rotation 度。
 *
 * 为什么不存 flipH / flipV 两个布尔：用户点的「水平翻转」永远是**沿屏幕的竖轴**翻，
 * 而旋转 90° 后，屏幕竖轴对应的是原图的横轴。旧实现把 flipH 直接作用在原图上
 * （先 rotate 再 scale），于是转了 90° 再点「水平翻转」，屏幕上看到的是上下翻转。
 * 「旋转 + 一次镜像」能表示全部 8 种方向且表示唯一；屏幕轴上的操作由 applyOrientationOp 折算进来。
 */
export interface Orientation {
  rotation: Rotation
  mirror: boolean
}

export type OrientationOp = 'rotate' | 'flipH' | 'flipV'

export const IDENTITY_ORIENTATION: Orientation = { rotation: 0, mirror: false }

/**
 * 在当前方向上，再做一次「沿屏幕」的操作。
 * 推导（R 为顺时针旋转，M 为原图镜像，F 为屏幕翻转，复合从右往左读）：
 * - 顺时针 90°：R90 ∘ R(r) ∘ M = R(r+90) ∘ M
 * - 水平翻转：  F_H ∘ R(r) = R(-r) ∘ F_H  →  R(-r) ∘ M^(m+1)
 * - 垂直翻转：  F_V = R180 ∘ F_H        →  R(180-r) ∘ M^(m+1)
 */
export function applyOrientationOp(current: Orientation, op: OrientationOp): Orientation {
  if (op === 'rotate') return { rotation: normalizeRotation(current.rotation + 90), mirror: current.mirror }
  if (op === 'flipH') return { rotation: normalizeRotation(-current.rotation), mirror: !current.mirror }
  return { rotation: normalizeRotation(180 - current.rotation), mirror: !current.mirror }
}

/** canvas setTransform(a, b, c, d, e, f) 的六个参数：x' = a·x + c·y + e，y' = b·x + d·y + f */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function applyMatrix(m: Matrix, point: { x: number; y: number }): { x: number; y: number } {
  return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f }
}

/**
 * 把原图（natural 尺寸）按方向画到画布上的变换矩阵。
 *
 * offset：先减去这个偏移（变换后、缩放前的像素坐标）——导出裁剪区时传裁剪框左上角，
 *         drawImage 整张原图，画布外的部分自然被裁掉，不用先画一张全尺寸中间图。
 * scale：最后整体缩放——预览传 预览尺寸/原尺寸，导出传 1（或超限时 planCanvas 给的比例）。
 *
 * 每个分支是 x 先镜像（x → W - x）、再顺时针旋转后的坐标，W/H 是原图宽高。
 */
export function orientationMatrix(
  source: Size,
  orientation: Orientation,
  scale = 1,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): Matrix {
  const { width: W, height: H } = source
  const m = orientation.mirror
  // 只旋转、未缩放未平移时的矩阵
  let base: Matrix
  switch (orientation.rotation) {
    case 90: // (x, y) → (H - y, x)
      base = m ? { a: 0, b: -1, c: -1, d: 0, e: H, f: W } : { a: 0, b: 1, c: -1, d: 0, e: H, f: 0 }
      break
    case 180: // (x, y) → (W - x, H - y)
      base = m ? { a: 1, b: 0, c: 0, d: -1, e: 0, f: H } : { a: -1, b: 0, c: 0, d: -1, e: W, f: H }
      break
    case 270: // (x, y) → (y, W - x)
      base = m ? { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0 } : { a: 0, b: -1, c: 1, d: 0, e: 0, f: W }
      break
    default: // (x, y) → (x, y)
      base = m ? { a: -1, b: 0, c: 0, d: 1, e: W, f: 0 } : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  }
  return {
    a: base.a * scale,
    b: base.b * scale,
    c: base.c * scale,
    d: base.d * scale,
    e: (base.e - offset.x) * scale,
    f: (base.f - offset.y) * scale,
  }
}

/**
 * 旋转 / 翻转时让裁剪框跟着图一起变（百分比坐标，相对变换后的图）。
 *
 * 为什么跟着变而不是重置：用户框好人脸后再转 90°，框应该还在人脸上；
 * 重置成整图等于让用户重画一遍。变换是可逆的（四次旋转、两次翻转回到原样），框也跟着回到原样。
 * 做法：把框的两个对角点按同一个屏幕操作映射，再交给 pointsToRatio 规范成正向矩形。
 */
export function transformCropRect(rect: RatioRect, op: OrientationOp): RatioRect {
  const map = (u: number, v: number): [number, number] =>
    op === 'rotate' ? [1 - v, u] // 顺时针 90°：新 x = 1 - 旧 y，新 y = 旧 x
    : op === 'flipH' ? [1 - u, v]
    : [u, 1 - v]
  const [ax, ay] = map(rect.x, rect.y)
  const [bx, by] = map(rect.x + rect.width, rect.y + rect.height)
  return pointsToRatio(ax, ay, bx, by)
}
