/* 图片切图 —— 纯函数（只算矩形，不碰 Canvas/DOM），可单测。
 *
 * 核心难点：把宽 W 均分成 N 份时，W 不一定被 N 整除（比如 100 / 3）。
 * 如果每格都用 Math.floor(W/N)，最后会剩几个像素没人要；用浮点又会重叠/缝隙。
 * 解法：先算出 N+1 条「边界线」的整数坐标（Math.round(i*W/N)），
 * 每格取相邻两条边界之差。这样所有格子**首尾相接、总和正好等于原图**，
 * 既不丢像素也不重叠。这个性质由单元测试守着。
 */

export interface SliceRect {
  /** 源图上的裁剪起点 x */
  sx: number
  /** 源图上的裁剪起点 y */
  sy: number
  /** 裁剪宽度 */
  sw: number
  /** 裁剪高度 */
  sh: number
  /** 该格所在行（0 起） */
  row: number
  /** 该格所在列（0 起） */
  col: number
}

/** 把 [0, total] 切成 parts 段，返回 parts+1 条整数边界坐标 */
function boundaries(total: number, parts: number): number[] {
  const edges: number[] = []
  for (let i = 0; i <= parts; i += 1) {
    edges.push(Math.round((i * total) / parts))
  }
  return edges
}

/**
 * 把 width×height 的图按 rows×cols 切分，返回每一格的源矩形。
 * 参数非法（非正整数、尺寸非正）时返回空数组，调用方据此判断。
 * 返回顺序是「逐行从左到右」，和界面上九宫格的视觉顺序一致。
 */
export function computeSliceRects(width: number, height: number, rows: number, cols: number): SliceRect[] {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return []
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []

  const xEdges = boundaries(width, cols)
  const yEdges = boundaries(height, rows)
  const rects: SliceRect[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      rects.push({
        sx: xEdges[c],
        sy: yEdges[r],
        sw: xEdges[c + 1] - xEdges[c],
        sh: yEdges[r + 1] - yEdges[r],
        row: r,
        col: c,
      })
    }
  }
  return rects
}

/**
 * 生成切片的下载文件名：`原文件名-行-列.png`（行列从 1 起，符合直觉）。
 * 去掉原文件名的扩展名；原名为空时退回 'slice'。
 */
export function sliceFileName(baseName: string, row: number, col: number): string {
  const base = baseName.replace(/\.[^./\\]+$/, '').trim() || 'slice'
  return `${base}-${row + 1}-${col + 1}.png`
}
