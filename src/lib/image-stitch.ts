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
  /** 对应输入数组里的第几张（宽或高为 0 的图被跳过，所以不一定等于 placements 的下标） */
  index: number
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
  /** 被跳过的输入下标（宽或高不是有限正数，没法等比缩放） */
  skipped: number[]
}

/** 宽高都是有限正数才能参与拼接：0 会让等比缩放除以 0 得到 NaN，整张画布尺寸跟着变 NaN */
function isUsable(img: StitchInput): boolean {
  return Number.isFinite(img.width) && Number.isFinite(img.height) && img.width > 0 && img.height > 0
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
 * 宽或高不是有限正数的图被跳过（记进 skipped），其余照常拼。
 * 没有可拼的图时返回全 0 的空布局，调用方据此判断「没有可拼的图」。
 */
export function computeStitchLayout(
  images: StitchInput[],
  direction: 'vertical' | 'horizontal',
  gap: number,
  maxEdge?: number,
): StitchLayout {
  const usable = images.map((img, index) => ({ ...img, index })).filter(isUsable)
  const skipped = images.map((img, index) => (isUsable(img) ? -1 : index)).filter((index) => index >= 0)
  if (usable.length === 0) {
    return { canvasWidth: 0, canvasHeight: 0, placements: [], skipped }
  }

  const g = safeGap(gap)
  const cap = isValidMaxEdge(maxEdge) ? maxEdge : Number.POSITIVE_INFINITY

  if (direction === 'vertical') {
    // 统一宽度 = 所有图最大宽度，再用 maxEdge 封顶（至少 1px，maxEdge 填 0.3 也不能产出 0 宽画布）
    const maxWidth = Math.max(...usable.map((img) => img.width))
    const targetWidth = Math.max(1, Math.round(Math.min(maxWidth, cap)))

    const placements: StitchPlacement[] = []
    let y = 0
    for (const img of usable) {
      // 等比缩放：缩放后高度 = 原高 * 目标宽 / 原宽；极扁的图也至少留 1px
      const height = Math.max(1, Math.round((img.height * targetWidth) / img.width))
      placements.push({ index: img.index, x: 0, y, width: targetWidth, height })
      y += height + g
    }
    // 最后一张后面没有 gap，所以总高 = 各缩放高之和 + gap*(n-1)
    const canvasHeight = y - g
    return { canvasWidth: targetWidth, canvasHeight, placements, skipped }
  }

  // 横向：统一高度 = 所有图最大高度，再用 maxEdge 封顶
  const maxHeight = Math.max(...usable.map((img) => img.height))
  const targetHeight = Math.max(1, Math.round(Math.min(maxHeight, cap)))

  const placements: StitchPlacement[] = []
  let x = 0
  for (const img of usable) {
    // 等比缩放：缩放后宽度 = 原宽 * 目标高 / 原高
    const width = Math.max(1, Math.round((img.width * targetHeight) / img.height))
    placements.push({ index: img.index, x, y: 0, width, height: targetHeight })
    x += width + g
  }
  const canvasWidth = x - g
  return { canvasWidth, canvasHeight: targetHeight, placements, skipped }
}

/**
 * 把布局整体等比缩到 canvasWidth×canvasHeight（planCanvas 给出的「浏览器画得出的尺寸」）。
 *
 * 为什么按「边界」缩而不是逐个缩宽高：每张图的 x、width 各自取整，累加后接缝处会出现
 * 1px 的缝或重叠。先把每张图的左右（上下）边界乘比例再取整，宽度取边界之差，
 * 相邻两张图共享的位置取整结果一致，接缝和原布局一样整齐。最后 clamp 到画布内，防止取整越界 1px。
 */
export function scaleLayout(layout: StitchLayout, canvasWidth: number, canvasHeight: number): StitchLayout {
  if (layout.canvasWidth <= 0 || layout.canvasHeight <= 0) return layout
  const sx = canvasWidth / layout.canvasWidth
  const sy = canvasHeight / layout.canvasHeight
  const placements = layout.placements.map((p) => {
    const x = Math.min(canvasWidth, Math.round(p.x * sx))
    const y = Math.min(canvasHeight, Math.round(p.y * sy))
    const right = Math.min(canvasWidth, Math.round((p.x + p.width) * sx))
    const bottom = Math.min(canvasHeight, Math.round((p.y + p.height) * sy))
    return { index: p.index, x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
  })
  return { canvasWidth, canvasHeight, placements, skipped: layout.skipped }
}

export type ParsedNumber = { ok: true; value: number | null } | { ok: false; message: string }

/**
 * 解析「间隔」「最大边长」输入框。留空 → value: null（由调用方决定含义）；
 * 填了非数字、小数、负数或超上限 → 返回一句人话，不再静默当成 0 / 不设上限。
 * 旧实现 Number('abc') 得到 NaN，safeGap 悄悄按 0 处理，用户以为设了间隔其实没有。
 */
export function parseStitchNumber(text: string, label: string, min: number, max: number): ParsedNumber {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: `「${label}」请填 ${min}~${max} 的整数` }
  const value = Number(trimmed)
  if (value < min || value > max) return { ok: false, message: `「${label}」请填 ${min}~${max} 的整数` }
  return { ok: true, value }
}

/** 间隔上限：再大就不是「间隔」了；最大边长上限：canvas 单边上限 */
export const MAX_GAP = 1000
export const MAX_EDGE = 32767

/** 把第 index 项向前（delta=-1）或向后（delta=1）挪一位；越界时原样返回副本 */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  const next = [...items]
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** 间隔的底色。transparent 不填（PNG 里间隔是透明的） */
export type StitchBackground = 'transparent' | 'white' | 'black'

export function backgroundFill(bg: StitchBackground): string | null {
  if (bg === 'white') return '#ffffff'
  if (bg === 'black') return '#000000'
  return null
}
