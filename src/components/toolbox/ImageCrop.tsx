import { useEffect, useMemo, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import { fitDimensions } from '../../lib/image-compress'
import {
  baseName,
  canvasFailureMessage,
  downscaleNotice,
  exportFormatFor,
  fallbackNotice,
  joinNotices,
  resolveOutput,
} from '../../lib/image-convert'
import {
  IDENTITY_ORIENTATION,
  applyOrientationOp,
  orientationMatrix,
  pointsToRatio,
  ratioRectToPixels,
  rotatedSize,
  transformCropRect,
  type Orientation,
  type OrientationOp,
  type RatioRect,
} from '../../lib/image-transform'
import { FilePicker } from './FilePicker'
import '../../styles/tools/image-crop.css'

/** 预览 canvas 的长边上限。全分辨率只在导出时画一次 */
const PREVIEW_EDGE = 1600
/** JPEG / WebP 导出质量：和浏览器默认值一致，肉眼无损 */
const EXPORT_QUALITY = 0.92
const FULL_CROP: RatioRect = { x: 0, y: 0, width: 1, height: 1 }

interface Source {
  img: HTMLImageElement
  name: string
  type: string
}

/**
 * 图片裁剪 / 旋转 / 翻转工具。
 *
 * 几何全在 lib/image-transform.ts（有单测）。这里负责：
 * 1. 按「方向」矩阵把原图画到**缩小版**预览 canvas（长边 ≤ 1600），调参不碰全分辨率
 * 2. 在预览上拖拽画裁剪框（用百分比坐标，和显示尺寸解耦）
 * 3. 导出时用同一个矩阵 + 裁剪框偏移，把原图直接画进裁剪尺寸的 canvas，全分辨率只画这一次
 *
 * 旋转 / 翻转时裁剪框跟着图一起变（transformCropRect），而不是重置成整图：
 * 用户框好的区域转个方向还在原处，不用重画。
 *
 * 裁剪交互刻意做成「拖拽重画一个新框」，而不是给旧框加 8 个手柄：
 * 对「裁一张图」这个场景，重画比精细调手柄简单得多，也够用。
 */
export function ImageCrop() {
  const [source, setSource] = useState<Source | null>(null)
  const [orientation, setOrientation] = useState<Orientation>(IDENTITY_ORIENTATION)
  const [crop, setCrop] = useState<RatioRect>(FULL_CROP)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // 拖拽起点 + 按下前的框：pointercancel（来电、系统手势抢走指针）时恢复原框
  const [drag, setDrag] = useState<{ x: number; y: number; before: RatioRect } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const downloadUrlRef = useRef<string | null>(null)
  const loadSeq = useRef(0)

  useEffect(() => () => {
    loadSeq.current += 1
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
  }, [])

  const naturalSize = useMemo(
    () => (source ? { width: source.img.naturalWidth, height: source.img.naturalHeight } : { width: 0, height: 0 }),
    [source],
  )
  const transformedSize = useMemo(() => rotatedSize(naturalSize, orientation.rotation), [naturalSize, orientation.rotation])

  // 图片或方向变化 → 重画缩小版预览。和导出用同一个矩阵函数，预览和成品不会对不上
  useEffect(() => {
    const canvas = previewRef.current
    if (!source || !canvas) return
    const preview = fitDimensions(transformedSize.width, transformedSize.height, PREVIEW_EDGE)
    canvas.width = preview.width
    canvas.height = preview.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(canvasFailureMessage(preview, 'context')); return }
    const m = orientationMatrix(naturalSize, orientation, preview.width / transformedSize.width)
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.drawImage(source.img, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [source, orientation, naturalSize, transformedSize])

  const handleFile = (file: File) => {
    const seq = ++loadSeq.current
    setError(null)
    setNotice(null)
    setCrop(FULL_CROP)
    setOrientation(IDENTITY_ORIENTATION)
    setDrag(null)
    // 先清旧图：新图加载失败时界面不能还停在上一张、按钮还能点
    setSource(null)
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    const url = URL.createObjectURL(file)
    sourceUrlRef.current = url
    const img = new Image()
    img.onload = () => {
      if (seq !== loadSeq.current) return // 晚到的旧图：用户已经换了新图
      setSource({ img, name: file.name, type: file.type })
    }
    img.onerror = () => {
      if (seq !== loadSeq.current) return
      setError(unsupportedHint(file))
    }
    img.src = url
  }

  const cropPixels = useMemo(() => ratioRectToPixels(crop, transformedSize), [crop, transformedSize])

  const apply = (op: OrientationOp) => {
    setOrientation((current) => applyOrientationOp(current, op))
    setCrop((current) => transformCropRect(current, op))
  }

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
    setDrag({ ...p, before: crop })
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const p = toRatio(event)
    setCrop(pointsToRatio(drag.x, drag.y, p.x, p.y))
  }

  const onPointerUp = () => {
    if (!drag) return
    setDrag(null)
    // 拖出来的框太小（<1% 边长）视为误触，重置为全图
    setCrop((current) => (current.width < 0.01 || current.height < 0.01 ? FULL_CROP : current))
  }

  // 指针被系统收走（来电、手势、触屏转滚动）：放弃这次拖拽，恢复按下前的框
  const onPointerCancel = () => {
    if (!drag) return
    setCrop(drag.before)
    setDrag(null)
  }

  const download = (blob: Blob, name: string) => {
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    const url = URL.createObjectURL(blob)
    downloadUrlRef.current = url
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
  }

  const exportCrop = async () => {
    if (!source) { setError('请先选择图片'); return }
    const rect = ratioRectToPixels(crop, transformedSize)
    const wanted = { width: rect.width, height: rect.height }
    const plan = planCanvas(wanted, canvasProbe)
    if (!plan) { setError(tooLargeMessage(wanted)); return }
    const { size, scale } = plan
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(canvasFailureMessage(size, 'context')); return }
    const format = exportFormatFor(source.type)
    if (!format.supportsAlpha) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    // 原图整张画进去，偏移掉裁剪框左上角：画布外的部分自然被裁掉，不用先画全尺寸中间图
    const m = orientationMatrix(naturalSize, orientation, scale, { x: rect.x, y: rect.y })
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.drawImage(source.img, 0, 0)
    const seq = loadSeq.current
    setWorking(true)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format.mime, EXPORT_QUALITY))
    canvas.width = 0
    canvas.height = 0
    setWorking(false)
    if (seq !== loadSeq.current) return
    if (!blob) { setError(canvasFailureMessage(size, 'encode')); return }
    const output = resolveOutput(format.mime, blob.type)
    setError(null)
    setNotice(joinNotices(output.fellBack ? fallbackNotice(format.mime, output.format) : null, downscaleNotice(wanted, size)))
    download(blob, `${baseName(source.name, 'image')}-cropped.${output.format.ext}`)
  }

  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <div className="unit-row">
        <button type="button" className="btn" onClick={() => apply('rotate')} disabled={!source}>↻ 顺时针 90°</button>
        <button type="button" className="btn" onClick={() => apply('flipH')} disabled={!source}>⇋ 水平翻转</button>
        <button type="button" className="btn" onClick={() => apply('flipV')} disabled={!source}>⇅ 垂直翻转</button>
        <button type="button" className="btn" onClick={() => setCrop(FULL_CROP)} disabled={!source}>重置裁剪框</button>
        <button type="button" className="btn btn--primary" onClick={() => void exportCrop()} disabled={!source || working}>{working ? '导出中…' : '裁剪并下载'}</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}
      {notice && <p className="image-crop__notice" role="status">{notice}</p>}

      {source && (
        <div className="crop-stage">
          <div
            className="crop-overlay"
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <canvas ref={previewRef} className="image-crop__preview" role="img" aria-label="待裁剪预览" />
            <div className="crop-selection" style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }} />
          </div>
        </div>
      )}

      {source && (
        <p className="hint">
          变换后尺寸 {transformedSize.width}×{transformedSize.height} px ·
          裁剪区域 {cropPixels.width}×{cropPixels.height} px
        </p>
      )}
      <p className="hint">在图片上按住拖动可画裁剪框（从任意方向拖均可），松手确定；框太小会自动重置为整图。旋转、翻转时裁剪框跟着图一起变。导出格式跟随原图（JPEG 仍是 JPEG，PNG 仍是 PNG）。图片只在本机处理，不会上传。</p>
    </div>
  )
}
