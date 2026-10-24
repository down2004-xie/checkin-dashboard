import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  clampRect,
  fullRect,
  normalizeRotation,
  pointsToRatio,
  ratioRectToPixels,
  rotatedSize,
  type RatioRect,
  type Rotation,
} from '../../lib/image-transform'

/**
 * 图片裁剪 / 旋转 / 翻转工具。
 *
 * 几何计算全在 lib/image-transform.ts（有单测）。这里负责：
 * 1. 把原图按「旋转 + 翻转」渲染成一张变换后的 canvas
 * 2. 在预览上拖拽画裁剪框（用百分比坐标，和显示尺寸解耦）
 * 3. 导出时按裁剪框从变换后的 canvas 取像素 → toBlob
 *
 * 裁剪交互刻意做成「拖拽重画一个新框」，而不是给旧框加 8 个手柄：
 * 对「裁一张图」这个场景，重画比精细调手柄简单得多，也够用。
 */
export function ImageCrop() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [rotation, setRotation] = useState<Rotation>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [crop, setCrop] = useState<RatioRect>({ x: 0, y: 0, width: 1, height: 1 })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // 变换后的 canvas 缓存，导出时直接用，避免重复渲染
  const transformedRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  // 把原图按旋转 + 翻转画到 canvas
  const renderTransformed = useCallback((img: HTMLImageElement, rot: Rotation, fh: boolean, fv: boolean) => {
    const size = rotatedSize({ width: img.naturalWidth, height: img.naturalHeight }, rot)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(fh ? -1 : 1, fv ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()
    return canvas
  }, [])

  // 图片或变换参数变化 → 重渲染预览
  useEffect(() => {
    if (!image) return
    const canvas = renderTransformed(image, rotation, flipH, flipV)
    if (!canvas) return
    transformedRef.current = canvas
    setPreviewUrl(canvas.toDataURL('image/png'))
  }, [image, rotation, flipH, flipV, renderTransformed])

  const handleFile = (file: File) => {
    setError(null)
    setCrop({ x: 0, y: 0, width: 1, height: 1 })
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => { setImage(img); setFileName(file.name) }
    img.onerror = () => setError('图片加载失败，请换一张试试')
    img.src = url
  }

  // 裁剪框的显示尺寸（相对变换后图的像素）
  const transformedSize = useMemo(() => {
    if (!image) return { width: 0, height: 0 }
    return rotatedSize({ width: image.naturalWidth, height: image.naturalHeight }, rotation)
  }, [image, rotation])

  const cropPixels = useMemo(
    () => ratioRectToPixels(crop, transformedSize),
    [crop, transformedSize],
  )

  // 从指针事件算出相对 overlay 的百分比坐标
  const toRatio = (event: React.PointerEvent) => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const p = toRatio(event)
    setDragStart(p)
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 })
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragStart) return
    const p = toRatio(event)
    setCrop(pointsToRatio(dragStart.x, dragStart.y, p.x, p.y))
  }

  const onPointerUp = () => {
    setDragStart(null)
    // 拖出来的框太小（<1% 边长）视为误触，重置为全图
    setCrop((current) => (current.width < 0.01 || current.height < 0.01 ? { x: 0, y: 0, width: 1, height: 1 } : current))
  }

  const exportCrop = () => {
    const transformed = transformedRef.current
    if (!transformed) { setError('请先选择图片'); return }
    const rect = clampRect(ratioRectToPixels(crop, { width: transformed.width, height: transformed.height }), { width: transformed.width, height: transformed.height })
    const out = document.createElement('canvas')
    out.width = rect.width
    out.height = rect.height
    const ctx = out.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    ctx.drawImage(transformed, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    out.toBlob((blob) => {
      if (!blob) { setError('导出失败，请重试'); return }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${fileName.replace(/\.[^./\\]+$/, '') || 'cropped'}-cropped.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <button type="button" className="btn" onClick={() => setRotation((r) => normalizeRotation(r + 90))} disabled={!image}>↻ 顺时针 90°</button>
        <button type="button" className={`btn${flipH ? ' btn--primary' : ''}`} onClick={() => setFlipH((v) => !v)} disabled={!image} aria-pressed={flipH}>⇋ 水平翻转</button>
        <button type="button" className={`btn${flipV ? ' btn--primary' : ''}`} onClick={() => setFlipV((v) => !v)} disabled={!image} aria-pressed={flipV}>⇅ 垂直翻转</button>
        <button type="button" className="btn" onClick={() => setCrop(fullRect({ width: 1, height: 1 }) as RatioRect)} disabled={!image}>重置裁剪框</button>
        <button type="button" className="btn btn--primary" onClick={exportCrop} disabled={!image}>裁剪并下载</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {previewUrl && (
        <div className="crop-stage">
          <div
            className="crop-overlay"
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img src={previewUrl} alt="待裁剪预览" draggable={false} />
            <div className="crop-selection" style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }} />
          </div>
        </div>
      )}

      {image && (
        <p className="hint">
          变换后尺寸 {transformedSize.width}×{transformedSize.height} px ·
          裁剪区域 {cropPixels.width}×{cropPixels.height} px
        </p>
      )}
      <p className="hint">在图片上按住拖动可画裁剪框（从任意方向拖均可），松手确定；框太小会自动重置为整图。图片只在本机处理，不会上传。</p>
    </div>
  )
}
