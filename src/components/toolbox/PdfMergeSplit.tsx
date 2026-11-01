import { useEffect, useRef, useState } from 'react'

import { moveItem, parsePageRange, pdfBaseName, pdfLoadErrorMessage, splitPageFileName } from '../../lib/page-range'
import { createZip } from '../../lib/zip'
import { FilePicker } from './FilePicker'
import '../../styles/tools/pdf-merge-split.css'

type PdfLib = typeof import('pdf-lib')
type PdfDocument = import('pdf-lib').PDFDocument

/**
 * pdf-lib 动态 import，并缓存同一个 Promise。
 * 为什么不静态 import：静态的话 pdf-lib（约 500 KB）和这个组件进同一个 chunk，
 * 面板要等它下载完才能渲染出来；动态 import 让它单独成一个 chunk，面板先出来，库在后台拉。
 * 两种写法都保证它不进主视图 —— 全项目只有这一个文件 import 它。
 * 下载失败（断网）时清掉缓存，下次点击能重试，而不是永远拿到那个失败的 Promise。
 */
let pdfLibPromise: Promise<PdfLib> | null = null
function loadPdfLib(): Promise<PdfLib> {
  pdfLibPromise ??= import('pdf-lib').catch((error: unknown) => {
    pdfLibPromise = null
    throw error
  })
  return pdfLibPromise
}

interface PdfFile {
  id: string
  name: string
  bytes: Uint8Array
  pageCount: number
}

interface Output {
  url: string
  fileName: string
  summary: string
}

type Mode = 'merge' | 'split'

/**
 * pdf-lib 的 save() 声明返回 Uint8Array<ArrayBufferLike>（可能是 SharedArrayBuffer），
 * TS 5.7 起 Blob 不收这个类型（同 lib/encoding.ts 的说明）。实际上它底下就是普通 ArrayBuffer：
 * 用 instanceof 收窄后原地包一层视图，不复制字节；万一真是共享内存才复制一份。
 */
function asBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes)
}

/** 读文件 + 解析页数。失败时返回人话错误（加密 / 损坏） */
async function readPdf(file: File, id: string): Promise<PdfFile | string> {
  try {
    const { PDFDocument } = await loadPdfLib()
    const bytes = new Uint8Array(await file.arrayBuffer())
    // 不传 ignoreEncryption：加密 PDF 让它抛错，由 pdfLoadErrorMessage 转成「有密码保护」
    const doc = await PDFDocument.load(bytes)
    return { id, name: file.name, bytes, pageCount: doc.getPageCount() }
  } catch (error) {
    return pdfLoadErrorMessage(file.name, error)
  }
}

/** 把若干页（0 起始下标）从 source 复制进一个新文档，返回新文档字节 */
async function copyPagesToNew(lib: PdfLib, sources: { doc: PdfDocument; indices: number[] }[]): Promise<Uint8Array> {
  const out = await lib.PDFDocument.create()
  for (const { doc, indices } of sources) {
    const pages = await out.copyPages(doc, indices)
    for (const page of pages) out.addPage(page)
  }
  return out.save()
}

/**
 * PDF 合并与拆分（pdf-lib）。
 *
 * 分层：页码范围解析、拆分文件名、读取失败提示、列表上移下移在 lib/page-range.ts（有单测）；
 * 这里只做「读文件 → pdf-lib 复制页面 → 生成下载链接」。全程本地处理，文件不上传。
 * 只复制页面，不重新渲染：文字仍可选中、清晰度不变。
 */
export function PdfMergeSplit() {
  const [mode, setMode] = useState<Mode>('merge')
  const [mergeFiles, setMergeFiles] = useState<PdfFile[]>([])
  const [splitFile, setSplitFile] = useState<PdfFile | null>(null)
  const [range, setRange] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [output, setOutput] = useState<Output | null>(null)
  const seq = useRef(0)

  // 面板一打开就在后台预载 pdf-lib，用户选完文件时多半已经下载好了。失败不提示，真用到时再报
  useEffect(() => { loadPdfLib().catch(() => {}) }, [])

  // 换一个结果（或卸载）时释放上一个 Blob URL
  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url) }, [output])

  /** 输入一变，旧结果就作废：否则用户调了顺序，下载的还是调整前的合并结果 */
  const resetOutput = () => setOutput(null)

  const publish = (bytes: Uint8Array, fileName: string, summary: string, type = 'application/pdf') => {
    setOutput({ url: URL.createObjectURL(new Blob([asBlobPart(bytes)], { type })), fileName, summary })
  }

  /** 统一包一层：忙碌提示 + 未预料错误兜底（比如 pdf-lib 下载失败） */
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setErrors([])
    resetOutput()
    try {
      await task()
    } catch {
      setErrors(['处理失败：可能是网络断开导致处理组件没加载成功，或者 PDF 结构异常。请刷新后重试'])
    } finally {
      setBusy(null)
    }
  }

  const loadFiles = async (files: File[]) => {
    const loaded: PdfFile[] = []
    const failed: string[] = []
    // 逐个读：大 PDF 并行解析会同时占用好几份内存
    for (const file of files) {
      const result = await readPdf(file, `pdf-${++seq.current}`)
      if (typeof result === 'string') failed.push(result)
      else loaded.push(result)
    }
    return { loaded, failed }
  }

  const addMergeFiles = (files: File[]) => run('正在读取 PDF…', async () => {
    const { loaded, failed } = await loadFiles(files)
    setMergeFiles((prev) => [...prev, ...loaded])
    setErrors(failed)
  })

  const chooseSplitFile = (files: File[]) => run('正在读取 PDF…', async () => {
    const { loaded, failed } = await loadFiles(files.slice(0, 1))
    if (loaded.length > 0) setSplitFile(loaded[0])
    setErrors(failed)
  })

  const merge = () => run('正在合并…', async () => {
    const lib = await loadPdfLib()
    const sources: { doc: PdfDocument; indices: number[] }[] = []
    for (const file of mergeFiles) {
      const doc = await lib.PDFDocument.load(file.bytes)
      sources.push({ doc, indices: doc.getPageIndices() })
    }
    const bytes = await copyPagesToNew(lib, sources)
    const total = mergeFiles.reduce((sum, file) => sum + file.pageCount, 0)
    publish(bytes, `${pdfBaseName(mergeFiles[0].name)}-合并.pdf`, `已合并 ${mergeFiles.length} 个文件，共 ${total} 页`)
  })

  const parsed = splitFile ? parsePageRange(range, splitFile.pageCount) : null

  const extract = () => run('正在提取…', async () => {
    if (!splitFile || !parsed?.ok) return
    const lib = await loadPdfLib()
    const doc = await lib.PDFDocument.load(splitFile.bytes)
    const bytes = await copyPagesToNew(lib, [{ doc, indices: parsed.pages.map((page) => page - 1) }])
    publish(bytes, `${pdfBaseName(splitFile.name)}-提取.pdf`, `已提取 ${parsed.pages.length} 页`)
  })

  const splitEach = () => run('正在拆分…', async () => {
    if (!splitFile) return
    const lib = await loadPdfLib()
    const doc = await lib.PDFDocument.load(splitFile.bytes)
    const entries = []
    for (let index = 0; index < splitFile.pageCount; index++) {
      setBusy(`正在拆分… ${index + 1} / ${splitFile.pageCount}`)
      entries.push({ name: splitPageFileName(splitFile.name, index + 1, splitFile.pageCount), data: await copyPagesToNew(lib, [{ doc, indices: [index] }]) })
    }
    // 多文件统一打 ZIP：连续触发多次下载会被浏览器拦截
    publish(createZip(entries), `${pdfBaseName(splitFile.name)}-逐页.zip`, `已拆成 ${entries.length} 个文件`, 'application/zip')
  })

  const switchMode = (next: Mode) => { setMode(next); setErrors([]); resetOutput() }
  const disabled = busy !== null
  const mergeTotal = mergeFiles.reduce((sum, file) => sum + file.pageCount, 0)

  return (
    <div className="tool-panel pdf-ms">
      <div className="pdf-ms__modes" role="group" aria-label="模式">
        <button type="button" className={`chip${mode === 'merge' ? ' chip--active' : ''}`} aria-pressed={mode === 'merge'} onClick={() => switchMode('merge')}>合并</button>
        <button type="button" className={`chip${mode === 'split' ? ' chip--active' : ''}`} aria-pressed={mode === 'split'} onClick={() => switchMode('split')}>拆分</button>
      </div>

      {/* 同一时间只挂一个 FilePicker：两个都挂的话，Ctrl+V 粘贴会被两个一起接收 */}
      {mode === 'merge' ? (
        <>
          <FilePicker accept=".pdf,application/pdf" multiple label="选择 PDF" onFiles={(files) => void addMergeFiles(files)} />
          {mergeFiles.length > 0 && (
            <ol className="pdf-ms__list">
              {mergeFiles.map((file, index) => (
                <li key={file.id} className="pdf-ms__item">
                  <span className="pdf-ms__name" title={file.name}>{file.name}</span>
                  <span className="pdf-ms__pages">{file.pageCount} 页</span>
                  <span className="pdf-ms__actions">
                    <button type="button" className="chip" aria-label={`上移 ${file.name}`} disabled={disabled || index === 0}
                      onClick={() => { setMergeFiles((prev) => moveItem(prev, index, -1)); resetOutput() }}>↑</button>
                    <button type="button" className="chip" aria-label={`下移 ${file.name}`} disabled={disabled || index === mergeFiles.length - 1}
                      onClick={() => { setMergeFiles((prev) => moveItem(prev, index, 1)); resetOutput() }}>↓</button>
                    <button type="button" className="chip" aria-label={`移除 ${file.name}`} disabled={disabled}
                      onClick={() => { setMergeFiles((prev) => prev.filter((item) => item.id !== file.id)); resetOutput() }}>×</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="unit-row">
            <button type="button" className="btn btn--primary" onClick={() => void merge()} disabled={disabled || mergeFiles.length < 2}>
              合并{mergeFiles.length >= 2 ? `（共 ${mergeTotal} 页）` : ''}
            </button>
          </div>
          {mergeFiles.length < 2 && <p className="hint">至少选 2 个 PDF，按列表顺序合并（可上移 / 下移调整）。文件只在本机处理，不会上传。</p>}
        </>
      ) : (
        <>
          <FilePicker accept=".pdf,application/pdf" label="选择 PDF" onFiles={(files) => void chooseSplitFile(files)} />
          {splitFile && (
            <>
              <p className="hint pdf-ms__current">已选：{splitFile.name}（共 {splitFile.pageCount} 页）</p>
              <label className="unit-field">
                <span className="unit-field__label">页码范围（如 1-3, 5, 8-；按填写顺序输出，重复的页只保留一次）</span>
                <input className="site-form__input" aria-label="页码范围" value={range} placeholder="1-3, 5, 8-"
                  onChange={(event) => { setRange(event.target.value); resetOutput() }} />
              </label>
              {range.trim() !== '' && parsed && (parsed.ok
                ? <p className="hint">将提取 {parsed.pages.length} 页：{parsed.pages.slice(0, 20).join(', ')}{parsed.pages.length > 20 ? ' …' : ''}</p>
                : <p className="site-form__error" role="alert">{parsed.error}</p>)}
              <div className="unit-row">
                <button type="button" className="btn btn--primary" onClick={() => void extract()} disabled={disabled || !parsed?.ok}>提取为新 PDF</button>
                <button type="button" className="btn" onClick={() => void splitEach()} disabled={disabled}>每页拆成单独文件（ZIP）</button>
              </div>
            </>
          )}
          {!splitFile && <p className="hint">选一个 PDF，按页码范围提取，或每页拆成单独的文件。文件只在本机处理，不会上传。</p>}
        </>
      )}

      {busy && <p className="hint" role="status">{busy}</p>}
      {/* 同名文件失败时文案相同，key 带上序号 */}
      {errors.map((message, index) => <p key={`${index}-${message}`} className="site-form__error" role="alert">{message}</p>)}
      {output && (
        <div className="pdf-ms__output">
          <p className="hint">{output.summary}</p>
          <a className="btn btn--primary pdf-ms__download" href={output.url} download={output.fileName}>下载 {output.fileName}</a>
        </div>
      )}
    </div>
  )
}
