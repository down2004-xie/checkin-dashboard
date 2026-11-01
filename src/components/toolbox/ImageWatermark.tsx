import { useEffect, useRef, useState } from 'react'

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
import { anchorCenter, fontSizeFromPercent, hexToRgba, shadowColorFor, tilePositions, type Anchor } from '../../lib/watermark'
import { FilePicker } from './FilePicker'
import '../../styles/tools/image-watermark.css'

const ANCHORS: { id: Anchor; label: string }[] = [
  { id: 'top-left', label: '左上' }, { id: 'top-center', label: '上中' }, { id: 'top-right', label: '右上' },
  { id: 'middle-left', label: '左中' }, { id: 'center', label: '正中' }, { id: 'middle-right', label: '右中' },
  { id: 'bottom-left', label: '左下' }, { id: 'bottom-center', label: '下中' }, { id: 'bottom-right', label: '右下' },
]

/** 预览 canvas 的长边上限。全分辨率只在下载时画一次 */
const PREVIEW_EDGE = 1600
const EXPORT_QUALITY = 0.92

interface WatermarkParams {
  text: string
  anchor: Anchor
  tile: boolean
  /** 字号占图片短边的百分比 */
  fontPercent: number
  opacity: number
  rotation: number
  color: string
}

interface Source {
  img: HTMLImageElement
  name: string
  type: string
}

/**
 * 在一张已经画好底图的 canvas 上叠文字水印。预览（缩小版）和导出（全分辨率）共用这一个函数。
 *
 * 字号、边距、间隔、阴影都按画布尺寸成比例算，所以缩小版预览就是成品的等比缩影；
 * 要是字号写死像素，同一个「32px」在 800px 预览和 4000px 原图上大小完全不同。
 * 文字以中心对齐画在 (0, 0)，外面先 translate 到中心再 rotate：旋转只绕水印自己的中心转。
 */
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, params: WatermarkParams) {
  const size = fontSizeFromPercent(width, height, params.fontPercent)
  if (!params.text || size <= 0) return
  ctx.font = `600 ${size}px -apple-system, "Microsoft YaHei", sans-serif`
  ctx.fillStyle = hexToRgba(params.color, params.opacity)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 阴影颜色随文字颜色自适应：亮字配黑影、暗字配白影，任何底色都看得清
  ctx.shadowColor = shadowColorFor(params.color)
  ctx.shadowBlur = Math.max(1, size / 16)

  const wmW = ctx.measureText(params.text).width
  const wmH = size
  const angle = (params.rotation * Math.PI) / 180
  const centers = params.tile
    // 平铺：横向间隔约一个水印宽，纵向间隔约 2.5 倍字号（行距），疏朗才好看
    ? tilePositions(width, height, wmW, wmH, wmW * 0.8, size * 2.5).map((p) => ({ x: p.x + wmW / 2, y: p.y + wmH / 2 }))
    // 九宫格：按旋转后的外接框贴边，转了角度也不会被画布裁掉
    : [anchorCenter(width, height, wmW, wmH, params.rotation, params.anchor, size * 0.5)]
  for (const c of centers) {
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(angle)
    ctx.fillText(params.text, 0, 0)
    ctx.restore()
  }
}

/**
 * 图片加水印工具。
 *
 * 位置计算在 lib/watermark.ts（有单测），这里负责读图 → 画到 canvas → 叠文字水印。
 * 调参只重画缩小版预览 canvas（长边 ≤ 1600，直接显示在页面上，不编码）；
 * 点「下载」时才按原图尺寸画一次并 toBlob。旧实现每动一下滑块就在主线程编码一张
 * 全尺寸 PNG data URL，4000 万像素的照片会卡死，data URL 本身也会大到几十 MB。
 */
export function ImageWatermark() {
  const [source, setSource] = useState<Source | null>(null)
  const [text, setText] = useState('© 我的水印')
  const [anchor, setAnchor] = useState<Anchor>('bottom-right')
  const [tile, setTile] = useState(false)
  const [fontPercent, setFontPercent] = useState('5')
  const [opacity, setOpacity] = useState('0.4')
  const [rotation, setRotation] = useState('0')
  const [color, setColor] = useState('#ffffff')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const downloadUrlRef = useRef<string | null>(null)
  const loadSeq = useRef(0)

  useEffect(() => () => {
    loadSeq.current += 1
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
  }, [])

  const params: WatermarkParams = {
    text,
    anchor,
    tile,
    fontPercent: Number(fontPercent) || 0,
    opacity: Number(opacity) || 0,
    rotation: Number(rotation) || 0,
    color,
  }

  // 图片或水印参数变化时重画缩小版预览
  useEffect(() => {
    const canvas = previewRef.current
    if (!source || !canvas) return
    const preview = fitDimensions(source.img.naturalWidth, source.img.naturalHeight, PREVIEW_EDGE)
    canvas.width = preview.width
    canvas.height = preview.height
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(canvasFailureMessage(preview, 'context')); return }
    ctx.drawImage(source.img, 0, 0, preview.width, preview.height)
    drawWatermark(ctx, preview.width, preview.height, { text, anchor, tile, fontPercent: Number(fontPercent) || 0, opacity: Number(opacity) || 0, rotation: Number(rotation) || 0, color })
  }, [source, text, anchor, tile, fontPercent, opacity, rotation, color])

  const handleFile = (file: File) => {
    const seq = ++loadSeq.current
    setError(null)
    setNotice(null)
    // 先清旧图：新图加载失败时界面不能还停在上一张、下载按钮还能点
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

  const download = async () => {
    if (!source) { setError('请先选择图片'); return }
    const wanted = { width: source.img.naturalWidth, height: source.img.naturalHeight }
    const plan = planCanvas(wanted, canvasProbe)
    if (!plan) { setError(tooLargeMessage(wanted)); return }
    const { size } = plan
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
    ctx.drawImage(source.img, 0, 0, size.width, size.height)
    drawWatermark(ctx, size.width, size.height, params)
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
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    const url = URL.createObjectURL(blob)
    downloadUrlRef.current = url
    const anchorEl = document.createElement('a')
    anchorEl.href = url
    anchorEl.download = `${baseName(source.name, 'watermarked')}-watermark.${output.format.ext}`
    anchorEl.click()
  }

  // 标签里同时给出原图上的实际像素，用户知道「5%」在这张图上有多大
  const fontPx = source ? Math.round(fontSizeFromPercent(source.img.naturalWidth, source.img.naturalHeight, params.fontPercent)) : null

  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <label className="unit-field">
        <span className="unit-field__label">水印文字</span>
        <input className="site-form__input" aria-label="水印文字" value={text} onChange={(event) => setText(event.target.value)} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">字号 短边 {fontPercent}%{fontPx !== null ? `（约 ${fontPx}px）` : ''}</span>
          <input type="range" min="1" max="20" step="0.5" aria-label="字号" value={fontPercent} onChange={(event) => setFontPercent(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">颜色</span>
          <input type="color" aria-label="水印颜色" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">透明度 {Math.round(Number(opacity) * 100)}%</span>
          <input type="range" min="0.1" max="1" step="0.05" aria-label="透明度" value={opacity} onChange={(event) => setOpacity(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">旋转 {rotation}°</span>
          <input type="range" min="-90" max="90" step="5" aria-label="旋转" value={rotation} onChange={(event) => setRotation(event.target.value)} /></label>
      </div>

      <label className="check-inline">
        <input type="checkbox" checked={tile} onChange={(event) => setTile(event.target.checked)} />平铺整张图
      </label>

      {!tile && (
        <div className="filter" role="group" aria-label="水印位置">
          {ANCHORS.map((item) => (
            <button key={item.id} type="button" className={`chip${anchor === item.id ? ' chip--active' : ''}`}
              aria-pressed={anchor === item.id} onClick={() => setAnchor(item.id)}>{item.label}</button>
          ))}
        </div>
      )}

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {source && (
        <div className="watermark-preview">
          <canvas ref={previewRef} className="image-watermark__preview" role="img" aria-label="水印预览" />
          <button type="button" className="btn btn--primary" onClick={() => void download()} disabled={working}>{working ? '生成中…' : '下载带水印图片'}</button>
          {notice && <p className="image-watermark__notice" role="status">{notice}</p>}
        </div>
      )}

      <p className="hint">支持文字水印，可调字号（按图片短边的百分比，大图小图看起来一样大）、颜色、透明度、旋转、九宫格位置或平铺。文字阴影随颜色自适应，深浅底色都看得清。下载的是原图分辨率，格式跟随原图。图片只在本机处理，不会上传。</p>
    </div>
  )
}
