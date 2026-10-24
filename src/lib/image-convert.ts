/* 图片格式互转 —— 纯函数（格式表 / 文件名扩展名替换），可单测。
 * Canvas 转码在组件里，这里只放不碰 DOM 的可测逻辑。
 */

/** 一个可转换的目标格式 */
export interface ImageFormat {
  /** canvas.toBlob 用的 MIME */
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  /** 界面显示名 */
  label: string
  /** 下载文件扩展名（不含点） */
  ext: string
  /** 该格式是否支持质量参数（png 无损，忽略质量） */
  supportsQuality: boolean
  /** 该格式是否支持透明通道 */
  supportsAlpha: boolean
}

/** 支持的输出格式。顺序即界面展示顺序。 */
export const IMAGE_FORMATS: ImageFormat[] = [
  { mime: 'image/png', label: 'PNG（无损，支持透明）', ext: 'png', supportsQuality: false, supportsAlpha: true },
  { mime: 'image/jpeg', label: 'JPEG（有损，体积小，无透明）', ext: 'jpg', supportsQuality: true, supportsAlpha: false },
  { mime: 'image/webp', label: 'WebP（体积更小，支持透明）', ext: 'webp', supportsQuality: true, supportsAlpha: true },
]

/** 按 MIME 取格式定义；找不到返回 null */
export function getFormat(mime: string): ImageFormat | null {
  return IMAGE_FORMATS.find((format) => format.mime === mime) ?? null
}

/**
 * 把文件名的扩展名替换成新的。
 * 原名没有扩展名时直接补上；纯空名退回 'image'。
 * 例：'photo.png' + 'jpg' → 'photo.jpg'；'photo' + 'webp' → 'photo.webp'
 */
export function swapExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '').trim() || 'image'
  return `${base}.${ext}`
}
