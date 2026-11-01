import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { unsupportedHint } from '../../lib/file-accept'
import {
  computeSliceRects,
  fitSlicePreview,
  sliceArchiveName,
  sliceFileName,
} from '../../lib/image-slice'
import { createZip } from '../../lib/zip'
import { FilePicker } from './FilePicker'
import '../../styles/tools/image-grid.css'

const SOURCE_PREVIEW_MAX_EDGE = 720
const SLICE_PREVIEW_MAX_EDGE = 220

interface SourceImage {
  fileName: string
  width: number
  height: number
  previewUrl: string
  previewWidth: number
  previewHeight: number
}

interface Slice {
  name: string
  url: string
  previewUrl: string
  blob: Blob
  width: number
  height: number
}

interface PendingSlice {
  name: string
  blob: Blob
  previewBlob: Blob
  width: number
  height: number
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** TS 5.7 的 BlobPart 不接收可能基于 SharedArrayBuffer 的 Uint8Array，先把类型收窄到普通 ArrayBuffer。 */
function asBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes)
}

function releaseSliceUrls(slices: Slice[]) {
  for (const item of slices) {
    URL.revokeObjectURL(item.url)
    URL.revokeObjectURL(item.previewUrl)
  }
}

/**
 * 九宫格 / 任意行列切图工具。
 *
 * 矩形、居中裁方形、预览尺寸和文件名都在 lib/image-slice.ts；组件只负责图片解码、
 * Canvas 绘制与下载。原图和每张切片都只生成缩小预览，全尺寸切片只绘制/编码一次；
 * 多张结果统一打成一个 ZIP，避免浏览器拦截连续下载。
 */
export function ImageSlice() {
  const [source, setSource] = useState<SourceImage | null>(null)
  const [rows, setRows] = useState('3')
  const [cols, setCols] = useState('3')
  const [cropSquare, setCropSquare] = useState(false)
  const [slices, setSlices] = useState<Slice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [zipping, setZipping] = useState(false)

  const imageRef = useRef<HTMLImageElement | null>(null)
  const sourceUrlRef = useRef<string | null>(null)
  const sourcePreviewUrlRef = useRef<string | null>(null)
  const slicesRef = useRef<Slice[]>([])
  // 换图或卸载都会递增：晚到的 onload / toBlob / ZIP 回调只能释放自己，不能覆盖新图。
  const sequenceRef = useRef(0)

  const replaceSlices = (next: Slice[]) => {
    releaseSliceUrls(slicesRef.current)
    slicesRef.current = next
    setSlices(next)
  }

  const releaseSourceUrls = () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current)
    if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current)
    sourceUrlRef.current = null
    sourcePreviewUrlRef.current = null
  }

  useEffect(() => () => {
    sequenceRef.current += 1
    releaseSourceUrls()
    releaseSliceUrls(slicesRef.current)
    slicesRef.current = []
  }, [])

  const failCurrentLoad = (seq: number, url: string, message: string) => {
    if (seq !== sequenceRef.current) return
    if (sourceUrlRef.current === url) {
      URL.revokeObjectURL(url)
      sourceUrlRef.current = null
    }
    imageRef.current = null
    setLoading(false)
    setError(message)
  }

  const prepareSourcePreview = async (img: HTMLImageElement, file: File, url: string, seq: number) => {
    const wanted = fitSlicePreview(img.naturalWidth, img.naturalHeight, SOURCE_PREVIEW_MAX_EDGE)
    let canvas: HTMLCanvasElement | null = null
    try {
      // 预览虽已先缩到 720px，仍统一走真实 Canvas 探测，避免在不支持画布的环境里假装成功。
      const plan = planCanvas(wanted, canvasProbe)
      if (!plan) {
        failCurrentLoad(seq, url, tooLargeMessage({ width: img.naturalWidth, height: img.naturalHeight }))
        return
      }
      canvas = document.createElement('canvas')
      canvas.width = plan.size.width
      canvas.height = plan.size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        failCurrentLoad(seq, url, '当前浏览器不支持 Canvas，无法预览和切图')
        return
      }
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, plan.size.width, plan.size.height)
      const blob = await canvasToPng(canvas)
      if (seq !== sequenceRef.current) return
      if (!blob) {
        failCurrentLoad(seq, url, '图片预览生成失败：浏览器没能编码这张图')
        return
      }

      const previewUrl = URL.createObjectURL(blob)
      sourcePreviewUrlRef.current = previewUrl
      imageRef.current = img
      setSource({
        fileName: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        previewUrl,
        previewWidth: plan.size.width,
        previewHeight: plan.size.height,
      })
      setLoading(false)
      setError(null)
    } catch {
      failCurrentLoad(seq, url, '图片预览生成失败，请换一张图片')
    } finally {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }

  const handleFile = (file: File) => {
    const seq = ++sequenceRef.current
    // 新文件一进入解码就让旧图/旧切片失效。否则新图损坏时，旧预览还在且按钮可点，用户会误下载旧结果。
    imageRef.current = null
    setSource(null)
    setLoading(true)
    setWorking(false)
    setZipping(false)
    setError(null)
    setNotice(null)
    replaceSlices([])
    releaseSourceUrls()

    const url = URL.createObjectURL(file)
    sourceUrlRef.current = url
    const img = new Image()
    img.onload = () => { void prepareSourcePreview(img, file, url, seq) }
    img.onerror = () => failCurrentLoad(seq, url, unsupportedHint(file))
    img.src = url
  }

  const invalidateSlices = () => {
    replaceSlices([])
    setNotice(null)
    setError(null)
  }

  const slice = async () => {
    const img = imageRef.current
    if (!img || !source) { setError('请先选择图片'); return }
    const rects = computeSliceRects(img.naturalWidth, img.naturalHeight, Number(rows), Number(cols), cropSquare)
    if (rects.length === 0) {
      setError('行数、列数需为正整数，且不能超过裁剪区域的像素数')
      return
    }

    const seq = sequenceRef.current
    setWorking(true)
    setError(null)
    setNotice(null)
    replaceSlices([])
    const pending: PendingSlice[] = []
    let outputScaled = false

    try {
      // 逐张处理：九张大图若并行编码，会同时占住九份 Canvas 和 PNG 编码内存。
      for (const rect of rects) {
        if (seq !== sequenceRef.current) return
        const wanted = { width: rect.sw, height: rect.sh }
        const outputPlan = planCanvas(wanted, canvasProbe)
        if (!outputPlan) {
          throw new Error(`${tooLargeMessage(wanted)}；也可以增加行数或列数后再切`)
        }
        outputScaled ||= outputPlan.size.width !== rect.sw || outputPlan.size.height !== rect.sh

        const previewWanted = fitSlicePreview(outputPlan.size.width, outputPlan.size.height, SLICE_PREVIEW_MAX_EDGE)
        const previewPlan = planCanvas(previewWanted, canvasProbe)
        if (!previewPlan) throw new Error(tooLargeMessage(previewWanted))

        const outputCanvas = document.createElement('canvas')
        const previewCanvas = document.createElement('canvas')
        try {
          outputCanvas.width = outputPlan.size.width
          outputCanvas.height = outputPlan.size.height
          const outputCtx = outputCanvas.getContext('2d')
          if (!outputCtx) throw new Error('当前浏览器不支持 Canvas，无法切图')
          outputCtx.imageSmoothingQuality = 'high'
          outputCtx.drawImage(
            img,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            0,
            0,
            outputPlan.size.width,
            outputPlan.size.height,
          )

          // 从已经画好的全尺寸切片缩一份预览，不让列表里的 <img> 解码全尺寸 PNG。
          previewCanvas.width = previewPlan.size.width
          previewCanvas.height = previewPlan.size.height
          const previewCtx = previewCanvas.getContext('2d')
          if (!previewCtx) throw new Error('当前浏览器不支持 Canvas，无法生成预览')
          previewCtx.imageSmoothingQuality = 'high'
          previewCtx.drawImage(outputCanvas, 0, 0, previewPlan.size.width, previewPlan.size.height)

          const blob = await canvasToPng(outputCanvas)
          if (seq !== sequenceRef.current) return
          if (!blob) throw new Error('切图失败：浏览器没能编码 PNG')
          const previewBlob = await canvasToPng(previewCanvas)
          if (seq !== sequenceRef.current) return
          if (!previewBlob) throw new Error('切片预览生成失败：浏览器没能编码 PNG')
          pending.push({
            name: sliceFileName(source.fileName, rect.row, rect.col),
            blob,
            previewBlob,
            width: outputPlan.size.width,
            height: outputPlan.size.height,
          })
        } finally {
          outputCanvas.width = 0
          outputCanvas.height = 0
          previewCanvas.width = 0
          previewCanvas.height = 0
        }
      }

      if (seq !== sequenceRef.current) return
      const next = pending.map((item) => ({
        name: item.name,
        blob: item.blob,
        width: item.width,
        height: item.height,
        url: URL.createObjectURL(item.blob),
        previewUrl: URL.createObjectURL(item.previewBlob),
      }))
      replaceSlices(next)
      setNotice(outputScaled
        ? `已生成 ${next.length} 张切片；受浏览器画布上限限制，导出尺寸已等比缩小`
        : `已生成 ${next.length} 张切片，可单张下载或打包成一个 ZIP`)
    } catch (caught) {
      if (seq === sequenceRef.current) {
        setError(caught instanceof Error ? caught.message : '切图失败，请换一张图片')
      }
    } finally {
      if (seq === sequenceRef.current) setWorking(false)
    }
  }

  const downloadAll = async () => {
    const current = slicesRef.current
    if (current.length === 0 || !source) return
    const seq = sequenceRef.current
    setZipping(true)
    setError(null)
    try {
      const entries = []
      for (const item of current) {
        entries.push({ name: item.name, data: new Uint8Array(await item.blob.arrayBuffer()) })
        if (seq !== sequenceRef.current) return
      }
      const zip = createZip(entries)
      const url = URL.createObjectURL(new Blob([asBlobPart(zip)], { type: 'application/zip' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = sliceArchiveName(source.fileName)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      setNotice(`已把 ${current.length} 张切片打包为 ${anchor.download}`)
    } catch {
      if (seq === sequenceRef.current) setError('ZIP 打包失败：图片可能太大，请尝试增加行列数后重切')
    } finally {
      if (seq === sequenceRef.current) setZipping(false)
    }
  }

  const busy = loading || working || zipping

  return (
    <div className="tool-panel image-grid">
      <FilePicker accept="image/*" label="选择图片" onFiles={(files) => handleFile(files[0])} onReject={setError} />

      <div className="unit-row image-grid__controls">
        <label className="unit-field"><span className="unit-field__label">行数</span>
          <input className="site-form__input" inputMode="numeric" aria-label="行数" value={rows} disabled={busy}
            onChange={(event) => { setRows(event.target.value); invalidateSlices() }} /></label>
        <label className="unit-field"><span className="unit-field__label">列数</span>
          <input className="site-form__input" inputMode="numeric" aria-label="列数" value={cols} disabled={busy}
            onChange={(event) => { setCols(event.target.value); invalidateSlices() }} /></label>
        <button type="button" className="btn btn--primary" onClick={() => void slice()} disabled={!source || busy}>
          {working ? '切图中…' : '切图'}
        </button>
        {slices.length > 0 && (
          <button type="button" className="btn" onClick={() => void downloadAll()} disabled={busy}>
            {zipping ? '打包中…' : `全部下载 ZIP（${slices.length} 张）`}
          </button>
        )}
      </div>

      <label className="check-inline image-grid__square-option">
        <input type="checkbox" aria-label="居中裁成正方形" checked={cropSquare} disabled={busy}
          onChange={(event) => { setCropSquare(event.target.checked); invalidateSlices() }} />
        先从图片中央裁成正方形
      </label>

      {loading && <p className="hint image-grid__status" role="status">正在读取图片并生成缩小预览…</p>}
      {error && <p className="site-form__error" role="alert">{error}</p>}
      {notice && <p className="hint image-grid__status" role="status">{notice}</p>}

      {source && (
        <div className="image-slice-preview">
          <img src={source.previewUrl} alt="待切图片预览" />
          <span className="hint">{source.width} × {source.height} px</span>
          {(source.previewWidth !== source.width || source.previewHeight !== source.height) && (
            <span className="hint image-grid__preview-note">页面只显示 {source.previewWidth} × {source.previewHeight} 的缩小预览，导出仍按原像素处理</span>
          )}
        </div>
      )}

      {slices.length > 0 && (
        <div className="slice-grid" aria-live="polite">
          {slices.map((item) => (
            <figure key={item.name} className="slice-item">
              <img src={item.previewUrl} alt={item.name} />
              <figcaption>
                <a className="slice-item__download" href={item.url} download={item.name}>{item.name}</a>
                <span className="slice-item__size">{item.width} × {item.height} px</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="hint">默认 3×3 九宫格，可改成任意行列；横图或竖图可先居中裁成正方形。全部下载会打包成一个 ZIP。图片只在本机处理，不会上传；刷新页面后清空。</p>
    </div>
  )
}
