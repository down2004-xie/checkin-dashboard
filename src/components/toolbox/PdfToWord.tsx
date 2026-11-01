import { useEffect, useRef, useState } from 'react'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { createDocx } from '../../lib/docx'
import { formatPageList, pdfBaseName } from '../../lib/pdf-pages'
import { countChars, layoutParagraphs, type TextRun } from '../../lib/pdf-text-layout'
import { FilePicker } from './FilePicker'
import '../../styles/tools/pdf-to-word.css'

type PdfJs = typeof import('pdfjs-dist')
type PdfDocument = import('pdfjs-dist').PDFDocumentProxy
type PdfLoadingTask = import('pdfjs-dist').PDFDocumentLoadingTask
type PdfTextItem = Awaited<ReturnType<import('pdfjs-dist').PDFPageProxy['getTextContent']>>['items'][number]

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

let pdfJsPromise: Promise<PdfJs> | null = null

/** PDF.js 和 worker 按需加载，不进入签到主视图；失败后允许下一次重试。 */
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

/** 指向本站构建产物里的 pdfjs-dist 资源，不上传文件，也不访问 CDN。 */
function pdfAssetUrl(directory: 'cmaps' | 'standard_fonts' | 'wasm'): string {
  return new URL(`pdfjs/${directory}/`, document.baseURI).href
}

function pdfErrorMessage(fileName: string, cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/password|encrypted/i.test(`${name} ${message}`)) return `「${fileName}」有密码保护，暂不支持`
  return `「${fileName}」读取失败：文件可能已损坏，或者不是 PDF`
}

/** PDF.js 的联合类型里还含结构标记；只有带 str 的 TextItem 才是真实文字。 */
function toTextRun(item: PdfTextItem): TextRun | null {
  if (!('str' in item)) return null
  const x = Number(item.transform[4])
  const y = Number(item.transform[5])
  const transformHeight = Math.hypot(Number(item.transform[2]), Number(item.transform[3]))
  return {
    str: item.str,
    x,
    y,
    width: Math.abs(item.width),
    height: Math.abs(item.height) || transformHeight,
  }
}

/** TS 5.7 的 BlobPart 不收 ArrayBufferLike；确认是 ArrayBuffer 后包一层普通视图。 */
function asBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes)
}

class StaleJob extends Error {}

/** 从 PDF 文字层重建段落，并生成最小 OOXML .docx。扫描页不会假装做了 OCR。 */
export function PdfToWord() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanWarning, setScanWarning] = useState<string | null>(null)
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

  useEffect(() => () => {
    if (output) URL.revokeObjectURL(output.url)
  }, [output])

  const choosePdf = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const ticket = ++fileTicketRef.current
    jobTicketRef.current += 1
    const previous = loadingTaskRef.current
    loadingTaskRef.current = null
    if (previous) void previous.destroy()

    setPdf(null)
    setError(null)
    setScanWarning(null)
    setOutput(null)
    setBusy('正在读取 PDF…')
    let task: PdfLoadingTask | null = null

    try {
      const data = new Uint8Array(await file.arrayBuffer())
      if (ticket !== fileTicketRef.current) return
      const library = await loadPdfJs()
      if (ticket !== fileTicketRef.current) return
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

  const extract = async () => {
    if (!pdf) return
    const job = ++jobTicketRef.current
    setError(null)
    setScanWarning(null)
    setOutput(null)
    setBusy(`正在提取… 0 / ${pdf.pageCount}`)
    const pages: string[][] = []
    const emptyPages: number[] = []

    const checkCurrent = () => {
      if (job !== jobTicketRef.current) throw new StaleJob()
    }

    try {
      for (let pageNumber = 1; pageNumber <= pdf.pageCount; pageNumber++) {
        checkCurrent()
        setBusy(`正在提取… ${pageNumber} / ${pdf.pageCount}`)
        const page = await pdf.document.getPage(pageNumber)
        try {
          const content = await page.getTextContent()
          checkCurrent()
          const runs = content.items.map(toTextRun).filter((item): item is TextRun => item !== null)
          const paragraphs = layoutParagraphs(runs)
          pages.push(paragraphs)
          if (paragraphs.length === 0) emptyPages.push(pageNumber)
        } finally {
          page.cleanup()
        }
      }

      checkCurrent()
      const paragraphs = pages.flat()
      const chars = countChars(paragraphs)
      if (chars === 0) {
        setError('没有提取到文字。这可能是扫描件或图片型 PDF；本工具不做 OCR，请先用带文字识别功能的软件处理。')
        return
      }

      if (emptyPages.length > 0) {
        setScanWarning(`第 ${formatPageList(emptyPages)} 页没有文字层，已跳过；这些页可能是扫描页，本工具不做 OCR。`)
      }
      const bytes = createDocx(paragraphs)
      const fileName = `${pdfBaseName(pdf.name)}-文字.docx`
      setOutput({
        url: URL.createObjectURL(new Blob([asBlobPart(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })),
        fileName,
        summary: `已提取 ${paragraphs.length} 个段落，共 ${chars} 字`,
      })
    } catch (cause) {
      if (job === jobTicketRef.current && !(cause instanceof StaleJob)) {
        setError('提取失败：PDF 结构异常，或文件太大导致内存不足。请换一份文件或减少页数后重试。')
      }
    } finally {
      if (job === jobTicketRef.current) setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div className="tool-panel pdf-word">
      <FilePicker accept=".pdf,application/pdf" label="选择 PDF" onFiles={(files) => void choosePdf(files)} onReject={setError} />

      {pdf ? (
        <div className="pdf-word__ready">
          <p className="pdf-word__file" title={pdf.name}>已选：{pdf.name}（共 {pdf.pageCount} 页）</p>
          <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => void extract()}>
            提取文字并生成 Word
          </button>
        </div>
      ) : !busy && !error ? (
        <p className="hint">选择带文字层的 PDF，提取全部页面的文字并导出为真实的 .docx 文件。</p>
      ) : null}

      {busy && <p className="hint pdf-word__status" role="status">{busy}</p>}
      {error && <p className="site-form__error" role="alert">{error}</p>}
      {scanWarning && <p className="pdf-word__warning" role="status">{scanWarning}</p>}
      {output && (
        <div className="pdf-word__output">
          <p className="hint" role="status">{output.summary}</p>
          <a className="btn btn--primary pdf-word__download" href={output.url} download={output.fileName}>下载 {output.fileName}</a>
        </div>
      )}

      <div className="pdf-word__limits">
        <strong>能力边界</strong>
        <p>只按文字坐标重组段落，不保留原字体、图片、表格、多栏、页眉页脚或竖排排版；扫描件没有文字层，无法提取，也不会做 OCR。</p>
        <p>文件只在本机浏览器处理，不会上传；PDF.js worker 与中文字体映射也从本站本地加载，不使用 CDN。</p>
      </div>
    </div>
  )
}
