import { useEffect, useRef, useState } from 'react'

import { computeSliceRects, sliceFileName } from '../../lib/image-slice'

interface Slice {
  name: string
  url: string
}

/**
 * 九宫格 / 任意行列切图工具。
 *
 * 分层：切图矩形怎么算在 lib/image-slice.ts（有单测），这里只负责
 * 读文件 → 建 Image → 逐格 drawImage 到 canvas → toDataURL 预览和下载。
 * 全程本地处理，图片不上传（FileReader / ObjectURL 都只在本机内存里）。
 */
export function ImageSlice() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState('3')
  const [cols, setCols] = useState('3')
  const [slices, setSlices] = useState<Slice[]>([])
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  // 组件卸载时释放 ObjectURL，避免内存泄漏
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const handleFile = (file: File) => {
    setError(null)
    setSlices([])
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件（PNG / JPG / WebP 等）')
      return
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => { setImage(img); setFileName(file.name) }
    img.onerror = () => setError('图片加载失败，请换一张试试')
    img.src = url
  }

  const slice = () => {
    if (!image) { setError('请先选择图片'); return }
    const rects = computeSliceRects(image.naturalWidth, image.naturalHeight, Number(rows), Number(cols))
    if (rects.length === 0) { setError('行数、列数需为正整数'); return }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    const result: Slice[] = []
    for (const rect of rects) {
      // 每轮重设尺寸会顺带清空画布，省得手动清
      canvas.width = rect.sw
      canvas.height = rect.sh
      ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh)
      result.push({ name: sliceFileName(fileName, rect.row, rect.col), url: canvas.toDataURL('image/png') })
    }
    setSlices(result)
    setError(null)
  }

  const downloadAll = () => {
    for (const item of slices) {
      const anchor = document.createElement('a')
      anchor.href = item.url
      anchor.download = item.name
      anchor.click()
    }
  }

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片</span>
        <input type="file" accept="image/*" className="site-form__input" aria-label="选择图片"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">行数</span>
          <input className="site-form__input" inputMode="numeric" aria-label="行数" value={rows} onChange={(event) => setRows(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">列数</span>
          <input className="site-form__input" inputMode="numeric" aria-label="列数" value={cols} onChange={(event) => setCols(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={slice} disabled={!image}>切图</button>
        {slices.length > 0 && <button type="button" className="btn" onClick={downloadAll}>全部下载（{slices.length} 张）</button>}
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {image && (
        <div className="image-slice-preview">
          <img src={image.src} alt="待切图片预览" />
          <span className="hint">{image.naturalWidth} × {image.naturalHeight} px</span>
        </div>
      )}

      {slices.length > 0 && (
        <div className="slice-grid" aria-live="polite">
          {slices.map((item) => (
            <figure key={item.name} className="slice-item">
              <img src={item.url} alt={item.name} />
              <figcaption>
                <a className="slice-item__download" href={item.url} download={item.name}>{item.name}</a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="hint">默认 3×3 九宫格，可改成任意行列。图片只在本机处理，不会上传；刷新页面后清空。</p>
    </div>
  )
}
