import { useEffect, useRef, useState } from 'react'

import { SAFE_LIMIT, exceedsLimit, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import {
  BG_COLORS,
  ID_PHOTO_FORMATS,
  ID_PHOTO_SIZES,
  centerCropRect,
  estimateBackground,
  idPhotoFileName,
  replaceConnectedBackground,
  workingSize,
  type BackgroundEstimate,
  type IdPhotoFormat,
} from '../../lib/id-photo'
import { FilePicker } from './FilePicker'
import '../../styles/tools/id-photo.css'

/** 已裁到证件比例、缩到工作尺寸的像素。调容差 / 换底色只在它上面重算，不碰原图 */
interface WorkImage {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/** 羽化两圈：够把头发外沿那圈旧背景色淡掉，又不至于把主体边缘糊开 */
const FEATHER = 2

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * 证件照处理工具：把接近纯色的背景换成白/蓝/红，并裁成标准证件尺寸。
 *
 * 处理顺序：先居中裁到证件比例、缩到约 2 倍目标尺寸（workingSize），再逐像素换背景。
 * 手机原图上千万像素，若每拖一下容差都对原图泛洪，滑块会明显卡顿。
 * 输出只有 295×413 这个量级，所以预览画布就是最终输出，下载不用再画一遍全尺寸。
 *
 * 能力边界：按颜色距离 + 连通性近似换背景，只适合背景干净、颜色均匀的照片。
 * 复杂背景（阴影/渐变/杂物）效果有限 —— 纯前端无 AI 模型，这是诚实上限，界面里有明确提示。
 */
export function ImageIdPhoto() {
  const [source, setSource] = useState<{ img: HTMLImageElement; name: string } | null>(null)
  const [sizeId, setSizeId] = useState('one')
  const [bgId, setBgId] = useState('white')
  const [format, setFormat] = useState<IdPhotoFormat>('jpeg')
  const [tolerance, setTolerance] = useState('40')
  const [work, setWork] = useState<WorkImage | null>(null)
  const [estimate, setEstimate] = useState<BackgroundEstimate | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const outputRef = useRef<HTMLCanvasElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }, [])

  const size = ID_PHOTO_SIZES.find((s) => s.id === sizeId) ?? ID_PHOTO_SIZES[0]
  const handleFile = (file: File) => {
    setError(null)
    setSource(null)
    setWork(null)
    setEstimate(null)
    setPreviewUrl(null)
    outputRef.current = null
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const img = new Image()
    img.onload = () => setSource({ img, name: file.name })
    // 能走到这里的多半是 HEIC 这类 accept 放行、浏览器却解不开的格式
    img.onerror = () => setError(unsupportedHint(file))
    img.src = url
  }

  // 换图或换尺寸：重新裁剪、缩到工作尺寸、估背景。只在这两样变时做一次
  useEffect(() => {
    if (!source) return
    const { img } = source
    const srcW = img.naturalWidth
    const srcH = img.naturalHeight
    const crop = centerCropRect(srcW, srcH, size.width, size.height)
    const dims = workingSize(crop.width, crop.height, size.width, size.height)
    const canvas = document.createElement('canvas')
    canvas.width = dims.width
    canvas.height = dims.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx || dims.width === 0) { setError('当前浏览器不支持 Canvas'); return }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, dims.width, dims.height)
    const imageData = ctx.getImageData(0, 0, dims.width, dims.height)
    const next = estimateBackground(imageData.data, dims.width, dims.height)
    // 画出来全透明有两种可能：原图本身全透明，或原图大到浏览器解码不了（iOS 会静默画空）。
    // 只有在原图确实超过保守上限时才说「太大」，不然就是图本身的问题
    const blank = imageData.data.every((value, index) => index % 4 !== 3 || value === 0)
    if (blank) {
      setError(exceedsLimit({ width: srcW, height: srcH }, SAFE_LIMIT)
        ? tooLargeMessage({ width: srcW, height: srcH })
        : '这张图片是全透明的，没有可处理的内容')
      return
    }
    setError(null)
    setWork({ data: imageData.data, width: dims.width, height: dims.height })
    setEstimate(next)
  }, [source, size])

  // 调容差 / 换底色：只在工作尺寸上重算换背景，再缩到证件尺寸
  useEffect(() => {
    if (!work || !estimate) return
    const target = BG_COLORS.find((c) => c.id === bgId) ?? BG_COLORS[0]
    const replaced = replaceConnectedBackground(work.data, work.width, work.height, {
      reference: estimate.color,
      tolerance: Number(tolerance),
      target: target.rgb,
      feather: FEATHER,
    })
    const swapped = document.createElement('canvas')
    swapped.width = work.width
    swapped.height = work.height
    swapped.getContext('2d')?.putImageData(new ImageData(replaced, work.width, work.height), 0, 0)
    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(swapped, 0, 0, size.width, size.height)
    outputRef.current = out
    // 预览用无损 PNG：验收脚本按像素读它；下载时再按选中的格式编码一次
    setPreviewUrl(out.toDataURL('image/png'))
  }, [work, estimate, bgId, tolerance, size])

  const download = async () => {
    const out = outputRef.current
    if (!out || !source) return
    const mime = ID_PHOTO_FORMATS.find((f) => f.id === format)?.mime ?? 'image/jpeg'
    const blob = await canvasToBlob(out, mime, 0.92)
    if (!blob) { setError('当前浏览器无法编码这种格式，请换 PNG 试试'); return }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = idPhotoFileName(source.name, size, blob.type)
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const transparent = estimate?.transparent ?? false

  return (
    <div className="tool-panel">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <div className="unit-row">
        <label className="unit-field"><span className="unit-field__label">证件尺寸</span>
          <select aria-label="证件尺寸" value={sizeId} onChange={(event) => setSizeId(event.target.value)}>
            {ID_PHOTO_SIZES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
        <label className="unit-field"><span className="unit-field__label">背景色</span>
          <select aria-label="背景色" value={bgId} onChange={(event) => setBgId(event.target.value)}>
            {BG_COLORS.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}
          </select></label>
        <label className="unit-field"><span className="unit-field__label">容差 {transparent ? '（透明背景不需要）' : tolerance}</span>
          <input type="range" className="id-photo-tolerance" min="0" max="120" step="2" aria-label="容差" value={tolerance} disabled={transparent}
            onChange={(event) => setTolerance(event.target.value)} /></label>
        <label className="unit-field"><span className="unit-field__label">格式</span>
          <select aria-label="导出格式" value={format} onChange={(event) => setFormat(event.target.value as IdPhotoFormat)}>
            {ID_PHOTO_FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
        <button type="button" className="btn btn--primary" onClick={() => void download()} disabled={!previewUrl}>下载</button>
      </div>

      {estimate && (
        <p className="hint id-photo-detected">
          {estimate.color
            ? <>检测到的背景色 ≈ RGB({estimate.color.join(', ')})
              <span className="id-photo-swatch" style={{ background: `rgb(${estimate.color.join(',')})` }} aria-hidden="true" />。
              只替换和画面边缘连成一片的背景，衣服、眼睛里的同色部分不受影响。背景不均匀时调小容差更保险。</>
            : '检测到透明背景：透明部分直接铺成所选底色，不按颜色判断。'}
        </p>
      )}
      {error && <p className="site-form__error" role="alert">{error}</p>}

      {previewUrl && (
        <div className="id-photo-preview">
          <img src={previewUrl} alt="证件照预览" />
        </div>
      )}

      <p className="hint">
        ⚠️ 这是按「颜色接近度 + 是否和边缘连通」近似换背景，只适合背景干净、颜色均匀的照片。
        复杂背景（阴影、渐变、杂物）效果有限，发丝边缘可能不够细 —— 纯前端无 AI 抠图模型。
        照片会居中裁到证件比例，人像不在正中时请先用「裁剪旋转翻转」工具裁好。图片只在本机处理，不会上传。
      </p>
    </div>
  )
}
