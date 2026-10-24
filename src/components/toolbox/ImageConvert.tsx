import { useEffect, useRef, useState } from 'react'

import { IMAGE_FORMATS, getFormat, swapExtension } from '../../lib/image-convert'
import { formatBytes } from '../../lib/image-compress'

interface Converted {
  url: string
  size: number
  width: number
  height: number
}

/**
 * 图片格式互转工具（PNG / JPEG / WebP）。
 *
 * 和「图片压缩」的区别：这里**不缩放**，专注换格式；支持转出 PNG（无损）。
 * 流程：读图 → 画到等尺寸 canvas → toBlob(目标 MIME, 质量) → 预览下载。
 * 目标格式不支持透明（JPEG）时先铺白底，否则透明区会变黑。
 */
export function ImageConvert() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<{ url: string; size: number; width: number; height: number } | null>(null)
  const [targetMime, setTargetMime] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png')
  const [quality, setQuality] = useState('0.92')
  const [result, setResult] = useState<Converted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  const handleFile = (file: File) => {
    setError(null)
    setResult(null)
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setFileName(file.name)
      setOriginal({ url, size: file.size, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => setError('图片加载失败，请换一张试试')
    img.src = url
  }

  const convert = async () => {
    const img = imageRef.current
    if (!img || !original) { setError('请先选择图片'); return }
    const format = getFormat(targetMime)
    if (!format) { setError('未知的目标格式'); return }
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    // 目标格式不支持透明时先铺白底（JPEG 的透明区会变黑）
    if (!format.supportsAlpha) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0)
    setWorking(true)
    const blob = await new Promise<Blob | null>((resolve) => {
      // png 忽略质量参数，传了也无妨；这里按需传
      canvas.toBlob(resolve, format.mime, format.supportsQuality ? Number(quality) : undefined)
    })
    setWorking(false)
    if (!blob) { setError('转换失败，请重试'); return }
    setResult({ url: URL.createObjectURL(blob), size: blob.size, width: canvas.width, height: canvas.height })
    setError(null)
  }

  const target = getFormat(targetMime)
  const downloadName = swapExtension(fileName, target?.ext ?? 'png')

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">输出格式</span>
          <select aria-label="输出格式" value={targetMime} onChange={(event) => setTargetMime(event.target.value as typeof targetMime)}>
            {IMAGE_FORMATS.map((format) => <option key={format.mime} value={format.mime}>{format.label}</option>)}
          </select></label>
        {target?.supportsQuality && (
          <label className="unit-field"><span className="unit-field__label">质量 {Math.round(Number(quality) * 100)}%</span>
            <input type="range" min="0.3" max="1" step="0.02" aria-label="质量" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        )}
        <button type="button" className="btn btn--primary" onClick={() => void convert()} disabled={!original || working}>{working ? '转换中…' : '转换'}</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {original && (
        <div className="compress-compare">
          <figure className="compress-item">
            <img src={original.url} alt="原图" />
            <figcaption>原图 · {original.width}×{original.height} · {formatBytes(original.size)}</figcaption>
          </figure>
          {result && (
            <figure className="compress-item">
              <img src={result.url} alt="转换后" />
              <figcaption>转换后 · {result.width}×{result.height} · <strong>{formatBytes(result.size)}</strong></figcaption>
            </figure>
          )}
        </div>
      )}

      {result && (
        <div className="compress-summary" aria-live="polite">
          <span className="compress-summary__ok">已转为 {target?.label}</span>
          <a className="btn" href={result.url} download={downloadName}>下载 {downloadName}</a>
        </div>
      )}

      <p className="hint">PNG 无损可保留透明；JPEG 体积小但不支持透明（会铺白底）；WebP 体积最小且支持透明。图片只在本机处理，不会上传。</p>
    </div>
  )
}
