/* 打码与马赛克 —— 纯计算（块尺寸 / 网格切分），不碰 Canvas/DOM，可单测。
 *
 * 马赛克原理：把一块区域按 blockSize 切成若干小格，每格用其中某个像素
 * 的颜色填满整格，于是细节被抹掉。真正取色/填色在组件的 canvas 里做，
 * 这里只算「块多大、切成几行几列」，这部分最容易算错（除不尽、边界），值得单测。
 */

/**
 * 根据图片长边和用户给的「强度」（1~10，越大越糊）算出马赛克块边长（px）。
 *
 * 为什么按图片尺寸换算而不是固定像素：一张 4000px 的大图和 400px 的小图，
 * 同样用 20px 的块，视觉糊的程度完全不同。按长边的百分比来定，观感才一致。
 * 长边 × 强度比例，再钳到 [2, 长边/4]：块太小看不出马赛克、太大整块糊成纯色。
 */
export function mosaicBlockSize(imageLongEdge: number, strength: number): number {
  const s = Math.min(10, Math.max(1, Math.round(strength)))
  // 强度 1→约 1.5%，10→约 15% 的长边
  const ratio = 0.015 + ((s - 1) / 9) * 0.135
  const size = Math.round(imageLongEdge * ratio)
  return Math.min(Math.max(2, size), Math.max(2, Math.floor(imageLongEdge / 4)))
}

/**
 * 把宽 w、高 h 的区域按 blockSize 切成网格，返回每格的左上角坐标。
 * 用 ceil 而不是 floor：最后不满一格的边缘也要铺到，否则右边/下边会留一条没打码的缝。
 */
export function mosaicCells(w: number, h: number, blockSize: number): { x: number; y: number }[] {
  if (w <= 0 || h <= 0 || blockSize <= 0) return []
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < h; y += blockSize) {
    for (let x = 0; x < w; x += blockSize) {
      cells.push({ x, y })
    }
  }
  return cells
}

/** 某个块实际要填的宽高：贴边那格可能不满 blockSize，不能超出区域 */
export function cellExtent(x: number, y: number, w: number, h: number, blockSize: number): { width: number; height: number } {
  return {
    width: Math.min(blockSize, w - x),
    height: Math.min(blockSize, h - y),
  }
}
