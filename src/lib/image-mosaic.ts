/* 打码与马赛克 —— 纯计算，不碰 Canvas/DOM，可单测。
 *
 * 马赛克原理：把一块区域按 blockSize 切成若干小格，每格用格内的平均色
 * 填满整格，于是细节被抹掉。这里算「块多大、切成几行几列」并直接处理 RGBA 字节；
 * 组件只负责 getImageData / putImageData。
 * 模糊用浏览器的 ctx.filter，但「拷多大一块去模糊」「边缘怎么补」这两步最容易出错
 * （旧实现原文会透出来），也放在这里单测。
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

/** 像素矩形（整数坐标） */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** 模糊半径：和马赛克块同一把尺子（按长边比例），保证两种方式在同一强度下糊的程度相近 */
export function blurRadius(imageLongEdge: number, strength: number): number {
  return Math.max(2, Math.round(mosaicBlockSize(imageLongEdge, strength) * 0.6))
}

/**
 * 模糊时临时画布要多拷的那一圈：选区四周各扩 padding，再 clamp 到图片边界。
 *
 * 为什么必须扩：blur 会把每个像素和周围半径内的像素混合。如果临时画布只有选区那么大，
 * 选区边缘的像素会和画布外的「透明」混合，变成半透明；画回原图时半透明像素底下的
 * 原文会透出来。对一行文字打码时，整个选区都落在这条半透明带里，字依然可读（审核确认过）。
 * 扩出 padding 后，选区内每个像素周围都是真实图像，模糊结果就是不透明的。
 *
 * padding 取 3 倍半径：高斯模糊在 3σ 外的权重小于 0.3%，再往外拷对结果没有可见影响。
 * 贴着图片边缘的那一侧扩不出去，由 normalizeBlurEdges 补救。
 */
export function paddedRect(rect: PixelRect, radius: number, bounds: { width: number; height: number }): PixelRect {
  const pad = Math.max(0, Math.ceil(radius * 3))
  const x = Math.max(0, rect.x - pad)
  const y = Math.max(0, rect.y - pad)
  const right = Math.min(bounds.width, rect.x + rect.width + pad)
  const bottom = Math.min(bounds.height, rect.y + rect.height + pad)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/**
 * 修正图片边缘的模糊结果（归一化卷积）。
 *
 * 选区贴着图片边缘时，padding 那一侧扩不出去，画布外仍是透明，模糊后那一带 alpha 会掉下来。
 * 解法：对一张同尺寸、全不透明的「掩码」做同样的模糊，掩码在每个像素的 alpha 恰好是
 * 「这个像素的模糊核里有多少落在画布内」。用图像的 alpha 除以它，就把缺失的那部分权重补回来了：
 * - 不透明图片：两者相等，结果 alpha = 255，原文不会透出来
 * - 本身带透明的图片：透明区域除完还是透明，不会被填成黑块
 * RGB 不用动：getImageData 返回的是非预乘颜色，已经等价于「只在画布内的像素上加权平均」。
 *
 * blurred / mask 都是 RGBA 字节数组，长度相同；原地修改 blurred。
 */
export function normalizeBlurEdges(blurred: Uint8ClampedArray, mask: Uint8ClampedArray): void {
  for (let i = 3; i < blurred.length; i += 4) {
    const coverage = mask[i]
    if (coverage === 0) continue
    blurred[i] = Math.min(255, Math.round((blurred[i] * 255) / coverage))
  }
}

/**
 * 原地给一块 RGBA 像素打马赛克：每格取 alpha 加权的平均色，连同平均 alpha 一起写回整格。
 *
 * 为什么按 alpha 加权：透明像素的 RGB 没有意义（通常是 0,0,0）。直接平均会把半透明边缘拉黑；
 * 只取中心像素再用 fillRect 填 rgb()，透明区域会被填成**不透明的黑块**（旧实现的问题）。
 * 写回 alpha 而不是一律 255：透明 PNG 打完码，透明的地方还是透明。
 */
export function pixelate(data: Uint8ClampedArray, width: number, height: number, blockSize: number): void {
  for (const cell of mosaicCells(width, height, blockSize)) {
    const extent = cellExtent(cell.x, cell.y, width, height, blockSize)
    let r = 0, g = 0, b = 0, a = 0
    for (let y = cell.y; y < cell.y + extent.height; y++) {
      for (let x = cell.x; x < cell.x + extent.width; x++) {
        const i = (y * width + x) * 4
        const alpha = data[i + 3]
        r += data[i] * alpha
        g += data[i + 1] * alpha
        b += data[i + 2] * alpha
        a += alpha
      }
    }
    const count = extent.width * extent.height
    const avg = a === 0 ? [0, 0, 0, 0] : [r / a, g / a, b / a, a / count]
    for (let y = cell.y; y < cell.y + extent.height; y++) {
      for (let x = cell.x; x < cell.x + extent.width; x++) {
        const i = (y * width + x) * 4
        data[i] = avg[0]; data[i + 1] = avg[1]; data[i + 2] = avg[2]; data[i + 3] = avg[3]
      }
    }
  }
}

/**
 * 不支持 ctx.filter 时的模糊回退：「缩小再放大」。返回从原尺寸一路缩到目标尺寸的每一步尺寸。
 *
 * 为什么要分步：一次缩小很多倍时，双线性插值只采样稀疏的几个点，细线条可能整根被跳过
 * 或整根保留，糊得不均匀。每步最多缩一半，每个输出像素都覆盖了所有输入像素，等价于逐级 box blur。
 * 目标边长 = 原边长 / factor（至少 1）。返回不含起点、含终点；不需要缩时返回空数组。
 */
export function downscaleSteps(width: number, height: number, factor: number): { width: number; height: number }[] {
  if (width <= 0 || height <= 0 || !(factor > 1)) return []
  const targetW = Math.max(1, Math.round(width / factor))
  const targetH = Math.max(1, Math.round(height / factor))
  const steps: { width: number; height: number }[] = []
  let w = width
  let h = height
  while (w > targetW || h > targetH) {
    w = Math.max(targetW, Math.ceil(w / 2))
    h = Math.max(targetH, Math.ceil(h / 2))
    steps.push({ width: w, height: h })
  }
  return steps
}

/**
 * 撤销栈要丢掉最老的几条：深度超过 maxDepth，或总字节超过 maxBytes 时从最老的开始丢。
 * 至少保留最新的一条（哪怕它本身就超预算），否则刚打的码没法撤。
 * sizes 按从老到新排列，返回要丢弃的条数。
 *
 * 为什么按字节限：快照只存被改动的那块选区，但一张 4000×3000 的图全选一次就是 48 MB，
 * 光按条数限，连续框选大区域会把内存吃满。
 */
export function undoOverflow(sizes: number[], maxDepth: number, maxBytes: number): number {
  let drop = Math.max(0, sizes.length - maxDepth)
  let total = sizes.slice(drop).reduce((sum, size) => sum + size, 0)
  while (drop < sizes.length - 1 && total > maxBytes) {
    total -= sizes[drop]
    drop++
  }
  return drop
}
