import { useEffect, useRef, useState } from 'react'

import { computeStitchLayout } from '../../lib/image-stitch'

interface LoadedImage {
  name: string
  url: string
  /** 已加载完成的 Image，拼接时直接 drawImage，省得再建一次 */
  image: HTMLImageElement
  width: number
  height: number
}

/**
 * 长图拼接工具。
 *
 * 分层：画布尺寸和每张图的位置在 lib/image-stitch.ts（有单测），
 * 这里负责多选文件 → 逐个建 Image → 按布局 drawImage 到 canvas → toDataURL 预览下载。
 * 全程本地，图片不上传。
 *
 * 多文件并发加载用 Promise.all：等所有图都 onload 后再一起放进 state，
 * 否则边加载边 setState 会让缩略图列表跳来跳去、顺序也可能乱。
 */
export function ImageStitch() {
  const [items, setItems] = useState<LoadedImage[]>([])
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical')
  const [gap, setGap] = useState('8')
  const [maxEdge, setMaxEdge] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 所有还活着的 ObjectURL，卸载或重新选图时统一释放，避免内存泄漏
  const urlsRef = useRef<string[]>([])

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
    urlsRef.current = []
  }, [])

  const loadOne = (file: File): Promise<LoadedImage | null> => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    urlsRef.current.push(url)
    const image = new Image()
    image.onload = () => resolve({
      name: file.name,
      url,
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })
    image.onerror = () => resolve(null)
    image.src = url
  })

  const handleFiles = async (fileList: FileList) => {
    setError(null)
    setResult(null)
    setResultSize(null)
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) { setError('请选择图片文件（PNG / JPG / WebP 等）'); return }
    // 重新选图前释放上一批 ObjectURL
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
    urlsRef.current = []
    const loaded = (await Promise.all(files.map(loadOne))).filter((item): item is LoadedImage => item !== null)
    if (loaded.length === 0) { setError('图片加载失败，请换几张试试'); return }
    setItems(loaded)
  }

  const stitch = () => {
    if (items.length === 0) { setError('请先选择图片'); return }
    const inputs = items.map((item) => ({ width: item.width, height: item.height }))
    // maxEdge 留空表示不设上限；填了才转数字
    const maxEdgeNum = maxEdge.trim() === '' ? undefined : Number(maxEdge)
    const layout = computeStitchLayout(inputs, direction, Number(gap), maxEdgeNum)
    if (layout.placements.length === 0) { setError('没有可拼接的图片'); return }
    const canvas = document.createElement('canvas')
    canvas.width = layout.canvasWidth
    canvas.height = layout.canvasHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
    layout.placements.forEach((placement, index) => {
      ctx.drawImage(items[index].image, placement.x, placement.y, placement.width, placement.height)
    })
    setResult(canvas.toDataURL('image/png'))
    setResultSize({ width: layout.canvasWidth, height: layout.canvasHeight })
    setError(null)
  }

  return (
    <div className="tool-panel">
      <label className="unit-field image-slice-file">
        <span className="unit-field__label">选择图片（可多选）</span>
        <input type="file" accept="image/*" multiple className="site-form__input" aria-label="选择图片"
          onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = '' }} />
      </label>

      <div className="unit-row">
        <div className="unit-field">
          <span className="unit-field__label">方向</span>
          <div className="unit-row">
            <button type="button" className={`chip${direction === 'vertical' ? ' chip--active' : ''}`}
              onClick={() => setDirection('vertical')}>纵向</button>
            <button type="button" className={`chip${direction === 'horizontal' ? ' chip--active' : ''}`}
              onClick={() => setDirection('horizontal')}>横向</button>
          </div>
        </div>
        <label className="unit-field"><span className="unit-field__label">间隔（px）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="间隔" value={gap} onChange={(event) => setGap(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">最大边长（px，可留空）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="最大边长" value={maxEdge} onChange={(event) => setMaxEdge(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={stitch} disabled={items.length === 0}>拼接</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {items.length > 0 && (
        <div className="compress-compare">
          {items.map((item) => (
            <figure key={item.url} className="compress-item">
              <img src={item.url} alt={item.name} />
              <figcaption>{item.name} · {item.width}×{item.height}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {result && (
        <div className="image-slice-preview">
          <img src={result} alt="拼接结果预览" />
          {resultSize && <span className="hint">拼接结果 · {resultSize.width} × {resultSize.height} px</span>}
        </div>
      )}

      {result && (
        <div className="compress-summary" aria-live="polite">
          <span className="compress-summary__ok">已生成 {items.length} 张的拼接长图</span>
          <a className="btn" href={result} download={`stitched-${direction === 'vertical' ? 'vertical' : 'horizontal'}.png`}>下载 PNG</a>
        </div>
      )}

      <p className="hint">多张图按同一方向对齐拼接：纵向统一宽度、横向统一高度，各自等比缩放不变形。图片只在本机处理，不会上传；刷新页面后清空。</p>
    </div>
  )
}
