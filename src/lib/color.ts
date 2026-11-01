/* 颜色解析 / 互转 / WCAG 对比度 —— 纯函数，可单测。
 *
 * 内部统一用 RGBA 表示（r/g/b 是 0–255 的整数，a 是 0–1）。为什么取整：
 * 屏幕上真实存在的只有 8 位通道值，HEX 也只能表达整数；HSL 是从它派生出来的「看法」。
 * 用户输入 hsl() 时先换算成整数 RGB 再派生回 HSL，所以显示的 HSL 可能和输入差零点几，
 * 这是 8 位量化本身的误差，不是换算错了。
 *
 * 解析比 CSS 严格一点：通道超范围（rgb(300,0,0)）直接判非法，而不是像浏览器那样钳到 255。
 * 这是个工具，用户多半是手误，悄悄钳掉会让人以为自己输对了。
 */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Hsl {
  /** 色相 0–360（不含 360） */
  h: number
  /** 饱和度 0–100 */
  s: number
  /** 亮度 0–100 */
  l: number
}

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/

function parseNumber(text: string): number | null {
  return NUMBER.test(text) ? Number(text) : null
}

/** 百分比或数字。返回 [值, 是否带 %] */
function parseNumberOrPercent(text: string): [number, boolean] | null {
  const percent = text.endsWith('%')
  const value = parseNumber(percent ? text.slice(0, -1) : text)
  return value === null ? null : [value, percent]
}

/** rgb 通道：0–255 的数字或 0–100% */
function parseChannel(text: string): number | null {
  const parsed = parseNumberOrPercent(text)
  if (!parsed) return null
  const [value, percent] = parsed
  const max = percent ? 100 : 255
  if (value < 0 || value > max) return null
  // value * 255 / 100 而不是 value * 2.55：后者 50 * 2.55 = 127.4999…，会被舍成 127
  return Math.round(percent ? (value * 255) / 100 : value)
}

/** 透明度：0–1 的数字或 0–100% */
function parseAlpha(text: string): number | null {
  const parsed = parseNumberOrPercent(text)
  if (!parsed) return null
  const [value, percent] = parsed
  const alpha = percent ? value / 100 : value
  return alpha < 0 || alpha > 1 ? null : alpha
}

/** 色相：无单位按度；支持 deg / grad / rad / turn。归一到 [0, 360) */
function parseHue(text: string): number | null {
  const match = /^(.*?)(deg|grad|rad|turn)?$/.exec(text)
  if (!match) return null
  const value = parseNumber(match[1])
  if (value === null) return null
  const unit = match[2] ?? 'deg'
  const degrees = unit === 'turn' ? value * 360 : unit === 'rad' ? (value * 180) / Math.PI : unit === 'grad' ? value * 0.9 : value
  return ((degrees % 360) + 360) % 360
}

/** 饱和度 / 亮度：0–100，% 可写可不写（CSS Color 4 的空格语法允许不写） */
function parsePercent(text: string): number | null {
  const parsed = parseNumberOrPercent(text)
  if (!parsed) return null
  const [value] = parsed
  return value < 0 || value > 100 ? null : value
}

function parseHex(text: string): Rgba | null {
  const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (!match) return null
  let digits = match[1]
  // #rgb / #rgba 每位重复一次：#f80 = #ff8800
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
  const byte = (i: number) => parseInt(digits.slice(i, i + 2), 16)
  return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) / 255 : 1 }
}

/**
 * 把函数参数拆成 [3 个分量, 透明度?]。两种语法：
 * - 逗号（老语法）：rgba(255, 0, 0, 0.5)
 * - 空格 + 斜杠（CSS Color 4）：rgb(255 0 0 / 50%)
 * 两种不能混用（rgb(255, 0 0) 非法），和浏览器一致。
 */
function splitArgs(inner: string): { parts: string[]; alpha: string | null } | null {
  if (inner.includes(',')) {
    if (inner.includes('/')) return null
    const parts = inner.split(',').map((part) => part.trim())
    if (parts.length !== 3 && parts.length !== 4) return null
    if (parts.some((part) => part === '' || /\s/.test(part))) return null
    return { parts: parts.slice(0, 3), alpha: parts[3] ?? null }
  }
  const [main, alpha, extra] = inner.split('/').map((part) => part.trim())
  if (extra !== undefined || main === undefined) return null
  const parts = main.split(/\s+/).filter(Boolean)
  if (parts.length !== 3) return null
  if (alpha !== undefined && alpha === '') return null
  return { parts, alpha: alpha ?? null }
}

/** 解析 #rgb / #rgba / #rrggbb / #rrggbbaa / rgb[a]() / hsl[a]()。非法输入返回 null */
export function parseColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null
  const hex = parseHex(text)
  if (hex) return hex

  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(text)
  if (!fn) return null
  const args = splitArgs(fn[2])
  if (!args) return null
  const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha)
  if (alpha === null) return null

  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = args.parts.map(parseChannel)
    if (r === null || g === null || b === null) return null
    return { r, g, b, a: alpha }
  }
  const h = parseHue(args.parts[0])
  const s = parsePercent(args.parts[1])
  const l = parsePercent(args.parts[2])
  if (h === null || s === null || l === null) return null
  return { ...hslToRgb({ h, s, l }), a: alpha }
}
// ---------- RGB ↔ HSL ----------

/** HSL → RGB（整数通道）。标准的「色相扇区」公式，见 CSS Color 4 §7 hslToRgb 参考实现 */
export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const sat = s / 100
  const light = l / 100
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const a = sat * Math.min(light, 1 - light)
    // + 0 把 -0 变成 0：浮点误差会让纯黑通道算出 -1e-17，Math.round 后是 -0
    return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))) + 0
  }
  return { r: channel(0), g: channel(8), b: channel(4) }
}

/** RGB → HSL（不取整，显示时再由 formatHsl 保留一位小数） */
export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l: l * 100 } // 灰色：色相无意义，约定为 0
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h = (h * 60 + 360) % 360
  return { h, s: s * 100, l: l * 100 }
}

// ---------- 格式化 ----------

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
/** 最多一位小数，去掉多余的 0（12.0 → 12） */
const tidy = (n: number) => String(Math.round(n * 10) / 10)
/** 透明度最多三位小数 */
const tidyAlpha = (a: number) => String(Math.round(a * 1000) / 1000)

/** #rrggbb；不透明度 < 1 时输出 #rrggbbaa */
export function formatHex(color: Rgba): string {
  const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`
  return color.a < 1 ? base + hex2(color.a * 255) : base
}

/** 用逗号老语法输出：所有浏览器和大多数设计工具都认 */
export function formatRgb(color: Rgba): string {
  return color.a < 1
    ? `rgba(${color.r}, ${color.g}, ${color.b}, ${tidyAlpha(color.a)})`
    : `rgb(${color.r}, ${color.g}, ${color.b})`
}

export function formatHsl(color: Rgba): string {
  const { h, s, l } = rgbToHsl(color)
  const body = `${tidy(h) === '360' ? '0' : tidy(h)}, ${tidy(s)}%, ${tidy(l)}%`
  return color.a < 1 ? `hsla(${body}, ${tidyAlpha(color.a)})` : `hsl(${body})`
}

// ---------- WCAG 2.x 对比度 ----------
//
// 公式出处：WCAG 2.2 术语表（https://www.w3.org/TR/WCAG22/#dfn-relative-luminance、#dfn-contrast-ratio）
//   通道先除以 255 得 c，再做 sRGB 线性化：c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4
//   相对亮度 L = 0.2126 R + 0.7152 G + 0.0722 B
//   对比度 = (L亮 + 0.05) / (L暗 + 0.05)，范围 1–21
// 阈值说明：WCAG 2.0 原文写的是 0.03928（来自 sRGB 早期草案），后续版本改成 sRGB 标准（IEC 61966-2-1）的 0.04045。
// 8 位通道里 c 只能取 k/255，落在 0.03928 和 0.04045 之间的值一个都没有（10/255≈0.0392、11/255≈0.0431），
// 两个阈值算出来完全一样，这里用标准值。
// 判定线：1.4.3（AA）正文 4.5、大字 3；1.4.6（AAA）正文 7、大字 4.5。
// 「大字」= 至少 18pt（约 24px），或至少 14pt（约 18.66px）且加粗。

function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * 半透明的前景先叠到背景上再算（WCAG 只定义了不透明颜色的对比度）。
 * 背景本身也半透明时，它下面是什么页面不知道，这里按白底合成 —— 组件会提示这一点。
 * 合成在 sRGB 编码值上做，和浏览器默认的混合方式一致。
 */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const base = bottom.a < 1 ? composite(bottom, { r: 255, g: 255, b: 255, a: 1 }) : bottom
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a))
  return { r: mix(top.r, base.r), g: mix(top.g, base.g), b: mix(top.b, base.b), a: 1 }
}

/** 文字色 fg 在背景色 bg 上的对比度（1–21） */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const background = bg.a < 1 ? composite(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg
  const foreground = composite(fg, background)
  const l1 = relativeLuminance(foreground)
  const l2 = relativeLuminance(background)
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (light + 0.05) / (dark + 0.05)
}

export interface WcagVerdict {
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
}

/**
 * 用**未取整**的比值和阈值比。WCAG 明确说不许四舍五入：4.499:1 不算达到 4.5:1。
 * 所以 #777 在白底上（4.478）不过 AA，哪怕某些工具把它显示成「4.5」。
 */
export function wcagVerdict(ratio: number): WcagVerdict {
  return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5 }
}

/** 显示用：向下截到两位小数，保证「显示 4.50 就一定过 4.5」，不会出现显示和判定打架 */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2)
}
