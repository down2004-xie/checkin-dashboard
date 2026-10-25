import { useEffect, useRef, useState } from 'react'

import { buildPdf, type PdfImage } from '../../lib/images-to-pdf'

/** 一张已加载、可预览的图片。img 留着生成时再画到 canvas。 */
interface LoadedImage {
  id: string
  name: string
  url: string
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

/**
 * 图片转 PDF 工具：多选图片 → 每张重编码成 JPEG → 打包成一个多页 PDF 下载。
 *
 * 分层：PDF 字节怎么拼在 lib/images-to-pdf.ts（有单测），这里只做
 * 读文件 → canvas 重编码为 JPEG（PDF 的 DCTDecode 只吃 JPEG）→ 调 buildPdf → 下载。
 * 全程本地处理，图片不上传。
 *
 * 为什么要 canvas 重编码：用户可能选 PNG/WebP，而 PDF 里最省事的内嵌方式是
 * 直接塞 JPEG 字节（DCTDecode），不用在 PDF 里存像素。统一转 JPEG 让 lib 只需处理一种格式。
 */
export function ImagesToPdf() {
  const [images, setImages] = useState<LoadedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // 记录所有创建过的 ObjectURL，卸载时统一释放，避免内存泄漏
  const urlsRef = useRef<Set<string>>(new Set())
  const seqRef = useRef(0)

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
  }, [])

  const handleFiles = async (fileList: FileList) => {
    setError(null)
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) {
      setError('请选择图片文件（PNG / JPG / WebP 等）')
      return
    }
    const loaded: LoadedImage[] = []
    for (const file of files) {
      const url = URL.createObjectURL(file)
      urlsRef.current.add(url)
      try {
        const img = await loadImage(url)
        seqRef.current += 1
        loaded.push({
          id: `img-${seqRef.current}`,
          name: file.name,
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
          img,
        })
      } catch {
        URL.revokeObjectURL(url)
        urlsRef.current.delete(url)
      }
    }
    if (loaded.length === 0) {
      setError('图片加载失败，请换几张试试')
      return
    }
    setImages((prev) => [...prev, ...loaded])
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
  }

  const generate = async () => {
    if (images.length === 0) {
      setError('请先选择图片')
      return
    }
    setError(null)
    setWorking(true)
    try {
      const pdfImages: PdfImage[] = []
      for (const item of images) {
        const canvas = document.createElement('canvas')
        canvas.width = item.width
        canvas.height = item.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setError('当前浏览器不支持 Canvas')
          return
        }
        // JPEG 不支持透明，先铺白底，否则透明区会变黑
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, item.width, item.height)
        ctx.drawImage(item.img, 0, 0)
        const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9)
        if (!blob) {
          setError('图片编码失败，请重试')
          return
        }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        pdfImages.push({ bytes, width: item.width, height: item.height })
      }

      const pdfBytes = buildPdf(pdfImages)
      // Uint8Array 直接作为 BlobPart（二进制），MIME 设为 application/pdf 才能正确下载
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'images.pdf'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('生成 PDF 失败，请重试')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片（可多选）</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="site-form__input"
          aria-label="选择图片"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) void handleFiles(files)
            event.target.value = ''
          }}
        />
      </label>

      <div className="unit-row">
        <button type="button" className="btn btn--primary" onClick={() => void generate()} disabled={images.length === 0 || working}>
          {working ? '生成中…' : `生成 PDF（${images.length} 页）`}
        </button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {images.length > 0 && (
        <div className="compress-compare" aria-live="polite">
          {images.map((item, index) => (
            <figure key={item.id} className="compress-item">
              <img src={item.url} alt={item.name} />
              <figcaption>
                第 {index + 1} 页 · {item.width}×{item.height}
                <button type="button" className="btn" onClick={() => removeImage(item.id)} aria-label={`移除 ${item.name}`}>
                  移除
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="hint">
        每张图片会重编码为 JPEG 并单独占一页，按图片原始像素尺寸生成页面。图片只在本机处理，不会上传；刷新页面后清空。
      </p>
    </div>
  )
}
