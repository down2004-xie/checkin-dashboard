import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import { compressionRatio, fitDimensions, formatBytes, parseMaxEdge } from '../../lib/image-compress'
import {
  baseName,
  canvasFailureMessage,
  downscaleNotice,
  fallbackNotice,
  getFormat,
  joinNotices,
  resolveOutput,
  type ImageFormat,
} from '../../lib/image-convert'
import { FilePicker } from './FilePicker'
import '../../styles/tools/image-compress.css'

type CompressMime = 'image/jpeg' | 'image/webp'

interface Original {
  url: string
  size: number
  width: number
  height: number
}

interface Compressed {
  url: string
  size: number
  width: number
  height: number
  /** 这次压缩实际产出的格式（按 blob.type 判定）。下载名和标签读它，不读当前下拉框 */
  format: ImageFormat
}

/**
 * 图片压缩工具。
 *
 * 分层：尺寸/体积/压缩率/输入解析在 lib/image-compress.ts（有单测），
 * 这里负责读文件 → 建 Image → 等比缩放到 canvas → toBlob(类型, 质量) → 预览下载。
 * 全程本地，图片不上传。
 *
 * 注意 toBlob 是异步的（回调），质量参数只对 jpeg/webp 生效；
 * 浏览器不支持编码 WebP（Safari）时会静默退回 PNG，所以结果格式一律按 blob.type 判定。
 */
export function ImageCompress() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<Original | null>(null)
  const [maxEdge, setMaxEdge] = useState('1920')
  const [quality, setQuality] = useState('0.8')
  const [format, setFormat] = useState<CompressMime>('image/jpeg')
  const [result, setResult] = useState<Compressed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)
  // 递增的请求序号：快速连选两张图时，晚到的旧 onload / toBlob 回调对不上号就丢弃
  const loadSeq = useRef(0)

  useEffect(() => () => {
    loadSeq.current += 1
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
  }, [])

  const replaceResult = (next: Compressed | null) => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    resultUrlRef.current = next?.url ?? null
    setResult(next)
  }

  const handleFile = (file: File) => {
    const seq = ++loadSeq.current
    setError(null)
    setNotice(null)
    replaceResult(null)
    // 先清旧图：新图加载失败时界面不能还停在上一张、按钮还能点
    imageRef.current = null
    setOriginal(null)
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    const url = URL.createObjectURL(file)
    sourceUrlRef.current = url
    const img = new Image()
    img.onload = () => {
      if (seq !== loadSeq.current) return
      imageRef.current = img
      setFileName(file.name)
      setOriginal({ url, size: file.size, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (seq !== loadSeq.current) return
      setError(unsupportedHint(file))
    }
    img.src = url
  }

  const compress = async () => {
    const img = imageRef.current
    const target = getFormat(format)
    if (!img || !original || !target) { setError('请先选择图片'); return }
    const edge = parseMaxEdge(maxEdge)
    if (edge === null) { setError('「长边最大」请填一个正整数（单位 px），例如 1920'); return }
    const wanted = fitDimensions(img.naturalWidth, img.naturalHeight, edge)
    const plan = planCanvas(wanted, canvasProbe)
    if (!plan) { setError(tooLargeMessage(wanted)); return }
    const { size } = plan
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(canvasFailureMessage(size, 'context')); return }
    // 只有 JPEG 不支持透明，先铺白底，否则透明区会变黑；WebP 保留透明
    if (!target.supportsAlpha) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.drawImage(img, 0, 0, size.width, size.height)
    const seq = loadSeq.current
    setWorking(true)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, target.mime, Number(quality)))
    canvas.width = 0
    canvas.height = 0
    setWorking(false)
    if (seq !== loadSeq.current) return // 压缩途中换了图：结果属于旧图，丢掉
    if (!blob) { setError(canvasFailureMessage(size, 'encode')); return }
    const output = resolveOutput(target.mime, blob.type)
    replaceResult({ url: URL.createObjectURL(blob), size: blob.size, width: size.width, height: size.height, format: output.format })
    setError(null)
    setNotice(joinNotices(output.fellBack ? fallbackNotice(target.mime, output.format) : null, downscaleNotice(wanted, size)))
  }

  const ratio = original && result ? compressionRatio(original.size, result.size) : 0
  const base = baseName(fileName, 'compressed')

  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">长边最大（px）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="长边最大" value={maxEdge} onChange={(event) => setMaxEdge(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">质量 {Math.round(Number(quality) * 100)}%</span>
          <input type="range" min="0.1" max="1" step="0.05" aria-label="质量" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">输出格式</span>
          <select aria-label="输出格式" value={format} onChange={(event) => setFormat(event.target.value as CompressMime)}>
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
              <figcaption>压缩后 · {result.format.ext.toUpperCase()} · {result.width}×{result.height} · <strong>{formatBytes(result.size)}</strong></figcaption>
            </figure>
          )}
        </div>
      )}

      {result && original && (
        <div className="compress-summary" aria-live="polite">
          {ratio > 0 ? (
            <>
              <span className="compress-summary__ok">体积减少 {Math.round(ratio * 100)}%</span>
              <a className="btn" href={result.url} download={`${base}-compressed.${result.format.ext}`}>下载压缩图（{result.format.ext.toUpperCase()}）</a>
            </>
          ) : (
            // 压缩后没变小：默认递给用户的是原图，压缩图降级成次要链接
            <>
              <span className="compress-summary__warn">压缩后反而{ratio < 0 ? `大了 ${Math.round(-ratio * 100)}%` : '一样大'}，建议保留原图；想继续压可调低质量或尺寸</span>
              <a className="btn btn--primary" href={original.url} download={fileName || 'original'}>下载原图</a>
              <a className="image-compress__secondary" href={result.url} download={`${base}-compressed.${result.format.ext}`}>仍然下载压缩图（{formatBytes(result.size)}）</a>
            </>
          )}
          {notice && <p className="image-compress__notice" role="status">{notice}</p>}
        </div>
      )}

      <p className="hint">按长边等比缩放（不放大），再按质量重新编码。JPEG 不支持透明，透明区会铺白底；WebP 保留透明。图片只在本机处理，不会上传。</p>
    </div>
  )
}
