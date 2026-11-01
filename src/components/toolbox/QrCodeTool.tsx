import { useEffect, useMemo, useRef, useState } from 'react'
import { toCanvas, toString as toQrString } from 'qrcode'

import { unsupportedHint } from '../../lib/file-accept'
import { EC_LEVELS, clampInt, contrastWarning, fitLongSide, qrErrorMessage, safeLink, type EcLevel } from '../../lib/qr-code'
import { FilePicker } from './FilePicker'
import '../../styles/tools/qr-code.css'

const DEFAULT_SIZE = 256
const MIN_SIZE = 64
const MAX_SIZE = 2048
/** 留白单位是「模块」（一个小方块）。规范建议 4，扫码枪贴得很近时少了会认不出 */
const DEFAULT_MARGIN = 4
const MAX_MARGIN = 16
/**
 * jsQR 识别前把图缩到长边 1500 以内：它逐像素扫描，手机原图（4000×3000）要卡好几秒，
 * 而截图里的二维码通常几百像素就够。1500 远小于任何浏览器的 canvas 上限，不用再过 canvas-limits。
 */
const JSQR_MAX_SIDE = 1500

// ── 浏览器自带的 BarcodeDetector：TS 的 DOM 类型里还没有，按 WICG Shape Detection 草案自己声明最小子集 ──
interface DetectedBarcode {
  rawValue: string
  format: string
}
interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): BarcodeDetectorInstance
  getSupportedFormats(): Promise<string[]>
}

type Engine = 'native' | 'jsqr'

/** native = 浏览器自带识别；available 为 false 表示这台浏览器没有（或不支持 qr_code） */
async function detectNative(bitmap: ImageBitmap): Promise<{ available: boolean; text: string | null }> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (!Detector) return { available: false, text: null }
  try {
    // 有这个类不代表能认二维码：部分平台只支持条形码，必须问一下 getSupportedFormats
    const formats = await Detector.getSupportedFormats()
    if (!formats.includes('qr_code')) return { available: false, text: null }
    const codes = await new Detector({ formats: ['qr_code'] }).detect(bitmap)
    return { available: true, text: codes.length > 0 ? codes[0].rawValue : null }
  } catch {
    // 检测器内部出错（比如平台服务不可用）当成「没认出来」，交给 jsQR 再试
    return { available: true, text: null }
  }
}

/** jsQR 兜底：缩小 → 画到白底 canvas → 读 ImageData。jsQR 动态 import，只有真用到兜底时才下载 */
async function detectWithJsQr(bitmap: ImageBitmap): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  const size = fitLongSide(bitmap.width, bitmap.height, JSQR_MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  // 先铺白底：透明 PNG 的透明像素 RGB 是 0（黑），jsQR 只看 RGB 不看 alpha，会把透明底当成黑块
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  const { data } = ctx.getImageData(0, 0, size.width, size.height)
  // attemptBoth：反色码（浅色码深色底）也试一次
  return jsQR(data, size.width, size.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

type ScanState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  | { status: 'done'; text: string | null; engine: Engine; nativeAvailable: boolean }

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // 延迟释放：部分浏览器在 click 之后才异步开始读这个 URL
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 二维码生成与识别。
 *
 * 分层：编码交给 qrcode（Reed-Solomon + 掩码评分，手写易错），解码交给浏览器自带的
 * BarcodeDetector，没有时用 jsqr 兜底。纠错说明、对比度警告、报错转人话、「识别结果能不能做成链接」
 * 都在 lib/qr-code.ts（有单测）。全程本地处理，内容和图片都不上传。
 * 不做摄像头扫码：要处理权限、视频流、逐帧识别，留作以后的扩展。
 */
export function QrCodeTool() {
  // ── 生成 ──
  const [text, setText] = useState('')
  const [level, setLevel] = useState<EcLevel>('M')
  // 尺寸输入框存原始字符串：边打字边夹紧的话，想输 512 时打出第一个 5 就被改成 64
  const [sizeInput, setSizeInput] = useState(String(DEFAULT_SIZE))
  const [margin, setMargin] = useState(DEFAULT_MARGIN)
  const [foreground, setForeground] = useState('#000000')
  const [background, setBackground] = useState('#ffffff')
  const [genError, setGenError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const size = clampInt(Number(sizeInput), MIN_SIZE, MAX_SIZE, DEFAULT_SIZE)
  // useMemo：画 canvas 的 effect 依赖它，每次渲染都新建对象的话 effect 会在无关的重渲染时重画
  const options = useMemo(
    () => ({ errorCorrectionLevel: level, width: size, margin, color: { dark: foreground, light: background } }),
    [level, size, margin, foreground, background],
  )
  const hasText = text.length > 0
  const ready = hasText && genError === null

  // 参数一变就重画。canvas 始终挂载（只是没内容时隐藏），否则出错后再改回来 ref 是空的
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasText) { setGenError(null); return }
    let cancelled = false
    toCanvas(canvas, text, options)
      .then(() => { if (!cancelled) setGenError(null) })
      .catch((error: unknown) => { if (!cancelled) setGenError(qrErrorMessage(error)) })
    return () => { cancelled = true }
  }, [text, options, hasText])

  const downloadPng = () => {
    canvasRef.current?.toBlob((blob) => { if (blob) downloadBlob(blob, 'qrcode.png') }, 'image/png')
  }
  const downloadSvg = async () => {
    try {
      const svg = await toQrString(text, { ...options, type: 'svg' })
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode.svg')
    } catch (error) {
      setGenError(qrErrorMessage(error))
    }
  }

  const warning = contrastWarning(foreground, background)
  const levelInfo = EC_LEVELS.find((item) => item.level === level)

  // ── 识别 ──
  const [scan, setScan] = useState<ScanState>({ status: 'idle' })
  const [preview, setPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // 连续选两张图时，只采用最后一张的结果（先选的那张可能识别得更慢、后返回）
  const scanSeq = useRef(0)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const handleScanFile = async (files: File[]) => {
    const file = files[0]
    const seq = ++scanSeq.current
    setCopied(null)
    setPreview(URL.createObjectURL(file))
    setScan({ status: 'working' })
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      if (seq === scanSeq.current) setScan({ status: 'error', message: unsupportedHint(file) })
      return
    }
    try {
      const native = await detectNative(bitmap)
      if (native.text !== null) {
        if (seq === scanSeq.current) setScan({ status: 'done', text: native.text, engine: 'native', nativeAvailable: true })
        return
      }
      const fallback = await detectWithJsQr(bitmap)
      if (seq === scanSeq.current) setScan({ status: 'done', text: fallback, engine: 'jsqr', nativeAvailable: native.available })
    } catch {
      if (seq === scanSeq.current) setScan({ status: 'error', message: '识别时出错，请换一张图片试试' })
    } finally {
      bitmap.close()
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied('已复制')
    } catch {
      setCopied('复制失败：浏览器不允许访问剪贴板，请手动选中文字复制')
    }
  }

  const result = scan.status === 'done' ? scan.text : null
  const link = result !== null ? safeLink(result) : null

  return (
    <div className="tool-panel qr-tool">
      <section className="qr-section" aria-label="生成二维码">
        <h3 className="qr-section__title">生成二维码</h3>
        <label className="unit-field">
          <span className="unit-field__label">内容（文字或网址）</span>
          <textarea className="site-form__input qr-input" aria-label="二维码内容" rows={3} value={text}
            placeholder="输入文字或网址，如 https://example.com" onChange={(event) => setText(event.target.value)} />
        </label>

        <div className="unit-field qr-levels">
          <span className="unit-field__label">纠错级别</span>
          <div className="qr-chips" role="group" aria-label="纠错级别">
            {EC_LEVELS.map((item) => (
              <button key={item.level} type="button" className={`chip${item.level === level ? ' chip--active' : ''}`}
                aria-pressed={item.level === level} onClick={() => setLevel(item.level)}>
                {item.level}
              </button>
            ))}
          </div>
          {levelInfo && <p className="hint">{level} 级：污损 {levelInfo.recovery} 仍能识别，{levelInfo.note}。级别越高越耐污损，但码越密、能装的字越少。</p>}
        </div>

        <div className="unit-row">
          <label className="unit-field">
            <span className="unit-field__label">尺寸（像素，{MIN_SIZE}–{MAX_SIZE}）</span>
            <input className="site-form__input" type="number" aria-label="二维码尺寸" min={MIN_SIZE} max={MAX_SIZE} step={32}
              value={sizeInput} onChange={(event) => setSizeInput(event.target.value)} onBlur={() => setSizeInput(String(size))} />
          </label>
          <label className="unit-field">
            <span className="unit-field__label">留白（模块数）</span>
            <input className="site-form__input" type="number" aria-label="二维码留白" min={0} max={MAX_MARGIN}
              value={margin} onChange={(event) => setMargin(clampInt(Number(event.target.value), 0, MAX_MARGIN, DEFAULT_MARGIN))} />
          </label>
          <label className="unit-field qr-color">
            <span className="unit-field__label">前景色</span>
            <input type="color" aria-label="前景色" value={foreground} onChange={(event) => setForeground(event.target.value)} />
          </label>
          <label className="unit-field qr-color">
            <span className="unit-field__label">背景色</span>
            <input type="color" aria-label="背景色" value={background} onChange={(event) => setBackground(event.target.value)} />
          </label>
        </div>

        {warning && <p className="hint qr-warning" role="status">{warning}</p>}
        {genError && <p className="site-form__error" role="alert">{genError}</p>}
        {!hasText && <p className="hint">输入内容后实时生成。内容只在本机处理，不会上传。</p>}

        <div className={`qr-preview${ready ? '' : ' qr-preview--hidden'}`}>
          <canvas ref={canvasRef} role="img" aria-label="生成的二维码" />
        </div>

        <div className="unit-row">
          <button type="button" className="btn btn--primary" onClick={downloadPng} disabled={!ready}>下载 PNG</button>
          <button type="button" className="btn" onClick={() => void downloadSvg()} disabled={!ready}>下载 SVG</button>
        </div>
      </section>

      <section className="qr-section" aria-label="识别二维码">
        <h3 className="qr-section__title">识别二维码</h3>
        <FilePicker accept="image/*" label="选择二维码图片" onFiles={(files) => void handleScanFile(files)} />
        {preview && <img className="qr-scan-preview" src={preview} alt="待识别的图片" />}

        {scan.status === 'working' && <p className="hint" role="status">识别中…</p>}
        {scan.status === 'error' && <p className="site-form__error" role="alert">{scan.message}</p>}
        {scan.status === 'done' && (
          <div className="qr-result">
            <p className="hint qr-engine" data-engine={scan.engine}>
              {scan.engine === 'native'
                ? '识别引擎：浏览器自带（BarcodeDetector）'
                : `识别引擎：jsQR（${scan.nativeAvailable ? '浏览器自带识别没认出来，已用 jsQR 再试一次' : '这台浏览器没有自带二维码识别'}）`}
            </p>
            {result === null ? (
              <p className="site-form__error" role="alert">没有识别出二维码。可以把二维码裁得大一些、或换一张更清晰的截图再试</p>
            ) : (
              <>
                {/* 纯文本渲染：React 会转义，内容里的 <script> 只是几个字符 */}
                <pre className="qr-result__text" aria-label="识别结果">{result}</pre>
                <div className="unit-row">
                  <button type="button" className="btn btn--primary" onClick={() => void copy(result)}>复制</button>
                  {link && (
                    <a className="btn qr-result__open" href={link.href} target="_blank" rel="noopener noreferrer">打开链接</a>
                  )}
                </div>
                {copied && <p className="hint" role="status">{copied}</p>}
                {link && (
                  <p className="hint qr-warning">
                    即将前往 <strong>{link.host}</strong>。二维码可能来自陌生人，打开前先确认这个网址可信。
                    {link.hasCredentials && ' 注意：这个网址带有「xxx@」前缀，真正去的是 @ 后面的地址，这是常见的钓鱼写法。'}
                  </p>
                )}
                {!link && /^\s*[a-z][a-z0-9+.-]*:/i.test(result) && (
                  <p className="hint">内容不是 http(s) 网址，只显示文字，不提供打开按钮。</p>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
