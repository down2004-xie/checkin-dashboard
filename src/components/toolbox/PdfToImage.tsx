import { useEffect, useRef, useState } from 'react'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { canvasProbe, planCanvas, tooLargeMessage } from '../../lib/canvas-limits'
import { MANY_PAGES_THRESHOLD, dpiToScale, pageFileName, parsePageRange, pdfBaseName } from '../../lib/pdf-pages'
import { createZip } from '../../lib/zip'
import { FilePicker } from './FilePicker'
import '../../styles/tools/pdf-to-image.css'

type PdfJs = typeof import('pdfjs-dist')
type PdfDocument = import('pdfjs-dist').PDFDocumentProxy
type PdfLoadingTask = import('pdfjs-dist').PDFDocumentLoadingTask
type ImageFormat = 'png' | 'jpg'

interface LoadedPdf {
  name: string
  document: PdfDocument
  pageCount: number
}

interface Output {
  url: string
  fileName: string
  summary: string
}

const FORMAT_INFO: Record<ImageFormat, { mime: string; label: string }> = {
  png: { mime: 'image/png', label: 'PNG' },
  jpg: { mime: 'image/jpeg', label: 'JPG' },
}

const DPI_OPTIONS = [96, 144, 200] as const

let pdfJsPromise: Promise<PdfJs> | null = null

/** PDF.js 和 worker 都只在打开本工具后下载；失败时清缓存，让用户下次可以重试。 */
function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= import('pdfjs-dist').then((library) => {
    library.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    return library
  }).catch((error: unknown) => {
    pdfJsPromise = null
    throw error
  })
  return pdfJsPromise
}

/** 相对 document.baseURI，兼容 Vite 的相对 base 和 GitHub Pages 子路径。资源由构建步骤从 pdfjs-dist 本地复制。 */
function pdfAssetUrl(directory: 'cmaps' | 'standard_fonts' | 'wasm'): string {
  return new URL(`pdfjs/${directory}/`, document.baseURI).href
}

function pdfErrorMessage(fileName: string, cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/password|encrypted/i.test(`${name} ${message}`)) return `「${fileName}」有密码保护，暂不支持`
  return `「${fileName}」读取失败：文件可能已损坏，或者不是 PDF`
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** TS 5.7 的 BlobPart 不收 ArrayBufferLike；确认是 ArrayBuffer 后包一层普通视图。 */
function asBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes)
}

class StaleJob extends Error {}
class PageRenderError extends Error {}

/** PDF 每页渲染成图片并打 ZIP。解析、渲染和打包全在浏览器本地完成。 */
export function PdfToImage() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [range, setRange] = useState('')
  const [format, setFormat] = useState<ImageFormat>('png')
  const [dpi, setDpi] = useState(144)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<Output | null>(null)
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null)
  const fileTicketRef = useRef(0)
  const jobTicketRef = useRef(0)

  useEffect(() => () => {
    fileTicketRef.current += 1
    jobTicketRef.current += 1
    const task = loadingTaskRef.current
    loadingTaskRef.current = null
    if (task) void task.destroy()
  }, [])

  // 换结果或卸载时释放 Blob URL；ZIP 可能很大，不能等浏览器回收。
  useEffect(() => () => {
    if (output) URL.revokeObjectURL(output.url)
  }, [output])

  const clearOutput = () => setOutput(null)

  const choosePdf = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const ticket = ++fileTicketRef.current
    jobTicketRef.current += 1
    const previous = loadingTaskRef.current
    loadingTaskRef.current = null
    if (previous) void previous.destroy()

    setPdf(null)
    setRange('')
    setError(null)
    clearOutput()
    setBusy('正在读取 PDF…')
    let task: PdfLoadingTask | null = null

    try {
      const data = new Uint8Array(await file.arrayBuffer())
      if (ticket !== fileTicketRef.current) return
      const library = await loadPdfJs()
      if (ticket !== fileTicketRef.current) return
      // isEvalSupported 在 PDF.js 6 类型中已移除但运行时仍安全传入；明确 false 延续项目的恶意 PDF 防护策略。
      const options = {
        data,
        cMapUrl: pdfAssetUrl('cmaps'),
        cMapPacked: true,
        standardFontDataUrl: pdfAssetUrl('standard_fonts'),
        wasmUrl: pdfAssetUrl('wasm'),
        isEvalSupported: false,
      }
      task = library.getDocument(options)
      loadingTaskRef.current = task
      const document = await task.promise
      if (ticket !== fileTicketRef.current) {
        await task.destroy()
        return
      }
      setPdf({ name: file.name, document, pageCount: document.numPages })
      setRange(document.numPages === 1 ? '1' : `1-${document.numPages}`)
    } catch (cause) {
      if (ticket === fileTicketRef.current) setError(pdfErrorMessage(file.name, cause))
      if (task && loadingTaskRef.current === task) {
        loadingTaskRef.current = null
        void task.destroy()
      }
    } finally {
      if (ticket === fileTicketRef.current) setBusy(null)
    }
  }

  const parsedRange = pdf ? parsePageRange(range, pdf.pageCount) : null

  const convert = async () => {
    if (!pdf || !parsedRange?.ok) return
    const job = ++jobTicketRef.current
    setError(null)
    clearOutput()
    setBusy(`正在转换… 0 / ${parsedRange.pages.length}`)
    const entries: { name: string; data: Uint8Array }[] = []
    let scaledPages = 0

    const checkCurrent = () => {
      if (job !== jobTicketRef.current) throw new StaleJob()
    }

    try {
      for (let index = 0; index < parsedRange.pages.length; index++) {
        checkCurrent()
        const pageNumber = parsedRange.pages[index]
        setBusy(`正在转换… ${index + 1} / ${parsedRange.pages.length}`)
        const page = await pdf.document.getPage(pageNumber)
        let canvas: HTMLCanvasElement | null = null
        try {
          const baseScale = dpiToScale(dpi)
          const wantedViewport = page.getViewport({ scale: baseScale })
          const wanted = { width: Math.ceil(wantedViewport.width), height: Math.ceil(wantedViewport.height) }
          const plan = planCanvas(wanted, canvasProbe)
          if (!plan) throw new PageRenderError(`第 ${pageNumber} 页${tooLargeMessage(wanted)}`)
          if (plan.scale < 0.999) scaledPages += 1

          const renderScale = baseScale * plan.scale
          const viewport = page.getViewport({ scale: renderScale })
          canvas = document.createElement('canvas')
          canvas.width = plan.size.width
          canvas.height = plan.size.height
          const context = canvas.getContext('2d')
          if (!context) throw new PageRenderError('当前浏览器不支持 Canvas')
          await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise
          checkCurrent()

          const { mime } = FORMAT_INFO[format]
          const blob = await canvasToBlob(canvas, mime, format === 'jpg' ? 0.92 : undefined)
          if (!blob || blob.type !== mime) throw new PageRenderError(`第 ${pageNumber} 页无法编码成 ${FORMAT_INFO[format].label}`)
          entries.push({
            name: pageFileName(pdfBaseName(pdf.name), pageNumber, pdf.pageCount, format),
            data: new Uint8Array(await blob.arrayBuffer()),
          })
        } finally {
          if (canvas) {
            canvas.width = 0
            canvas.height = 0
          }
          page.cleanup()
        }
      }

      checkCurrent()
      const zip = createZip(entries)
      const fileName = `${pdfBaseName(pdf.name)}-${FORMAT_INFO[format].label}.zip`
      const summary = `已转换 ${entries.length} 页为 ${FORMAT_INFO[format].label}` +
        (scaledPages > 0 ? `；${scaledPages} 页因浏览器画布上限自动缩小` : '')
      setOutput({
        url: URL.createObjectURL(new Blob([asBlobPart(zip)], { type: 'application/zip' })),
        fileName,
        summary,
      })
    } catch (cause) {
      if (job === jobTicketRef.current && !(cause instanceof StaleJob)) {
        setError(cause instanceof PageRenderError
          ? cause.message
          : '转换失败：PDF 结构异常，或图片太多导致内存不足。请减少页数后重试')
      }
    } finally {
      if (job === jobTicketRef.current) setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div className="tool-panel pdf-image">
      <FilePicker accept=".pdf,application/pdf" label="选择 PDF" onFiles={(files) => void choosePdf(files)} onReject={setError} />

      {pdf ? (
        <>
          <p className="pdf-image__file" title={pdf.name}>已选：{pdf.name}（共 {pdf.pageCount} 页）</p>
          {pdf.pageCount > MANY_PAGES_THRESHOLD && (
            <p className="pdf-image__warning" role="status">这份 PDF 有 {pdf.pageCount} 页。高分辨率逐页渲染会占用较多时间和内存，建议分批转换。</p>
          )}

          <div className="pdf-image__controls">
            <label className="unit-field pdf-image__range">
              <span className="unit-field__label">页码（如 1-3,5）</span>
              <input className="site-form__input" aria-label="页码范围" value={range} disabled={disabled}
                onChange={(event) => { setRange(event.target.value); clearOutput() }} />
            </label>
            <label className="unit-field">
              <span className="unit-field__label">清晰度</span>
              <select className="site-form__input" aria-label="清晰度" value={dpi} disabled={disabled}
                onChange={(event) => { setDpi(Number(event.target.value)); clearOutput() }}>
                {DPI_OPTIONS.map((value) => <option key={value} value={value}>{value} DPI</option>)}
              </select>
            </label>
            <div className="unit-field">
              <span className="unit-field__label">格式</span>
              <div className="pdf-image__formats" role="group" aria-label="图片格式">
                {(Object.keys(FORMAT_INFO) as ImageFormat[]).map((value) => (
                  <button key={value} type="button" className={`chip${format === value ? ' chip--active' : ''}`}
                    aria-pressed={format === value} disabled={disabled}
                    onClick={() => { setFormat(value); clearOutput() }}>{FORMAT_INFO[value].label}</button>
                ))}
              </div>
            </div>
          </div>

          {range.trim() !== '' && parsedRange && (parsedRange.ok
            ? <p className="hint">将转换 {parsedRange.pages.length} 页</p>
            : <p className="site-form__error" role="alert">{parsedRange.error}</p>)}
          <button type="button" className="btn btn--primary" disabled={disabled || !parsedRange?.ok}
            onClick={() => void convert()}>转换并打包 ZIP</button>
        </>
      ) : !busy && !error ? (
        <p className="hint">选择 PDF 后，可按页码导出 PNG 或 JPG。每页一个文件，统一打包成 ZIP 下载。</p>
      ) : null}

      {busy && <p className="hint pdf-image__status" role="status">{busy}</p>}
      {error && <p className="site-form__error" role="alert">{error}</p>}
      {output && (
        <div className="pdf-image__output">
          <p className="hint" role="status">{output.summary}</p>
          <a className="btn btn--primary pdf-image__download" href={output.url} download={output.fileName}>下载 {output.fileName}</a>
        </div>
      )}

      <p className="hint pdf-image__privacy">文件只在本机浏览器处理，不会上传；PDF.js worker 与中文字体映射也从本站本地加载，不使用 CDN。</p>
    </div>
  )
}
