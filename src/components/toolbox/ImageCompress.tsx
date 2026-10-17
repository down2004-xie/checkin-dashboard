import { useEffect, useRef, useState } from 'react'

import { compressionRatio, fitDimensions, formatBytes } from '../../lib/image-compress'

interface Compressed {
  url: string
  size: number
  width: number
  height: number
}

/**
 * 图片压缩工具。
 *
 * 分层：尺寸/体积/压缩率的计算在 lib/image-compress.ts（有单测），
 * 这里负责读文件 → 建 Image → 等比缩放到 canvas → toBlob(类型, 质量) → 预览下载。
 * 全程本地，图片不上传。
 *
 * 注意 toBlob 是异步的（回调），且质量参数只对 jpeg/webp 生效，png 会忽略。
 */
export function ImageCompress() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<{ url: string; size: number; width: number; height: number } | null>(null)
  const [maxEdge, setMaxEdge] = useState('1920')
  const [quality, setQuality] = useState('0.8')
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp'>('image/jpeg')
  const [result, setResult] = useState<Compressed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

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

  const compress = async () => {
    const img = imageRef.current
    if (!img || !original) { setError('请先选择图片'); return }
    const dims = fitDimensions(img.naturalWidth, img.naturalHeight, Number(maxEdge))
    const canvas = document.createElement('canvas')
    canvas.width = dims.width
    canvas.height = dims.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    // jpeg 不支持透明，先铺白底，否则透明区会变黑
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, dims.width, dims.height)
    }
    ctx.drawImage(img, 0, 0, dims.width, dims.height)
    setWorking(true)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, Number(quality)))
    setWorking(false)
    if (!blob) { setError('压缩失败，请重试'); return }
    setResult({ url: URL.createObjectURL(blob), size: blob.size, width: dims.width, height: dims.height })
    setError(null)
  }

  const ratio = original && result ? compressionRatio(original.size, result.size) : 0
  const ext = format === 'image/webp' ? 'webp' : 'jpg'

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">长边最大（px）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="长边最大" value={maxEdge} onChange={(event) => setMaxEdge(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">质量 {Math.round(Number(quality) * 100)}%</span>
          <input type="range" min="0.1" max="1" step="0.05" aria-label="质量" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">输出格式</span>
          <select aria-label="输出格式" value={format} onChange={(event) => setFormat(event.target.value as 'image/jpeg' | 'image/webp')}>
            <option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option>
          </select></label>
        <button type="button" className="btn btn--primary" onClick={() => void compress()} disabled={!original || working}>{working ? '压缩中…' : '压缩'}</button>
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
              <img src={result.url} alt="压缩后" />
              <figcaption>压缩后 · {result.width}×{result.height} · <strong>{formatBytes(result.size)}</strong></figcaption>
            </figure>
          )}
        </div>
      )}

      {result && (
        <div className="compress-summary" aria-live="polite">
          {ratio > 0
            ? <span className="compress-summary__ok">体积减少 {Math.round(ratio * 100)}%</span>
            : <span className="compress-summary__warn">没有变小（{Math.round(-ratio * 100)}% 增大），试试调低质量或尺寸</span>}
          <a className="btn" href={result.url} download={`${fileName.replace(/\.[^./\\]+$/, '') || 'compressed'}-compressed.${ext}`}>下载压缩图</a>
        </div>
      )}

      <p className="hint">按长边等比缩放（不放大），再按质量重新编码。PNG 转 JPEG/WebP 会丢失透明背景。图片只在本机处理，不会上传。</p>
    </div>
  )
}
