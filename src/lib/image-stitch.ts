/* 长图拼接 —— 纯函数（只算画布尺寸和每张图的位置/尺寸，不碰 Canvas/DOM），可单测。
 *
 * 核心难点：多张图尺寸不一，要先「统一一条边」才能对齐拼接。
 * 纵向拼接统一「宽」，横向拼接统一「高」——统一值取所有图对应维度的**最大值**
 * （被 maxEdge 封顶）。这样每张图都按同一基准等比缩放，不会有的图被拉变形。
 *
 * 为什么用最大值而不是最小值：若取最小值，比它宽的图会被缩小、比它窄的图却
 * 保持原样，视觉上每张图的「清晰度」不齐；取最大值则统一按最宽那张的宽度做
 * 基准，缩放比例一致、边缘对齐最整齐。maxEdge 用来兜住「最宽那张特别大导致
 * 画布过大」的情况。
 *
 * 所有坐标/尺寸都取整数：canvas 的宽高只接受整数，浮点会被浏览器截断，
 * 逐张累加浮点还会让接缝处出现半像素的缝或重叠。所以每一步都 Math.round。
 */

export interface StitchInput {
  width: number
  height: number
}

export interface StitchPlacement {
  /** 该图左上角在画布上的 x */
  x: number
  /** 该图左上角在画布上的 y */
  y: number
  /** 缩放后绘制宽度 */
  width: number
  /** 缩放后绘制高度 */
  height: number
}

export interface StitchLayout {
  canvasWidth: number
  canvasHeight: number
  placements: StitchPlacement[]
}

/** 把 gap 规整成合法的整数间隔：负数 / 非有限值都按 0 处理。 */
function safeGap(gap: number): number {
  if (!Number.isFinite(gap) || gap <= 0) return 0
  return Math.round(gap)
}

/** maxEdge 是否作为有效上限：必须是有限正数，否则视为「不设上限」。 */
function isValidMaxEdge(maxEdge: number | undefined): maxEdge is number {
  return typeof maxEdge === 'number' && Number.isFinite(maxEdge) && maxEdge > 0
}

/**
 * 计算拼接布局。
 *
 * @param images  每张图的原始宽高（顺序即拼接顺序）
 * @param direction 'vertical' 纵向 / 'horizontal' 横向
 * @param gap      图之间的间隔像素（负数按 0）
 * @param maxEdge  可选，统一边的上限像素（不给则不设上限，用各图该维度的最大值）
 *
 * 空数组返回全 0 的空布局，调用方据此判断「没有可拼的图」。
 */
export function computeStitchLayout(
  images: StitchInput[],
  direction: 'vertical' | 'horizontal',
  gap: number,
  maxEdge?: number,
): StitchLayout {
  if (images.length === 0) {
    return { canvasWidth: 0, canvasHeight: 0, placements: [] }
  }

  const g = safeGap(gap)
  const cap = isValidMaxEdge(maxEdge) ? maxEdge : Number.POSITIVE_INFINITY

  if (direction === 'vertical') {
    // 统一宽度 = 所有图最大宽度，再用 maxEdge 封顶
    const maxWidth = Math.max(...images.map((img) => img.width))
    const targetWidth = Math.round(Math.min(maxWidth, cap))

    const placements: StitchPlacement[] = []
    let y = 0
    for (const img of images) {
      // 等比缩放：缩放后高度 = 原高 * 目标宽 / 原宽
      const height = Math.round((img.height * targetWidth) / img.width)
      placements.push({ x: 0, y, width: targetWidth, height })
      y += height + g
    }
    // 最后一张后面没有 gap，所以总高 = 各缩放高之和 + gap*(n-1)
    const canvasHeight = y - g
    return { canvasWidth: targetWidth, canvasHeight, placements }
  }

  // 横向：统一高度 = 所有图最大高度，再用 maxEdge 封顶
  const maxHeight = Math.max(...images.map((img) => img.height))
  const targetHeight = Math.round(Math.min(maxHeight, cap))

  const placements: StitchPlacement[] = []
  let x = 0
  for (const img of images) {
    // 等比缩放：缩放后宽度 = 原宽 * 目标高 / 原高
    const width = Math.round((img.width * targetHeight) / img.height)
    placements.push({ x, y: 0, width, height: targetHeight })
    x += width + g
  }
  const canvasWidth = x - g
  return { canvasWidth, canvasHeight: targetHeight, placements }
}
