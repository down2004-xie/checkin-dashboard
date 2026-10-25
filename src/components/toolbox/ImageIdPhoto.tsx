import { useCallback, useEffect, useRef, useState } from 'react'

import {
  BG_COLORS,
  ID_PHOTO_SIZES,
  centerCropRect,
  estimateBackgroundColor,
  replaceBackground,
  type Rgb,
} from '../../lib/id-photo'

/**
 * 证件照处理工具：把接近纯色的背景换成白/蓝/红，并裁成标准证件尺寸。
 *
 * 能力边界：按颜色距离近似换背景，只适合背景干净、颜色均匀的照片。
 * 复杂背景（阴影/渐变/杂物）效果有限，边缘偏硬 —— 纯前端无 AI 模型，这是诚实上限。
 * 界面里有明确提示。
 */
export function ImageIdPhoto() {
  const [fileName, setFileName] = useState('')
  const [sizeId, setSizeId] = useState('one')
  const [bgId, setBgId] = useState('white')
  const [tolerance, setTolerance] = useState('40')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [detectedBg, setDetectedBg] = useState<Rgb | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  const handleFile = (file: File) => {
    setError(null)
    setPreviewUrl(null)
    setDetectedBg(null)
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => {
      setFileName(file.name)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
      ctx.drawImage(img, 0, 0)
      sourceCanvasRef.current = canvas
      // 采样四角附近区域估背景色
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const w = canvas.width
      const h = canvas.height
      const samples: Rgb[] = []
      const patch = Math.max(1, Math.min(20, Math.floor(Math.min(w, h) * 0.05)))
      const corners = [[0, 0], [w - patch, 0], [0, h - patch], [w - patch, h - patch]]
      for (const [cx, cy] of corners) {
        for (let y = cy; y < cy + patch; y += 2) {
          for (let x = cx; x < cx + patch; x += 2) {
            const i = (y * w + x) * 4
            samples.push([data[i], data[i + 1], data[i + 2]])
          }
        }
      }
      setDetectedBg(estimateBackgroundColor(samples))
    }
    img.onerror = () => setError('图片加载失败，请换一张试试')
    img.src = url
  }

  // 参数变化时重算预览：换背景 + 居中裁到目标尺寸
  const render = useCallback(() => {
    const source = sourceCanvasRef.current
    if (!source || !detectedBg) return
    const size = ID_PHOTO_SIZES.find((s) => s.id === sizeId) ?? ID_PHOTO_SIZES[0]
    const target = BG_COLORS.find((c) => c.id === bgId) ?? BG_COLORS[0]

    const ctx = source.getContext('2d')
    if (!ctx) return
    const imgData = ctx.getImageData(0, 0, source.width, source.height)
    const replaced = replaceBackground(imgData.data, detectedBg, Number(tolerance), target.rgb)

    // 先画到一张「换背景后」的全尺寸临时 canvas
    const swapped = document.createElement('canvas')
    swapped.width = source.width
    swapped.height = source.height
    swapped.getContext('2d')?.putImageData(new ImageData(replaced, source.width, source.height), 0, 0)

    // 居中裁到目标比例，再缩放到目标像素尺寸
    const crop = centerCropRect(source.width, source.height, size.width, size.height)
    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    out.getContext('2d')?.drawImage(swapped, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
    setPreviewUrl(out.toDataURL('image/png'))
  }, [detectedBg, sizeId, bgId, tolerance])

  useEffect(() => { render() }, [render])

  const download = () => {
    if (!previewUrl) return
    const size = ID_PHOTO_SIZES.find((s) => s.id === sizeId) ?? ID_PHOTO_SIZES[0]
    const anchor = document.createElement('a')
    anchor.href = previewUrl
    anchor.download = `${fileName.replace(/\.[^./\\]+$/, '') || 'idphoto'}-${size.width}x${size.height}.png`
    anchor.click()
  }

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择照片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择照片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">证件尺寸</span>
          <select aria-label="证件尺寸" value={sizeId} onChange={(event) => setSizeId(event.target.value)}>
            {ID_PHOTO_SIZES.map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
          </select></label>
        <label className="unit-field"><span className="unit-field__label">背景色</span>
          <select aria-label="背景色" value={bgId} onChange={(event) => setBgId(event.target.value)}>
            {BG_COLORS.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}
          </select></label>
        <label className="unit-field"><span className="unit-field__label">容差 {tolerance}</span>
          <input type="range" min="0" max="120" step="2" aria-label="容差" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={download} disabled={!previewUrl}>下载</button>
      </div>

      {detectedBg && (
        <p className="hint">
          检测到的背景色 ≈ RGB({detectedBg[0]}, {detectedBg[1]}, {detectedBg[2]})。
          背景不均匀时调小容差更保险（避免误伤头发、衣服）。
        </p>
      )}
      {error && <p className="site-form__error" role="alert">{error}</p>}

      {previewUrl && (
        <div className="id-photo-preview">
          <img src={previewUrl} alt="证件照预览" />
        </div>
      )}

      <p className="hint">
        ⚠️ 这是按「颜色接近度」近似换背景，只适合背景干净、颜色均匀的照片。
        复杂背景（阴影、渐变、杂物）效果有限，边缘可能偏硬——纯前端无 AI 抠图模型。
        图片只在本机处理，不会上传。
      </p>
    </div>
  )
}
