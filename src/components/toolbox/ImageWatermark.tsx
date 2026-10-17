import { useEffect, useRef, useState } from 'react'

import { anchorPosition, tilePositions, type Anchor } from '../../lib/watermark'

const ANCHORS: { id: Anchor; label: string }[] = [
  { id: 'top-left', label: '左上' }, { id: 'top-center', label: '上中' }, { id: 'top-right', label: '右上' },
  { id: 'middle-left', label: '左中' }, { id: 'center', label: '正中' }, { id: 'middle-right', label: '右中' },
  { id: 'bottom-left', label: '左下' }, { id: 'bottom-center', label: '下中' }, { id: 'bottom-right', label: '右下' },
]

/**
 * 图片加水印工具。
 *
 * 位置计算在 lib/watermark.ts（有单测），这里负责读图 → 画到 canvas → 叠文字水印
 * → 导出预览和下载。全程本地处理。
 *
 * 水印参数变化时用一个 useEffect 重绘预览（原图加载后 / 参数改动后都重画），
 * 这样用户调滑块能实时看到效果，而不是每次都点「生成」。
 */
export function ImageWatermark() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('© 我的水印')
  const [anchor, setAnchor] = useState<Anchor>('bottom-right')
  const [tile, setTile] = useState(false)
  const [fontSize, setFontSize] = useState('32')
  const [opacity, setOpacity] = useState('0.4')
  const [rotation, setRotation] = useState('0')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  // 图片或水印参数变化时重绘预览
  useEffect(() => {
    if (!image) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0)

    const size = Math.max(8, Number(fontSize) || 32)
    ctx.font = `600 ${size}px -apple-system, "Microsoft YaHei", sans-serif`
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, Math.max(0, Number(opacity) || 0))})`
    ctx.textBaseline = 'top'
    // 文字加一层淡阴影，压在白底或深底上都看得清
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 2

    const wmW = ctx.measureText(text).width
    const wmH = size
    const angle = (Number(rotation) || 0) * (Math.PI / 180)

    if (tile) {
      // 平铺：水印之间留出足够间隔，疏朗才好看。横向间隔约一个水印宽，
      // 纵向间隔约 2.5 倍字号（行距）。
      const gapX = wmW * 0.8
      const gapY = size * 2.5
      const points = tilePositions(canvas.width, canvas.height, wmW, wmH, gapX, gapY)
      for (const p of points) {
        ctx.save()
        ctx.translate(p.x + wmW / 2, p.y + wmH / 2)
        ctx.rotate(angle)
        ctx.fillText(text, -wmW / 2, -wmH / 2)
        ctx.restore()
      }
    } else {
      const p = anchorPosition(canvas.width, canvas.height, wmW, wmH, anchor, size * 0.5)
      ctx.save()
      ctx.translate(p.x + wmW / 2, p.y + wmH / 2)
      ctx.rotate(angle)
      ctx.fillText(text, -wmW / 2, -wmH / 2)
      ctx.restore()
    }
    setPreviewUrl(canvas.toDataURL('image/png'))
  }, [image, text, anchor, tile, fontSize, opacity, rotation])

  const handleFile = (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => { setImage(img); setFileName(file.name) }
    img.onerror = () => setError('图片加载失败，请换一张试试')
    img.src = url
  }

  const ext = 'png'

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <label className="unit-field">
        <span className="unit-field__label">水印文字</span>
        <input className="site-form__input" aria-label="水印文字" value={text} onChange={(event) => setText(event.target.value)} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">字号 {fontSize}px</span>
          <input type="range" min="12" max="96" step="2" aria-label="字号" value={fontSize} onChange={(event) => setFontSize(event.target.value)} /></label>
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

      {previewUrl && (
        <div className="watermark-preview">
          <img src={previewUrl} alt="水印预览" />
          <a className="btn btn--primary" href={previewUrl} download={`${fileName.replace(/\.[^./\\]+$/, '') || 'watermarked'}-watermark.${ext}`}>下载带水印图片</a>
        </div>
      )}

      <p className="hint">支持文字水印，可调字号、透明度、旋转、九宫格位置或平铺。图片只在本机处理，不会上传。</p>
    </div>
  )
}
