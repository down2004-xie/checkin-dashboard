import { useEffect, useRef, useState } from 'react'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import {
  cleanFileName,
  formatExifDate,
  formatExposure,
  formatGps,
  mapLink,
  orientationLabel,
  readJpegInfo,
  stripMetadata,
  type JpegReport,
} from '../../lib/exif'
import { formatBytes } from '../../lib/image-compress'
import { FilePicker } from './FilePicker'
import '../../styles/tools/exif-viewer.css'

interface Loaded {
  name: string
  size: number
  bytes: Uint8Array
  report: JpegReport
  previewUrl: string
}

interface Output {
  url: string
  name: string
  size: number
  /** 清除后重新解析一遍的结果：给用户看「真的没了」，而不是只说一句「已清除」 */
  verified: boolean
  lossy: boolean
}

/**
 * 照片信息查看与清除。
 *
 * 解析和清除全在 lib/exif.ts（有单测，测试里手工造 JPEG 字节）。这里负责读文件、展示、生成下载。
 * 清除走无损路线：直接删 JPEG 里的元数据段，图像数据一个字节不动，画质不变、体积只少不多。
 * 只有一种情况需要重新编码：方向标签不是 1。删了 EXIF，方向标签也没了，竖拍照片会躺倒，
 * 这时给一个「按正确方向重新编码」的备选（canvas 重画：现代浏览器 drawImage 会按 EXIF 方向画）。
 */
export function ExifViewer() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [output, setOutput] = useState<Output | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const urlsRef = useRef<string[]>([])

  const track = (url: string) => { urlsRef.current.push(url); return url }
  const releaseAll = () => { urlsRef.current.forEach((url) => URL.revokeObjectURL(url)); urlsRef.current = [] }
  useEffect(() => releaseAll, [])

  const handleFile = async (file: File) => {
    setError(null)
    setOutput(null)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const report = readJpegInfo(bytes)
    if (!report.isJpeg) {
      setLoaded(null)
      setError(`「${file.name}」不是 JPEG 文件（文件头不对，可能只是改了扩展名）。这个工具只支持 JPEG。`)
      return
    }
    releaseAll()
    setLoaded({ name: file.name, size: file.size, bytes, report, previewUrl: track(URL.createObjectURL(file)) })
  }

  const strip = () => {
    if (!loaded) return
    const result = stripMetadata(loaded.bytes)
    if (!result) {
      setError('这个文件的结构不完整（头部被截断或写坏了），为了不损坏图像，没有清除。')
      return
    }
    const check = readJpegInfo(result.bytes)
    const blob = new Blob([new Uint8Array(result.bytes)], { type: 'image/jpeg' })
    if (output) URL.revokeObjectURL(output.url)
    setOutput({
      url: track(URL.createObjectURL(blob)), name: cleanFileName(loaded.name), size: blob.size,
      verified: check.exif === null && !check.hasXmp && !check.hasIptc && check.trailingBytes === 0, lossy: false,
    })
    setError(null)
  }

  const reencode = async () => {
    if (!loaded) return
    setWorking(true)
    setError(null)
    try {
      const img = new Image()
      img.src = loaded.previewUrl
      await img.decode()
      // naturalWidth/Height 已经是按 EXIF 方向转正后的尺寸（CSS image-orientation 默认 from-image）
      const wanted = { width: img.naturalWidth, height: img.naturalHeight }
      const plan = planCanvas(wanted, canvasProbe)
      if (!plan) { setError(tooLargeMessage(wanted)); return }
      const canvas = document.createElement('canvas')
      canvas.width = plan.size.width
      canvas.height = plan.size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { setError('当前浏览器不支持 Canvas'); return }
      ctx.drawImage(img, 0, 0, plan.size.width, plan.size.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob || blob.type !== 'image/jpeg') { setError('重新编码失败：浏览器没有生成 JPEG'); return }
      const check = readJpegInfo(new Uint8Array(await blob.arrayBuffer()))
      if (output) URL.revokeObjectURL(output.url)
      setOutput({
        url: track(URL.createObjectURL(blob)), name: cleanFileName(loaded.name), size: blob.size,
        verified: check.exif === null && !check.hasXmp && !check.hasIptc, lossy: true,
      })
    } catch {
      setError('这张照片浏览器解码不了，无法重新编码')
    } finally {
      setWorking(false)
    }
  }

  const report = loaded?.report
  const exif = report?.exif ?? null
  const orientation = exif?.orientation ?? 1
  const hasAnything = !!report && (exif !== null || report.hasXmp || report.hasIptc || report.trailingBytes > 0)

  const rows: { label: string; value: string }[] = []
  if (exif) {
    const camera = [exif.make, exif.model && exif.make && exif.model.startsWith(exif.make) ? exif.model.slice(exif.make.length).trim() : exif.model].filter(Boolean).join(' ')
    if (camera) rows.push({ label: '相机', value: camera })
    if (exif.dateTimeOriginal) rows.push({ label: '拍摄时间', value: formatExifDate(exif.dateTimeOriginal) })
    else if (exif.dateTime) rows.push({ label: '修改时间', value: formatExifDate(exif.dateTime) })
    if (exif.exposureTime) rows.push({ label: '曝光时间', value: formatExposure(exif.exposureTime) })
    if (exif.fNumber !== undefined) rows.push({ label: '光圈', value: `f/${Math.round(exif.fNumber * 10) / 10}` })
    if (exif.iso !== undefined) rows.push({ label: 'ISO', value: String(exif.iso) })
    if (exif.focalLength !== undefined) rows.push({ label: '焦距', value: `${Math.round(exif.focalLength * 10) / 10} mm` })
    if (exif.orientation !== undefined) rows.push({ label: '方向', value: `${orientationLabel(exif.orientation)}（${exif.orientation}）` })
    if (exif.software) rows.push({ label: '软件', value: exif.software })
  }
  if (report?.width !== undefined && report.height !== undefined) rows.push({ label: '宽高', value: `${report.width} × ${report.height}（文件里存的像素方向）` })
  else if (exif?.pixelWidth !== undefined && exif.pixelHeight !== undefined) rows.push({ label: '宽高', value: `${exif.pixelWidth} × ${exif.pixelHeight}` })

  return (
    <div className="tool-panel">
      <FilePicker accept="image/jpeg,.jpg,.jpeg" label="选择照片" onFiles={(files) => void handleFile(files[0])} onReject={setError} />
      {error && <p className="site-form__error" role="alert">{error}</p>}

      {loaded && report && (
        <div className="exif-layout">
          <figure className="exif-preview">
            <img src={loaded.previewUrl} alt="照片预览" />
            <figcaption>{loaded.name} · {formatBytes(loaded.size)}</figcaption>
          </figure>

          <div className="exif-info">
            {exif?.hasGps && (
              <div className="exif-gps" role="alert">
                <strong>这张照片带着拍摄位置</strong>
                {exif.gps
                  ? <>
                    <span className="exif-gps__coords">{formatGps(exif.gps)}</span>
                    <span className="exif-gps__note">
                      别人拿到原图就能看到你在哪拍的。想核对位置可以
                      <a href={mapLink(exif.gps)} target="_blank" rel="noopener noreferrer">在 OpenStreetMap 上查看</a>
                      （点了才会把坐标发给 openstreetmap.org）。
                    </span>
                  </>
                  : <span className="exif-gps__note">有 GPS 信息，但坐标数据不完整，读不出具体位置。</span>}
              </div>
            )}

            {rows.length > 0 && (
              <dl className="exif-table">
                {rows.map((row) => (
                  <div key={row.label} className="exif-table__row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {!exif && <p className="hint">这张照片里没有 EXIF 信息。</p>}
            {(report.hasXmp || report.hasIptc) && (
              <p className="hint">还含有 {[report.hasXmp && 'XMP', report.hasIptc && 'IPTC'].filter(Boolean).join(' 和 ')} 元数据（可能有编辑记录、作者、地点），清除时一并删除。</p>
            )}
            {report.trailingBytes > 0 && (
              <p className="hint">图像结尾后还附带 {formatBytes(report.trailingBytes)} 数据（动态照片的视频、HDR 或景深图等，可能也带位置），清除时一并删除。</p>
            )}
            {report.warnings.map((warning) => <p key={warning} className="site-form__error">{warning}</p>)}

            <div className="exif-actions">
              <button type="button" className="btn btn--primary" onClick={strip}>{hasAnything ? '一键清除元数据' : '仍然生成清除版'}</button>
            </div>

            {orientation !== 1 && (
              <div className="exif-orientation">
                <p>
                  这张照片靠方向标签（{orientationLabel(orientation)}）才显示正确。无损清除会把方向标签一起删掉，
                  有些软件打开会变成横躺或翻转的。
                </p>
                <button type="button" className="btn" onClick={() => void reencode()} disabled={working}>
                  {working ? '编码中…' : '按正确方向重新编码（有损）'}
                </button>
                <p className="hint">重新编码会轻微损失画质、色彩配置统一转成 sRGB，但方向在任何软件里都正确，同样不含任何元数据。</p>
              </div>
            )}

            {output && (
              <div className="exif-output" aria-live="polite">
                <p>
                  {output.lossy ? '已按正确方向重新编码' : '已无损清除'}：{formatBytes(loaded.size)} → <strong>{formatBytes(output.size)}</strong>
                  {output.verified ? '，重新检查确认不含元数据。' : '。'}
                </p>
                <a className="btn btn--primary" href={output.url} download={output.name}>下载 {output.name}</a>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="hint">
        只支持 JPEG（手机和相机拍的照片大多是这种）。PNG、WebP 通常不含拍摄信息；iPhone 的 HEIC 浏览器读不了，
        请先导出为 JPEG。无损清除只删除信息段，不重新压缩，画质不变。照片只在本机处理，不会上传。
      </p>
    </div>
  )
}
