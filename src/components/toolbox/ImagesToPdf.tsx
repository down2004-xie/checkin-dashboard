import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import {
  PAGE_MODES,
  buildPdf,
  displaySize,
  jpegColorSpace,
  makePage,
  movePage,
  parseJpegInfo,
  type PageMode,
  type PdfPage,
} from '../../lib/images-to-pdf'
import { FilePicker } from './FilePicker'
import '../../styles/tools/pdf-convert.css'

/** 一张已加载、可预览的图片。file 留着生成时读原始字节，img 留着走 canvas 时用 */
interface LoadedImage {
  id: string
  name: string
  url: string
  file: File
  /** 浏览器显示尺寸（已按 EXIF 转正） */
  width: number
  height: number
  img: HTMLImageElement
}

/** 把 File 读成已 onload 的 <img>，失败时 reject，调用方统一兜错误提示。 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/** canvas.toBlob 的回调式 API 包成 Promise；返回 null 表示浏览器拒绝编码。 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** 生成过程中的「这一张为什么不行」，带着原因一路抛到界面上 */
class PageError extends Error {}
/**
 * 一张图 → 一页。返回值里的 passthrough 表示「原 JPEG 字节直接进了 PDF」。
 *
 * 透传条件：文件头是能解析的 JPEG、颜色空间认得、按 EXIF 转正后的尺寸和浏览器显示的一致。
 * 最后一条是保险：万一解析有误或浏览器没按 EXIF 转，宁可退回 canvas 也不能让页面方向和预览不一样。
 */
async function toPage(item: LoadedImage, mode: PageMode): Promise<{ page: PdfPage; passthrough: boolean }> {
  const display = { width: item.width, height: item.height }
  const bytes = new Uint8Array(await item.file.arrayBuffer())
  const info = parseJpegInfo(bytes)
  const color = info ? jpegColorSpace(info) : null
  if (info && color) {
    const shown = displaySize(info)
    if (shown.width === display.width && shown.height === display.height) {
      const image = { bytes, width: info.width, height: info.height, ...color }
      return { page: makePage(image, display, info.orientation, mode), passthrough: true }
    }
  }

  // 非 JPEG（或 JPEG 但不适合透传）：canvas 画出来再编码成 JPEG。
  // 先过 canvas 上限：超限时浏览器不报错，只会编码出一张空白图
  const plan = planCanvas(display, canvasProbe)
  if (!plan) throw new PageError(`「${item.name}」${tooLargeMessage(display)}`)
  const canvas = document.createElement('canvas')
  canvas.width = plan.size.width
  canvas.height = plan.size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PageError('当前浏览器不支持 Canvas')
  // JPEG 不支持透明，先铺白底，否则透明区会变黑
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(item.img, 0, 0, canvas.width, canvas.height)
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
  canvas.width = 0 // 及时释放：几十张大图连着转，显存会先撑不住
  if (!blob || blob.type !== 'image/jpeg') throw new PageError(`「${item.name}」无法编码成 JPEG，当前浏览器不支持`)
  const encoded = new Uint8Array(await blob.arrayBuffer())
  // 编码尺寸是 canvas 的（可能被缩小过），页面尺寸仍按原图显示尺寸算，原尺寸模式页面大小不变
  const image = { bytes: encoded, width: plan.size.width, height: plan.size.height, colorSpace: 'DeviceRGB' as const }
  return { page: makePage(image, display, 1, mode), passthrough: false }
}

/**
 * 图片转 PDF 工具：多选图片 → 调顺序 → 每张一页打包成 PDF 下载。
 *
 * 分层：JPEG 头解析、页面几何、PDF 字节拼装都在 lib/images-to-pdf.ts（有单测），
 * 这里只做读文件 → 决定透传还是 canvas 重编码 → 调 buildPdf → 下载。全程本地处理，图片不上传。
 */
export function ImagesToPdf() {
  const [images, setImages] = useState<LoadedImage[]>([])
  const [mode, setMode] = useState<PageMode>('a4')
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // 记录所有创建过的 ObjectURL，卸载时统一释放，避免内存泄漏
  const urlsRef = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
  }, [])

  const handleFiles = async (files: File[]) => {
    setError(null)
    setSummary(null)
    const loaded: LoadedImage[] = []
    let firstFailure: File | null = null
    for (const file of files) {
      const url = URL.createObjectURL(file)
      urlsRef.current.add(url)
      try {
        const img = await loadImage(url)
        seqRef.current += 1
        loaded.push({ id: `img-${seqRef.current}`, name: file.name, url, file, width: img.naturalWidth, height: img.naturalHeight, img })
      } catch {
        URL.revokeObjectURL(url)
        urlsRef.current.delete(url)
        firstFailure ??= file
      }
    }
    // 部分失败也要说出是哪张、为什么（多半是 HEIC），成功的照常加进列表
    if (firstFailure) setError(unsupportedHint(firstFailure))
    if (loaded.length > 0) setImages((prev) => [...prev, ...loaded])
  }

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) {
        URL.revokeObjectURL(target.url)
        urlsRef.current.delete(target.url)
      }
      return prev.filter((item) => item.id !== id)
    })
    setSummary(null)
  }

  const move = (index: number, delta: -1 | 1) => {
    setImages((prev) => movePage(prev, index, delta))
    setSummary(null)
  }

  const generate = async () => {
    if (images.length === 0) {
      setError('请先选择图片')
      return
    }
    setError(null)
    setSummary(null)
    setWorking(true)
    try {
      const pages: PdfPage[] = []
      let passthrough = 0
      for (const item of images) {
        const result = await toPage(item, mode)
        pages.push(result.page)
        if (result.passthrough) passthrough += 1
      }
      const pdfBytes = buildPdf(pages)
      // Uint8Array 直接作为 BlobPart（二进制），MIME 设为 application/pdf 才能正确下载
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'images.pdf'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const converted = pages.length - passthrough
      setSummary(`已生成 ${pages.length} 页：${passthrough} 张 JPEG 原样嵌入（无损）` +
        (converted > 0 ? `，${converted} 张转成 JPEG 后嵌入` : ''))
    } catch (cause) {
      setError(cause instanceof PageError ? cause.message : '生成 PDF 失败，可能是图片太多或太大导致内存不足，请减少张数后再试')
    } finally {
      setWorking(false)
    }
  }
  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" multiple label="选择图片" onFiles={(files) => void handleFiles(files)} onReject={setError} />

      <div className="unit-row">
        <div className="unit-field">
          <span className="unit-field__label">页面</span>
          <div className="unit-row pdf-convert__modes">
            {PAGE_MODES.map((item) => (
              <button key={item.id} type="button" className={`chip${mode === item.id ? ' chip--active' : ''}`}
                aria-pressed={mode === item.id} onClick={() => { setMode(item.id); setSummary(null) }}>{item.label}</button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void generate()} disabled={images.length === 0 || working}>
          {working ? '生成中…' : `生成 PDF（${images.length} 页）`}
        </button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}
      {summary && <p className="hint pdf-convert__summary" role="status">{summary}</p>}

      {images.length > 0 && (
        <div className="compress-compare" aria-live="polite">
          {images.map((item, index) => (
            <figure key={item.id} className="compress-item">
              <img src={item.url} alt={item.name} />
              <figcaption>
                <span>第 {index + 1} 页 · {item.width}×{item.height}</span>
                <span className="pdf-convert__actions">
                  <button type="button" className="btn" onClick={() => move(index, -1)} disabled={index === 0}
                    aria-label={`上移 ${item.name}`}>上移</button>
                  <button type="button" className="btn" onClick={() => move(index, 1)} disabled={index === images.length - 1}
                    aria-label={`下移 ${item.name}`}>下移</button>
                  <button type="button" className="btn" onClick={() => removeImage(item.id)} aria-label={`移除 ${item.name}`}>
                    移除
                  </button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="hint">
        每张图片单独占一页，按上面的顺序排列。A4：竖版 A4，图片等比缩小、居中，留 0.5 英寸边距（小图不放大）；
        原尺寸：页面按 96dpi 换算成图片大小，特别长的图会等比缩小到 PDF 允许的 5 米以内。
        JPG 原样嵌入不再压缩；PNG、WebP 等会先转成 JPEG（透明处铺白）。图片只在本机处理，不会上传；刷新页面后清空。
      </p>
    </div>
  )
}
