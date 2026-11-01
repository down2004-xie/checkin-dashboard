import { useCallback, useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage, type Size } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import {
  blurRadius,
  downscaleSteps,
  mosaicBlockSize,
  normalizeBlurEdges,
  paddedRect,
  pixelate,
  undoOverflow,
  type PixelRect,
} from '../../lib/image-mosaic'
import { pointsToRatio, ratioRectToPixels, type RatioRect } from '../../lib/image-transform'
import { FilePicker } from './FilePicker'

type Mode = 'mosaic' | 'blur'

/** 一步撤销：只存被改动的那块选区（不存整张图），撤销时原样贴回 */
interface Snapshot {
  rect: PixelRect
  data: ImageData
}

/** 撤销栈上限：20 步或 200 MB，先到哪个算哪个（见 undoOverflow） */
const UNDO_DEPTH = 20
const UNDO_BYTES = 200 * 1024 * 1024

const EMPTY_SEL: RatioRect = { x: 0, y: 0, width: 0, height: 0 }

/**
 * ctx.filter 是否真的能模糊。老版本 Safari（18 之前）没有 ctx.filter；
 * 「'filter' in ctx」和「赋值后读回」只能说明属性存在，最稳的是真画一次：
 * 5×5 画布中间点 1 个像素，模糊后看它旁边的像素有没有被染上。
 */
function blurFilterWorks(): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 5
  canvas.height = 5
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || !('filter' in ctx)) return false
  ctx.filter = 'blur(1px)'
  if (ctx.filter !== 'blur(1px)') return false
  ctx.fillStyle = '#000'
  ctx.fillRect(2, 2, 1, 1)
  return ctx.getImageData(1, 2, 1, 1).data[3] > 0
}
function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * 把 source 模糊后画进一张同尺寸的新画布。
 * 支持 ctx.filter 时用高斯模糊；不支持时「缩小再放大」：每步最多缩一半（逐级 box blur），
 * 缩到 1/(2r) 再双线性放大回来，观感接近半径 r 的高斯模糊。
 * 两条路都用 copy 语义画进全新画布，结果只来自 source 本身。
 */
function blurCanvas(source: HTMLCanvasElement, radius: number, useFilter: boolean): HTMLCanvasElement {
  const out = makeCanvas(source.width, source.height)
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) return out
  if (useFilter) {
    ctx.filter = `blur(${radius}px)`
    ctx.drawImage(source, 0, 0)
    return out
  }
  let current = source
  for (const step of downscaleSteps(source.width, source.height, radius * 2)) {
    const next = makeCanvas(step.width, step.height)
    const nctx = next.getContext('2d')
    if (!nctx) break
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(current, 0, 0, step.width, step.height)
    current = next
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current, 0, 0, out.width, out.height)
  return out
}

/**
 * 模糊打码。修的是审核确认过的高危 bug：旧实现只把选区拷到临时画布，
 * blur 时边缘和画布外的透明混合变成半透明，source-over 画回去后底下的原文透出来，
 * 对一行文字打码时字依然可读。现在：
 * 1. 临时画布四周多拷一圈 padding（paddedRect，3 倍半径），选区内每个像素周围都是真实图像；
 * 2. 贴着图片边缘那一侧扩不出去，用全不透明掩码做同样的模糊，再 normalizeBlurEdges 补回 alpha；
 * 3. 用 putImageData（替换，不混合）写回选区，原像素没有机会透出来。
 */
function applyBlur(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, rect: PixelRect, radius: number, useFilter: boolean) {
  const pad = paddedRect(rect, radius, canvas)
  const source = makeCanvas(pad.width, pad.height)
  source.getContext('2d')?.drawImage(canvas, pad.x, pad.y, pad.width, pad.height, 0, 0, pad.width, pad.height)
  const mask = makeCanvas(pad.width, pad.height)
  const mctx = mask.getContext('2d')
  if (mctx) { mctx.fillStyle = '#000'; mctx.fillRect(0, 0, pad.width, pad.height) }

  const ox = rect.x - pad.x
  const oy = rect.y - pad.y
  const blurred = blurCanvas(source, radius, useFilter).getContext('2d', { willReadFrequently: true })
  const coverage = blurCanvas(mask, radius, useFilter).getContext('2d', { willReadFrequently: true })
  if (!blurred || !coverage) return
  const result = blurred.getImageData(ox, oy, rect.width, rect.height)
  normalizeBlurEdges(result.data, coverage.getImageData(ox, oy, rect.width, rect.height).data)
  ctx.putImageData(result, rect.x, rect.y)
}

/** 马赛克：按 alpha 加权取每格均色（lib 里），putImageData 原样写回，透明区域保持透明 */
function applyMosaic(ctx: CanvasRenderingContext2D, rect: PixelRect, block: number) {
  const region = ctx.getImageData(rect.x, rect.y, rect.width, rect.height)
  pixelate(region.data, rect.width, rect.height, block)
  ctx.putImageData(region, rect.x, rect.y)
}
/**
 * 打码与马赛克工具。
 *
 * 交互复用裁剪那套「拖拽画框」：在图上拖出要处理的区域，点「打码」应用。
 * 和裁剪不同的是：这里**可以多次打码累积**（一张证件照上可能要遮住好几个地方），
 * 工作画布在 ref 里累积，每次打码在上一次结果上继续画；每次打码前压一份选区快照，支持单步撤销。
 *
 * 像素处理（块尺寸、加权均色、模糊 padding 与边缘补偿）在 lib/image-mosaic.ts（有单测）；
 * 这里只负责 canvas 读写和交互。
 */
export function ImageMosaic() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [workSize, setWorkSize] = useState<Size | null>(null)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<Mode>('mosaic')
  const [strength, setStrength] = useState('5')
  const [sel, setSel] = useState<RatioRect>(EMPTY_SEL)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [undoCount, setUndoCount] = useState(0)
  const sourceUrlRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const previewSeqRef = useRef(0)
  const loadSeqRef = useRef(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const workingRef = useRef<HTMLCanvasElement | null>(null)
  const undoRef = useRef<Snapshot[]>([])

  useEffect(() => () => {
    // 卸载时作废所有还在路上的回调，并释放 URL
    previewSeqRef.current++
    loadSeqRef.current++
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    sourceUrlRef.current = null
    previewUrlRef.current = null
  }, [])

  /**
   * 预览用 toBlob + object URL：toDataURL 会在主线程同步编码，再把整张图变成 base64 字符串
   * 塞进 DOM，大图又慢又占内存。toBlob 异步，可能乱序回来，用序号丢掉过期结果。
   */
  const refreshPreview = useCallback(() => {
    const canvas = workingRef.current
    if (!canvas) return
    const seq = ++previewSeqRef.current
    canvas.toBlob((blob) => {
      if (seq !== previewSeqRef.current) return
      if (!blob) { setError('预览生成失败：浏览器没能编码这张图'); return }
      const url = URL.createObjectURL(blob)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = url
      setPreviewUrl(url)
    }, 'image/png')
  }, [])
  /** 按工作尺寸重画原图，返回新的工作画布；画不出来返回 null */
  const drawWorking = (img: HTMLImageElement, size: Size): HTMLCanvasElement | null => {
    const canvas = makeCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size.width, size.height)
    return canvas
  }

  const handleFile = (file: File) => {
    setError(null)
    const seq = ++loadSeqRef.current
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // 连续选两张时，先选的那张晚加载完不能覆盖后选的
      if (seq !== loadSeqRef.current) { URL.revokeObjectURL(url); return }
      const wanted = { width: img.naturalWidth, height: img.naturalHeight }
      // 建 canvas 之前先过上限：超限的 canvas 不报错，只会静默画成空图
      const plan = planCanvas(wanted, canvasProbe)
      const canvas = plan ? drawWorking(img, plan.size) : null
      if (!plan || !canvas) { URL.revokeObjectURL(url); setError(tooLargeMessage(wanted)); return }
      // 新图确实能用了才换掉旧图，失败时旧图还在
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
      sourceUrlRef.current = url
      workingRef.current = canvas
      undoRef.current = []
      setUndoCount(0)
      setImage(img)
      setWorkSize(plan.size)
      setFileName(file.name)
      setSel(EMPTY_SEL)
      setNotice(plan.scale < 1
        ? `原图 ${wanted.width}×${wanted.height} 超过了浏览器的画布上限，已缩小到 ${plan.size.width}×${plan.size.height} 处理`
        : null)
      refreshPreview()
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      if (seq === loadSeqRef.current) setError(unsupportedHint(file))
    }
    img.src = url
  }

  const toRatio = (event: React.PointerEvent) => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = toRatio(event)
    setDragStart(p)
    setSel({ x: p.x, y: p.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragStart) return
    const p = toRatio(event)
    setSel(pointsToRatio(dragStart.x, dragStart.y, p.x, p.y))
  }
  const onPointerUp = () => setDragStart(null)
  /**
   * 手势被系统打断（来电、浏览器接管成滚动/缩放）时只有 pointercancel、没有 pointerup。
   * 不处理的话 dragStart 一直留着，之后手指/鼠标一路过就会改选框。打断的手势不算数，选框一并清掉。
   */
  const onPointerCancel = () => { setDragStart(null); setSel(EMPTY_SEL) }
  const applyMask = () => {
    const canvas = workingRef.current
    if (!canvas) { setError('请先选择图片'); return }
    if (sel.width < 0.01 || sel.height < 0.01) { setError('请先在图片上拖出一块要打码的区域'); return }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    const rect = ratioRectToPixels(sel, { width: canvas.width, height: canvas.height })
    const longEdge = Math.max(canvas.width, canvas.height)

    // 先压快照再改：撤销时把这块原样贴回
    const stack = [...undoRef.current, { rect, data: ctx.getImageData(rect.x, rect.y, rect.width, rect.height) }]
    undoRef.current = stack.slice(undoOverflow(stack.map((s) => s.data.data.byteLength), UNDO_DEPTH, UNDO_BYTES))
    setUndoCount(undoRef.current.length)

    if (mode === 'blur') {
      const useFilter = blurFilterWorks()
      applyBlur(ctx, canvas, rect, blurRadius(longEdge, Number(strength)), useFilter)
      setNotice(useFilter ? null : '这个浏览器不支持画布滤镜，已改用「缩小再放大」的方式模糊，效果略粗但同样看不清原文')
    } else {
      applyMosaic(ctx, rect, mosaicBlockSize(longEdge, Number(strength)))
    }
    refreshPreview()
    setSel(EMPTY_SEL)
    setError(null)
  }

  const undoStep = () => {
    const canvas = workingRef.current
    const last = undoRef.current.at(-1)
    if (!canvas || !last) return
    canvas.getContext('2d', { willReadFrequently: true })?.putImageData(last.data, last.rect.x, last.rect.y)
    undoRef.current = undoRef.current.slice(0, -1)
    setUndoCount(undoRef.current.length)
    refreshPreview()
    setError(null)
  }

  const resetAll = () => {
    if (!image || !workSize) return
    const canvas = drawWorking(image, workSize)
    if (!canvas) { setError('当前浏览器不支持 Canvas'); return }
    workingRef.current = canvas
    undoRef.current = []
    setUndoCount(0)
    refreshPreview()
    setSel(EMPTY_SEL)
    setError(null)
  }

  const download = () => {
    const canvas = workingRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) { setError('导出失败：浏览器没能编码这张图'); return }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${fileName.replace(/\.[^./\\]+$/, '') || 'mosaic'}-mosaic.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }
  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} />

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">方式</span>
          <select aria-label="打码方式" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="mosaic">马赛克</option><option value="blur">模糊</option>
          </select></label>
        <label className="unit-field"><span className="unit-field__label">强度 {strength}</span>
          <input type="range" min="1" max="10" step="1" aria-label="强度" value={strength} onChange={(event) => setStrength(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={applyMask} disabled={!image}>打码</button>
        <button type="button" className="btn" onClick={undoStep} disabled={undoCount === 0}>撤销一步</button>
        <button type="button" className="btn" onClick={resetAll} disabled={!image}>撤销全部</button>
        <button type="button" className="btn" onClick={download} disabled={!image}>下载</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}
      {notice && <p className="hint mosaic-notice" aria-live="polite">{notice}</p>}

      {previewUrl && (
        <div className="crop-stage">
          <div className="crop-overlay" ref={overlayRef}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
            <img src={previewUrl} alt="待打码预览" draggable={false} />
            {sel.width > 0 && sel.height > 0 && (
              <div className="crop-selection" style={{
                left: `${sel.x * 100}%`, top: `${sel.y * 100}%`,
                width: `${sel.width * 100}%`, height: `${sel.height * 100}%`,
              }} />
            )}
          </div>
        </div>
      )}

      <p className="hint">在图片上按住拖出要处理的区域，点「打码」应用；可重复多次处理不同区域，「撤销一步」退回上一次，「撤销全部」回到原图。图片只在本机处理，不会上传。</p>
    </div>
  )
}
