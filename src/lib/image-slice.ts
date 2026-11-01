/* 图片切图 —— 纯函数（只算矩形/尺寸/文件名，不碰 Canvas/DOM），可单测。
 *
 * 核心难点：把宽 W 均分成 N 份时，W 不一定被 N 整除（比如 100 / 3）。
 * 如果每格都用 Math.floor(W/N)，最后会剩几个像素没人要；用浮点又会重叠/缝隙。
 * 解法：先算出 N+1 条「边界线」的整数坐标（Math.round(i*W/N)），
 * 每格取相邻两条边界之差。这样所有格子**首尾相接、总和正好等于裁剪区域**，
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

export interface SliceSize {
  width: number
  height: number
}

interface SourceArea extends SliceSize {
  x: number
  y: number
}

/** 把 [0, total] 切成 parts 段，返回 parts+1 条整数边界坐标 */
function boundaries(total: number, parts: number): number[] {
  const edges: number[] = []
  for (let i = 0; i <= parts; i += 1) {
    edges.push(Math.round((i * total) / parts))
  }
  return edges
}

function validDimension(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0
}

/**
 * 取原图正中央能放下的最大正方形。奇数像素无法两边完全等分时，多出的 1 px 留在右/下侧，
 * 保证裁剪坐标仍落在整数像素边界上，避免 Canvas 对半像素做插值。
 */
export function centerSquareArea(width: number, height: number): SourceArea | null {
  if (!validDimension(width) || !validDimension(height)) return null
  const side = Math.min(width, height)
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    width: side,
    height: side,
  }
}

/**
 * 把 width×height 的图按 rows×cols 切分，返回每一格的源矩形。
 * `cropSquare` 为 true 时，先取图片中央最大的正方形，再在正方形里切分。
 * 参数非法、或行列数大于可用像素数时返回空数组。
 * 返回顺序是「逐行从左到右」，和界面上的视觉顺序一致。
 */
export function computeSliceRects(
  width: number,
  height: number,
  rows: number,
  cols: number,
  cropSquare = false,
): SliceRect[] {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return []
  if (!validDimension(width) || !validDimension(height)) return []

  const area = cropSquare
    ? centerSquareArea(width, height)
    : { x: 0, y: 0, width, height }
  if (!area || rows > area.height || cols > area.width) return []

  const xEdges = boundaries(area.width, cols)
  const yEdges = boundaries(area.height, rows)
  const rects: SliceRect[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rects.push({
        sx: area.x + xEdges[col],
        sy: area.y + yEdges[row],
        sw: xEdges[col + 1] - xEdges[col],
        sh: yEdges[row + 1] - yEdges[row],
        row,
        col,
      })
    }
  }
  return rects
}

/** 等比缩到预览长边以内（不放大）；无效尺寸返回 0×0。 */
export function fitSlicePreview(width: number, height: number, maxEdge: number): SliceSize {
  if (!validDimension(width) || !validDimension(height) || !validDimension(maxEdge)) {
    return { width: 0, height: 0 }
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '').trim() || 'slice'
}

/** 生成切片下载名：`原文件名-行-列.png`（行列从 1 起）。 */
export function sliceFileName(baseName: string, row: number, col: number): string {
  return `${fileStem(baseName)}-${row + 1}-${col + 1}.png`
}

/** 多张切片统一下载时的 ZIP 文件名。 */
export function sliceArchiveName(baseName: string): string {
  return `${fileStem(baseName)}-slices.zip`
}
