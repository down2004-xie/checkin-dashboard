import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage, type Size } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import {
  backgroundFill,
  computeStitchLayout,
  MAX_EDGE,
  MAX_GAP,
  moveItem,
  parseStitchNumber,
  scaleLayout,
  type StitchBackground,
} from '../../lib/image-stitch'
import '../../styles/tools/image-stitch.css'
import { FilePicker } from './FilePicker'

interface LoadedImage {
  /** 列表 key：同一张图可以被追加两次，不能拿文件名或 URL 当 key */
  id: number
  name: string
  url: string
  /** 已加载完成的 Image，拼接时直接 drawImage，省得再建一次 */
  image: HTMLImageElement
  width: number
  height: number
}

interface StitchResult {
  url: string
  size: Size
  /** 超过画布上限被等比缩小时，记下原本想要的尺寸 */
  wanted: Size | null
  count: number
}

type LoadOutcome = { ok: true; item: LoadedImage } | { ok: false; file: File }

const BACKGROUNDS: { id: StitchBackground; label: string }[] = [
  { id: 'transparent', label: '透明' },
  { id: 'white', label: '白' },
  { id: 'black', label: '黑' },
]
/**
 * 长图拼接工具。
 *
 * 分层：画布尺寸、每张图的位置、缩放、输入校验在 lib/image-stitch.ts（有单测），
 * 这里负责选文件 → 逐个建 Image → 按布局 drawImage 到 canvas → toBlob 预览下载。
 * 全程本地，图片不上传。
 *
 * 加载顺序：每批文件内部并行解码，但「把结果放进列表」这一步按选择顺序排队执行。
 * 否则连选两次时，先选的大图批次晚解码完，会把后选的批次覆盖掉（审核查出的竞态）。
 * 替换时等新批次放进列表后才 revoke 旧 URL：新批次全部失败时旧列表还能用。
 */
export function ImageStitch() {
  const [items, setItems] = useState<LoadedImage[]>([])
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical')
  const [gap, setGap] = useState('8')
  const [maxEdge, setMaxEdge] = useState('')
  // 默认透明：和改版前的输出一致
  const [background, setBackground] = useState<StitchBackground>('transparent')
  const [result, setResult] = useState<StitchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  // items 的同步镜像：排队执行的回调要拿「那一刻」的列表，不能拿闭包里的旧 state
  const itemsRef = useRef<LoadedImage[]>([])
  const resultUrlRef = useRef<string | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const stitchSeqRef = useRef(0)
  const nextIdRef = useRef(1)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      stitchSeqRef.current++
      for (const item of itemsRef.current) URL.revokeObjectURL(item.url)
      itemsRef.current = []
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
  }, [])

  /** 列表一变，旧的拼接结果就不对应了：作废它（包括还在编码的那一次） */
  const clearResult = () => {
    stitchSeqRef.current++
    setBusy(false)
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    resultUrlRef.current = null
    setResult(null)
  }

  /** 换上新列表，并释放不在新列表里的旧 URL（替换、移除共用这一处，保证不漏不重） */
  const commitItems = (next: LoadedImage[]) => {
    const keep = new Set(next.map((item) => item.url))
    for (const item of itemsRef.current) if (!keep.has(item.url)) URL.revokeObjectURL(item.url)
    itemsRef.current = next
    setItems(next)
    clearResult()
  }

  const loadOne = (file: File): Promise<LoadOutcome> => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      // 读不出尺寸的图（如没写宽高的 SVG）没法等比缩放，按加载失败处理
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ ok: true, item: { id: nextIdRef.current++, name: file.name, url, image, width: image.naturalWidth, height: image.naturalHeight } })
      } else { URL.revokeObjectURL(url); resolve({ ok: false, file }) }
    }
    image.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: false, file }) }
    image.src = url
  })
  const handleFiles = (files: File[], mode: 'replace' | 'append') => {
    setError(null)
    setPending((n) => n + files.length)
    // 解码立刻并行开始；落进列表这一步排队，保证按选择顺序生效
    const loading = Promise.all(files.map(loadOne))
    queueRef.current = queueRef.current.then(async () => {
      const outcomes = await loading
      if (!aliveRef.current) {
        for (const o of outcomes) if (o.ok) URL.revokeObjectURL(o.item.url)
        return
      }
      setPending((n) => n - files.length)
      const loaded = outcomes.flatMap((o) => (o.ok ? [o.item] : []))
      const failed = outcomes.flatMap((o) => (o.ok ? [] : [o.file]))
      const message = failed.length === 0 ? null
        : `${unsupportedHint(failed[0])}${failed.length > 1 ? `（共 ${failed.length} 张没加载出来）` : ''}`
      if (loaded.length === 0) { setError(message ?? '图片加载失败，请换几张试试'); return }
      commitItems(mode === 'append' ? [...itemsRef.current, ...loaded] : loaded)
      setError(message)
    }).catch(() => {
      // 队列链不能断：一次出错后，后面的选择也要能继续生效
      if (aliveRef.current) setError('图片加载失败，请换几张试试')
    })
  }

  const move = (index: number, delta: number) => commitItems(moveItem(itemsRef.current, index, delta))
  const remove = (id: number) => commitItems(itemsRef.current.filter((item) => item.id !== id))
  const stitch = () => {
    if (items.length === 0) { setError('请先选择图片'); return }
    const gapNum = parseStitchNumber(gap, '间隔', 0, MAX_GAP)
    if (!gapNum.ok) { setError(gapNum.message); return }
    const edgeNum = parseStitchNumber(maxEdge, '最大边长', 1, MAX_EDGE)
    if (!edgeNum.ok) { setError(edgeNum.message); return }

    const layout = computeStitchLayout(items, direction, gapNum.value ?? 0, edgeNum.value ?? undefined)
    if (layout.placements.length === 0) { setError('没有可拼接的图片'); return }
    const wanted = { width: layout.canvasWidth, height: layout.canvasHeight }
    // 修审核确认的高危 bug：超过 canvas 上限时浏览器不报错，只会静默画成空图。
    // 先探测这台浏览器画得出的尺寸：能等比缩小就缩小并明说，两档都不行就说「太大」
    const plan = planCanvas(wanted, canvasProbe)
    if (!plan) { setError(tooLargeMessage(wanted)); return }
    const final = plan.scale < 1 ? scaleLayout(layout, plan.size.width, plan.size.height) : layout

    const canvas = document.createElement('canvas')
    canvas.width = final.canvasWidth
    canvas.height = final.canvasHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError(tooLargeMessage(wanted)); return }
    const fill = backgroundFill(background)
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    for (const p of final.placements) ctx.drawImage(items[p.index].image, p.x, p.y, p.width, p.height)

    clearResult()
    const seq = stitchSeqRef.current
    setBusy(true)
    setError(null)
    // toBlob 代替 toDataURL：长图编码成 base64 字符串又慢又占内存，object URL 只是一个引用
    canvas.toBlob((blob) => {
      canvas.width = 0
      canvas.height = 0
      if (seq !== stitchSeqRef.current || !aliveRef.current) return
      setBusy(false)
      if (!blob) { setError(tooLargeMessage(wanted)); return }
      const url = URL.createObjectURL(blob)
      resultUrlRef.current = url
      setResult({ url, size: plan.size, wanted: plan.scale < 1 ? wanted : null, count: final.placements.length })
    }, 'image/png')
  }
  return (
    <div className="tool-panel">
      <div className={items.length > 0 ? 'stitch-pickers' : undefined}>
        {/* 有图时粘贴归「追加」：用户已经在拼一组图了，粘贴一张截图是想加进去而不是全部换掉 */}
        <FilePicker accept="image/*" multiple label="选择图片" paste={items.length === 0}
          onFiles={(files) => handleFiles(files, 'replace')} />
        {items.length > 0 && (
          <FilePicker accept="image/*" multiple label="追加图片" onFiles={(files) => handleFiles(files, 'append')} />
        )}
      </div>

      <div className="unit-row">
        <div className="unit-field">
          <span className="unit-field__label">方向</span>
          <div className="unit-row stitch-chips">
            <button type="button" className={`chip${direction === 'vertical' ? ' chip--active' : ''}`}
              onClick={() => setDirection('vertical')}>纵向</button>
            <button type="button" className={`chip${direction === 'horizontal' ? ' chip--active' : ''}`}
              onClick={() => setDirection('horizontal')}>横向</button>
          </div>
        </div>
        <div className="unit-field">
          <span className="unit-field__label">间隔底色</span>
          <div className="unit-row stitch-chips">
            {BACKGROUNDS.map((bg) => (
              <button key={bg.id} type="button" className={`chip${background === bg.id ? ' chip--active' : ''}`}
                aria-pressed={background === bg.id} onClick={() => setBackground(bg.id)}>{bg.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">间隔（px）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="间隔" value={gap} onChange={(event) => setGap(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">最大边长（px，可留空）</span>
          <input className="site-form__input" inputMode="numeric" aria-label="最大边长" value={maxEdge} onChange={(event) => setMaxEdge(event.target.value)} /></label>
        <button type="button" className="btn btn--primary" onClick={stitch} disabled={items.length === 0 || busy}>{busy ? '拼接中…' : '拼接'}</button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}
      {pending > 0 && <p className="hint" aria-live="polite">正在加载 {pending} 张图片…</p>}

      {items.length > 0 && (
        <section className="stitch-list" aria-label="待拼接图片">
          <div className="stitch-list__head">
            <strong>拼接顺序</strong>
            <span>{items.length} 张</span>
          </div>
          {/* 保留 compress-item 类，toolbox-check.mjs 用它确认缩略图已经加载。 */}
          <div className="compress-compare stitch-items">
            {items.map((item, index) => (
              <figure key={item.id} className="compress-item stitch-item" data-file-name={item.name}>
                <img src={item.url} alt={`${index + 1}. ${item.name}`} />
                <figcaption className="stitch-item__caption">
                  <span className="stitch-item__meta">
                    <strong className="stitch-item__order">{index + 1}</strong>
                    <span className="stitch-item__name" title={item.name}>{item.name}</span>
                    <span className="stitch-item__size">{item.width}×{item.height}</span>
                  </span>
                  <span className="stitch-item__actions">
                    <button type="button" className="btn" aria-label={`${item.name} 上移`}
                      onClick={() => move(index, -1)} disabled={index === 0}>上移</button>
                    <button type="button" className="btn" aria-label={`${item.name} 下移`}
                      onClick={() => move(index, 1)} disabled={index === items.length - 1}>下移</button>
                    <button type="button" className="btn stitch-item__remove" aria-label={`删除 ${item.name}`}
                      onClick={() => remove(item.id)}>删除</button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {result && (
        <section className="stitch-result" aria-label="拼接结果" aria-live="polite">
          {/* 保留 image-slice-preview 结构，既复用通用预览样式，也兼容原工具箱验收选择器。 */}
          <div className="image-slice-preview stitch-result__preview">
            <img src={result.url} alt="拼接结果" />
            <p className="hint">已拼接 {result.count} 张 · {result.size.width}×{result.size.height} px</p>
          </div>
          {result.wanted && (
            <p className="stitch-result__notice" role="status">
              原尺寸 {result.wanted.width}×{result.wanted.height} px 超过当前浏览器画布上限，
              已等比缩小为 {result.size.width}×{result.size.height} px。
            </p>
          )}
          <a className="btn btn--primary stitch-result__download" href={result.url} download="stitched.png">下载拼接图</a>
        </section>
      )}

      <p className="hint">纵向会统一图片宽度，横向会统一图片高度；可先排序、删除或继续追加。图片只在本机处理，不会上传。</p>
    </div>
  )
}
