import { useCallback, useEffect, useRef, useState } from 'react'

import { ratioRectToPixels, pointsToRatio, type RatioRect } from '../../lib/image-transform'
import { cellExtent, mosaicBlockSize, mosaicCells } from '../../lib/image-mosaic'

type Mode = 'mosaic' | 'blur'

/**
 * 打码与马赛克工具。
 *
 * 交互复用裁剪那套「拖拽画框」：在图上拖出要处理的区域，点「打码」应用。
 * 和裁剪不同的是：这里**可以多次打码累积**（一张证件照上可能要遮住好几个地方），
 * 工作画布在 ref 里累积，每次打码在上一次结果上继续画。
 *
 * 马赛克的块尺寸/网格在 lib/image-mosaic.ts（有单测）；这里负责取像素、算均色、填格。
 */
export function ImageMosaic() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<Mode>('mosaic')
  const [strength, setStrength] = useState('5')
  const [sel, setSel] = useState<RatioRect>({ x: 0, y: 0, width: 0, height: 0 })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const workingRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  const refreshPreview = useCallback(() => {
    const canvas = workingRef.current
    if (canvas) setPreviewUrl(canvas.toDataURL('image/png'))
  }, [])

  const handleFile = (file: File) => {
    setError(null)
    setSel({ x: 0, y: 0, width: 0, height: 0 })
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => {
      setImage(img)
      setFileName(file.name)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      workingRef.current = canvas
      refreshPreview()
    }
    img.onerror = () => setError('图片加载失败，请换一张试试')
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

  const onPointerDown = (event: React.PointerEvent) => {
    const p = toRatio(event)
    setDragStart(p)
    setSel({ x: p.x, y: p.y, width: 0, height: 0 })
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragStart) return
    const p = toRatio(event)
    setSel(pointsToRatio(dragStart.x, dragStart.y, p.x, p.y))
  }
  const onPointerUp = () => setDragStart(null)

  const applyMask = () => {
    const canvas = workingRef.current
    if (!canvas) { setError('请先选择图片'); return }
    if (sel.width < 0.01 || sel.height < 0.01) { setError('请先在图片上拖出一块要打码的区域'); return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    const rect = ratioRectToPixels(sel, { width: canvas.width, height: canvas.height })

    if (mode === 'blur') {
      // 模糊：把区域拷到临时 canvas，再带 blur 滤镜画回原区域（裁剪到区域边界内）
      const temp = document.createElement('canvas')
      temp.width = rect.width
      temp.height = rect.height
      temp.getContext('2d')?.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
      ctx.save()
      ctx.beginPath()
      ctx.rect(rect.x, rect.y, rect.width, rect.height)
      ctx.clip()
      const radius = Math.max(2, mosaicBlockSize(Math.max(canvas.width, canvas.height), Number(strength)) * 0.6)
      ctx.filter = `blur(${radius}px)`
      ctx.drawImage(temp, rect.x, rect.y)
      ctx.restore()
    } else {
      // 马赛克：逐格取均色填满
      const block = mosaicBlockSize(Math.max(canvas.width, canvas.height), Number(strength))
      const region = ctx.getImageData(rect.x, rect.y, rect.width, rect.height)
      const { data } = region
      for (const cell of mosaicCells(rect.width, rect.height, block)) {
        const extent = cellExtent(cell.x, cell.y, rect.width, rect.height, block)
        // 取该格中心像素颜色作代表色（比全格平均快，观感差别可忽略）
        const cx = Math.min(rect.width - 1, cell.x + Math.floor(extent.width / 2))
        const cy = Math.min(rect.height - 1, cell.y + Math.floor(extent.height / 2))
        const idx = (cy * rect.width + cx) * 4
        ctx.fillStyle = `rgb(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]})`
        ctx.fillRect(rect.x + cell.x, rect.y + cell.y, extent.width, extent.height)
      }
    }
    refreshPreview()
    setSel({ x: 0, y: 0, width: 0, height: 0 })
    setError(null)
  }

  const resetAll = () => {
    if (!image) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')?.drawImage(image, 0, 0)
    workingRef.current = canvas
    refreshPreview()
    setSel({ x: 0, y: 0, width: 0, height: 0 })
    setError(null)
  }

  const download = () => {
    const canvas = workingRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
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
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">方式</span>
          <select aria-label="打码方式" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="mosaic">马赛克</option><option value="blur">模糊</option>
          </select></label>
        <label className="unit-field"><span className="unit-field__label">强度 {strength}</span>
          <input type="range" min="1" max="10" step="1" aria-label="强度" value={strength} onChange={(event) => setStrength(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={applyMask} disabled={!image}>打码</button>
        <button type="button" className="btn" onClick={resetAll} disabled={!image}>撤销全部</button>
        <button type="button" className="btn" onClick={download} disabled={!image}>下载</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {previewUrl && (
        <div className="crop-stage">
          <div className="crop-overlay" ref={overlayRef}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
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

      <p className="hint">在图片上按住拖出要处理的区域，点「打码」应用；可重复多次处理不同区域，「撤销全部」回到原图。图片只在本机处理，不会上传。</p>
    </div>
  )
}
