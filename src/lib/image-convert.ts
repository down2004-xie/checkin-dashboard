/* 图片格式互转 —— 纯函数（格式表 / 文件名扩展名替换 / 实际输出格式判定），可单测。
 * Canvas 转码在组件里，这里只放不碰 DOM 的可测逻辑。
 * 压缩、裁剪、水印三个工具的「导出格式」「toBlob 失败原因」也用这里的函数，保证说法一致。
 */

import { SAFE_LIMIT, exceedsLimit, tooLargeMessage, type Size } from './canvas-limits'

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

/** 去掉扩展名后的文件名，空名退回 fallback。下载名「原名-后缀.扩展名」用 */
export function baseName(fileName: string, fallback = 'image'): string {
  return fileName.replace(/\.[^./\\]+$/, '').trim() || fallback
}

export interface ResolvedOutput {
  /** toBlob 实际产出的格式 */
  format: ImageFormat
  /** 是否和请求的格式不一致（浏览器不支持编码该格式，静默退回了 PNG） */
  fellBack: boolean
}

/**
 * 按 blob.type 判定「这次实际导出的是什么格式」。
 *
 * 为什么要判：canvas.toBlob 遇到不支持编码的 MIME 不会报错，而是**静默退回 PNG**
 * （Safari 不支持编码 WebP 就是这样）。如果文件名照下拉框起成 .webp，
 * 用户拿到的是一个扩展名撒谎的 PNG，体积还可能比原图大好几倍。
 * blob.type 为空（极少数实现）时只能相信请求的格式；未知类型按 PNG 处理（规范规定的退回格式）。
 */
export function resolveOutput(requested: ImageFormat['mime'], blobType: string): ResolvedOutput {
  const want = getFormat(requested) ?? IMAGE_FORMATS[0]
  if (!blobType) return { format: want, fellBack: false }
  const actual = getFormat(blobType) ?? IMAGE_FORMATS[0]
  return { format: actual, fellBack: actual.mime !== want.mime }
}

/** 退回时给用户的说明。显示名用短名（PNG / JPEG / WebP），不带括号里的说明 */
export function fallbackNotice(requested: ImageFormat['mime'], actual: ImageFormat): string {
  const want = shortLabel(getFormat(requested) ?? IMAGE_FORMATS[0])
  return `这个浏览器不支持导出 ${want}，实际导出的是 ${shortLabel(actual)}，文件名已按 ${shortLabel(actual)} 命名。需要 ${want} 请换 Chrome / Edge / Firefox`
}

/** 格式短名：PNG / JPEG / WebP */
export function shortLabel(format: ImageFormat): string {
  return format.label.replace(/（.*$/, '')
}

/**
 * 裁剪、加水印这类「不换格式」的工具导出时用什么格式：跟随原图。
 * JPEG 照片导出成 PNG 体积会大好几倍；PNG 截图导出成 JPEG 会糊字、丢透明。
 * 原图是 GIF / BMP 等 canvas 编不出来的格式时退回 PNG（无损，保留透明）。
 */
export function exportFormatFor(sourceType: string): ImageFormat {
  const type = sourceType.toLowerCase()
  if (type === 'image/jpg' || type === 'image/pjpeg') return getFormat('image/jpeg')!
  return getFormat(type) ?? IMAGE_FORMATS[0]
}

export type CanvasFailure = 'context' | 'encode'

/**
 * getContext 返回 null 或 toBlob 返回 null 时，告诉用户真实原因。
 *
 * 两者最常见的原因都是「画布太大」：iOS Safari 超过 1600 多万像素时 getContext 直接给 null，
 * 内存紧张时 toBlob 回调给 null。超过保守上限就明说图太大；没超的话多半是内存不够，
 * 让用户先关掉别的标签页或缩小图片。不说「请重试」：同样的图重试一百次结果也一样。
 */
export function canvasFailureMessage(size: Size, stage: CanvasFailure): string {
  if (exceedsLimit(size, SAFE_LIMIT)) return tooLargeMessage(size)
  const what = stage === 'context' ? '没能创建' : '没能编码'
  return `浏览器${what} ${size.width}×${size.height} 的画布，通常是内存不够。请关掉其他标签页，或先把图片缩小后再试`
}

/**
 * planCanvas 把尺寸缩小了时的提示；没缩小返回 null。
 * 超过画布上限时选择「等比缩小 + 明说」而不是直接拒绝：iPhone 原图在 iOS Safari 上
 * 经常超过 1600 多万像素的上限，一律拒绝等于这个工具在手机上不能用。
 */
export function downscaleNotice(wanted: Size, actual: Size): string | null {
  if (actual.width >= wanted.width && actual.height >= wanted.height) return null
  return `${wanted.width}×${wanted.height} 超过了这台浏览器的画布上限，已等比缩小到 ${actual.width}×${actual.height} 导出`
}

/** 把几条可能为空的提示拼成一句；全空返回 null（界面据此决定渲不渲染提示行） */
export function joinNotices(...parts: (string | null)[]): string | null {
  const text = parts.filter((part): part is string => !!part).join('；')
  return text || null
}
