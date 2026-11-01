/* 二维码工具的纯逻辑 —— 纯函数，可单测。编码 / 解码本身交给 qrcode / jsqr 库，这里只放
 * 「库不管、但用户会踩」的部分：纠错级别说明、对比度警告、库报错转人话、识别结果能不能做成链接、
 * 大图识别前的缩放尺寸。
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H'

export interface EcLevelInfo {
  level: EcLevel
  /** 最多能恢复的码字比例（ISO/IEC 18004 规定的近似值） */
  recovery: string
  note: string
}

/**
 * 纠错级别：级别越高，污损一部分也能扫出来，但同样内容需要更多模块（码更密、能装的字更少）。
 * 默认 M：屏幕展示和普通打印够用；要在中间贴 logo 或印在易磨损的地方才需要 H。
 */
export const EC_LEVELS: readonly EcLevelInfo[] = [
  { level: 'L', recovery: '约 7%', note: '码最稀疏、装得最多，适合屏幕上展示的长网址' },
  { level: 'M', recovery: '约 15%', note: '默认，日常打印和屏幕展示都够用' },
  { level: 'Q', recovery: '约 25%', note: '印在容易弄脏、磨损的地方' },
  { level: 'H', recovery: '约 30%', note: '最耐污损，中间要贴 logo 时选它，但码最密' },
]

/** 把输入框里的数字收进 [min, max] 的整数，非数字时用 fallback */
export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 解析 #rrggbb / #rgb（<input type="color"> 只会给 #rrggbb，#rgb 是给单测和手输留的） */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  if (short) return { r: parseInt(short[1] + short[1], 16), g: parseInt(short[2] + short[2], 16), b: parseInt(short[3] + short[3], 16) }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!long) return null
  return { r: parseInt(long[1], 16), g: parseInt(long[2], 16), b: parseInt(long[3], 16) }
}

/** WCAG 相对亮度（0 = 纯黑，1 = 纯白）。公式出处：WCAG 2.2 术语表 relative luminance */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * 低于这个对比度就提示「可能扫不出来」。这是经验阈值，不是标准：
 * 扫码软件先把图二值化，前景背景亮度太接近时分不清哪块是模块。
 * 黑 / 中灰（约 5:1）主流扫码都能读；粉 / 白（约 1.6:1）基本读不出。
 */
export const MIN_QR_CONTRAST = 3

/**
 * 前景 / 背景颜色的扫码风险提示，没有风险返回 null。
 * 两种风险：对比度太低；前景比背景亮（反色码，不少扫码软件只认「深色码、浅色底」）。
 */
export function contrastWarning(foreground: string, background: string): string | null {
  const fg = parseHexColor(foreground)
  const bg = parseHexColor(background)
  if (!fg || !bg) return null
  const lf = luminance(fg)
  const lb = luminance(bg)
  const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)
  if (ratio < MIN_QR_CONTRAST) return `前景和背景对比度只有 ${ratio.toFixed(1)}:1，很多扫码软件会认不出来。建议用深色码、浅色底`
  if (lf > lb) return '前景比背景亮（反色二维码），部分扫码软件不认。建议用深色码、浅色底'
  return null
}

/**
 * qrcode 库抛出的错误转成人话。库的原文是英文（如
 * "The amount of data is too big to be stored in a QR Code"），用户看不懂也不知道怎么办。
 */
export function qrErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/too big/i.test(message)) return '内容太长，装不进一个二维码。换低一点的纠错级别（如 L），或缩短内容'
  if (/no input/i.test(message)) return '请先输入要生成二维码的内容'
  return '二维码生成失败，请检查内容后重试'
}

/** 等比缩小到长边不超过 maxSide（不放大）。jsQR 逐像素扫描，大图很慢，而二维码不需要那么多像素 */
export function fitLongSide(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface SafeLink {
  /** 规范化后的地址，可以放进 href */
  href: string
  /** 真正要去的主机名。国际化域名会显示成 xn-- 形式，冒充字形（如西里尔字母 а）一眼就露馅 */
  host: string
  /** 网址里带了「用户名@」：`https://bank.com@evil.com` 实际去的是 evil.com，常见钓鱼手法 */
  hasCredentials: boolean
}

/**
 * 识别出的文本能不能安全地渲染成「打开链接」按钮。不能时返回 null，界面只显示纯文本。
 *
 * 为什么要这么严：二维码内容是陌生人给的。`javascript:alert(1)` 渲染成 <a href> 被点一下
 * 就会在本站页面里执行脚本；`data:` / `file:` / 自定义协议也各有花样。所以只放行 http(s)，
 * 而且要求整段文本就是一个网址（中间不能有空白或控制字符）——「说明文字 + 网址」混排的内容
 * 不猜哪一段是网址，用户可以自己复制。
 */
export function safeLink(text: string): SafeLink | null {
  const trimmed = text.trim()
  // 先用正则卡协议头：new URL 本身会接受 javascript: / data: 等任何协议
  if (!/^https?:\/\//i.test(trimmed)) return null
  // 空白和控制字符（含 \u0000、换行、DEL）：浏览器解析 URL 时会悄悄删掉它们，显示和实际去向会不一致
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return { href: url.href, host: url.hostname, hasCredentials: url.username !== '' || url.password !== '' }
}
