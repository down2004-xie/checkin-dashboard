import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import { formatBytes } from '../../lib/image-compress'
import {
  IMAGE_FORMATS,
  canvasFailureMessage,
  downscaleNotice,
  fallbackNotice,
  getFormat,
  joinNotices,
  resolveOutput,
  swapExtension,
  type ImageFormat,
} from '../../lib/image-convert'
import { FilePicker } from './FilePicker'
import '../../styles/tools/image-convert.css'

interface Original {
  url: string
  size: number
  width: number
  height: number
}

interface Converted {
  url: string
  size: number
  width: number
  height: number
  /** 这次实际导出的格式（按 blob.type 判定，可能和下拉框不同） */
  format: ImageFormat
}

/**
 * 图片格式互转工具（PNG / JPEG / WebP）。
 *
 * 和「图片压缩」的区别：这里**不主动缩放**，专注换格式；支持转出 PNG（无损）。
 * 流程：读图 → 画到等尺寸 canvas → toBlob(目标 MIME, 质量) → 按 blob.type 定实际格式 → 预览下载。
 * 目标格式不支持透明（JPEG）时先铺白底，否则透明区会变黑。
 *
 * 几条防线（工具箱大修时补的）：
 * - 读图用递增序号 loadSeq：快速连选两张图时，晚到的旧 onload 不会覆盖新图
 * - 读图失败立刻清空旧图，否则界面还停在上一张、按钮可用，转出来的是旧图
 * - 结果的 blob URL 换图、重新转换、卸载时都 revoke
 */
export function ImageConvert() {
  const [fileName, setFileName] = useState('')
  const [original, setOriginal] = useState<Original | null>(null)
  const [targetMime, setTargetMime] = useState<ImageFormat['mime']>('image/png')
  const [quality, setQuality] = useState('0.92')
  const [result, setResult] = useState<Converted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const resultUrlRef = useRef<string | null>(null)
  const loadSeq = useRef(0)

  useEffect(() => () => {
    loadSeq.current += 1 // 卸载后还在路上的 onload / toBlob 一律作废
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
  }, [])

  const replaceResult = (next: Converted | null) => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    resultUrlRef.current = next?.url ?? null
    setResult(next)
  }

  const handleFile = (file: File) => {
    const seq = ++loadSeq.current
    setError(null)
    setNotice(null)
    replaceResult(null)
    // 先清旧图：新图加载失败时界面不能还停在上一张
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

  const convert = async () => {
    const img = imageRef.current
    const format = getFormat(targetMime)
    if (!img || !original || !format) { setError('请先选择图片'); return }
    const wanted = { width: img.naturalWidth, height: img.naturalHeight }
    // 建 canvas 之前先过上限：超限的 canvas 不报错，只会静默画成空图
    const plan = planCanvas(wanted, canvasProbe)
    if (!plan) { setError(tooLargeMessage(wanted)); return }
    const { size } = plan
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(canvasFailureMessage(size, 'context')); return }
    // 目标格式不支持透明时先铺白底（JPEG 的透明区会变黑）
    if (!format.supportsAlpha) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.drawImage(img, 0, 0, size.width, size.height)
    const seq = loadSeq.current
    setWorking(true)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format.mime, format.supportsQuality ? Number(quality) : undefined)
    })
    // 立刻释放画布占的内存，大图转完不该一直留着
    canvas.width = 0
    canvas.height = 0
    setWorking(false)
    if (seq !== loadSeq.current) return // 转换途中换了图：结果属于旧图，丢掉
    if (!blob) { setError(canvasFailureMessage(size, 'encode')); return }
    const output = resolveOutput(format.mime, blob.type)
    replaceResult({ url: URL.createObjectURL(blob), size: blob.size, width: size.width, height: size.height, format: output.format })
    setError(null)
    setNotice(joinNotices(output.fellBack ? fallbackNotice(format.mime, output.format) : null, downscaleNotice(wanted, size)))
  }

  const target = getFormat(targetMime)
  // 文件名和标签跟「这次实际导出的格式」走，不跟下拉框：改了下拉框还没重新转换时不能撒谎
  const downloadName = result ? swapExtension(fileName, result.format.ext) : ''

  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">输出格式</span>
          <select aria-label="输出格式" value={targetMime} onChange={(event) => setTargetMime(event.target.value as ImageFormat['mime'])}>
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
          <span className="compress-summary__ok">已转为 {result.format.label}</span>
          <a className="btn" href={result.url} download={downloadName}>下载 {downloadName}</a>
          {notice && <p className="image-convert__notice" role="status">{notice}</p>}
        </div>
      )}

      <p className="hint">PNG 无损可保留透明；JPEG 体积小但不支持透明（透明区会铺白底）；WebP 体积最小且支持透明（Safari 不支持导出 WebP，会如实提示）。图片只在本机处理，不会上传。</p>
    </div>
  )
}
