/**
 * 时间驱动的配色（沉浸光感的主力）。
 *
 * 为什么放在 lib 而不是直接写进 hook：
 * 这是纯函数（输入小时数 → 输出色板），可以单测，
 * 而 hook 只负责「把结果写到 CSS 变量上」这件副作用。
 */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export interface Palette {
  /** 页面背景渐变的三个色标 */
  bg1: string
  bg2: string
  bg3: string
  /** 指针光源的颜色 */
  glow: string
  /** 主题色（进度条、勾选态） */
  accent: string
}

/**
 * 四套色板。
 *
 * 配色原则：都保持在深色调，只改色相和明度。
 * 如果白天切成亮色主题，玻璃卡片的半透明白底会失去对比，
 * 整个视觉体系要重做 —— 那是 v2 的事，v1 只在深色系内变化。
 */
export const PALETTES: Record<DayPhase, Palette> = {
  // 清晨 5:00–8:59 —— 偏紫的冷调，天刚亮
  dawn: {
    bg1: '#0d0f22',
    bg2: '#1c1836',
    bg3: '#2a1b3d',
    glow: 'rgba(167, 139, 250, 0.16)',
    accent: '#a78bfa',
  },
  // 白天 9:00–16:59 —— 清亮的蓝，精神最集中的时段
  day: {
    bg1: '#0a1220',
    bg2: '#132541',
    bg3: '#0e1b33',
    glow: 'rgba(96, 165, 250, 0.15)',
    accent: '#60a5fa',
  },
  // 黄昏 17:00–19:59 —— 暖橙，一天收尾
  dusk: {
    bg1: '#140f1c',
    bg2: '#2d1a2e',
    bg3: '#3d1f28',
    glow: 'rgba(251, 146, 60, 0.15)',
    accent: '#fb923c',
  },
  // 夜晚 20:00–4:59 —— 深蓝近黑，最沉静
  night: {
    bg1: '#070a14',
    bg2: '#0e1424',
    bg3: '#131024',
    glow: 'rgba(129, 140, 248, 0.13)',
    accent: '#818cf8',
  },
}

/**
 * 根据小时数（0-23）判断所处时段。
 *
 * 边界归属：每段左闭右开，且四段无缝覆盖 0-23，不存在落空的小时。
 * 单测会遍历 0-23 确保每一小时都有归属 —— 这是防止「某个小时没配色」
 * 这种只在特定时间才暴露的 bug。
 */
export function phaseForHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 9) return 'dawn'
  if (hour >= 9 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

/** 取当前时刻对应的色板 */
export function paletteForNow(now: Date = new Date()): Palette {
  return PALETTES[phaseForHour(now.getHours())]
}
