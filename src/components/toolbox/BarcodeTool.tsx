import { useEffect, useMemo, useRef, useState } from 'react'

import { MAX_BARCODE_LENGTH, encodeCode128 } from '../../lib/barcode'

/** 每个模块（最细的条/空）在画布上的像素宽度。3px 打印/扫码都够清晰。 */
const MODULE_WIDTH = 3
/** 条形码高度（不含上下留白）。 */
const BAR_HEIGHT = 80
/** 上下留白，避免条码贴边。 */
const VERTICAL_PADDING = 12
/** 静区：条码左右各留 10 个模块宽的白边（Code 128 规范要求，扫码枪需要）。 */
const QUIET_ZONE_MODULES = 10

/**
 * 条形码生成工具（Code 128；一般内容用 Code Set B，纯数字自动用 Code Set C）。
 *
 * 分层：编码算法全在 lib/barcode.ts（有单测），这里只做
 * 「受控输入 → 取 modules → 画到 canvas → 导出 PNG」。
 * 内容超过 MAX_BARCODE_LENGTH 时不画、不给下载，直接说明原因：
 * 画布超出浏览器上限时 canvas 不报错、只是空白，用户看到的就是「没反应」。
 * 用 useMemo 而不是 useState 存编码结果：它是文本的派生值，
 * 存进 state 会多一个真源，容易和输入失同步。
 */
export function BarcodeTool() {
  const [text, setText] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 输入变化即重算；结果只在本机内存，不落盘、不上传
  const result = useMemo(() => encodeCode128(text), [text])

  // 超长按「实际编码的字符数」判：被剔除的中文、换行不占条码宽度
  const tooLong = result.text.length > MAX_BARCODE_LENGTH
  const drawable = result.modules.length > 0 && !tooLong

  // 把 modules 画到 canvas。依赖 result，输入一变就重绘。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !drawable) return
    const modules = result.modules

    const quietZone = QUIET_ZONE_MODULES * MODULE_WIDTH
    const width = modules.length * MODULE_WIDTH + quietZone * 2
    const height = BAR_HEIGHT + VERTICAL_PADDING * 2

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 白底
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // 逐模块画黑条（true = bar）
    ctx.fillStyle = '#000000'
    for (let i = 0; i < modules.length; i += 1) {
      if (!modules[i]) continue
      ctx.fillRect(quietZone + i * MODULE_WIDTH, VERTICAL_PADDING, MODULE_WIDTH, BAR_HEIGHT)
    }
  }, [result, drawable])

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas || !drawable) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'barcode.png'
      anchor.click()
      // 不能 click() 之后立刻 revoke：click 只是「发起」下载，浏览器读取 blob 是异步的，
      // 部分浏览器（Safari、旧版 Firefox）会因为 URL 已失效而下载失败或拿到空文件。
      // 延后一段时间再释放，既保证下载读得到，也不长期占着内存。
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }, 'image/png')
  }

  const hasInput = text.length > 0
  const isEmpty = result.modules.length === 0
  // 输入非空但编不出来 = 全部字符都不在 ASCII 32–126 范围内
  const allInvalid = hasInput && isEmpty
  // 有字符被静默剔除（部分非法）时给个提示，避免用户以为全编码进去了
  const partiallyFiltered = hasInput && !isEmpty && result.text !== text

  return (
    <div className="tool-panel">
      <label className="unit-field">
        <span className="unit-field__label">条形码内容（Code 128）</span>
        <input
          className="site-form__input"
          aria-label="条形码内容"
          value={text}
          placeholder="输入数字、字母或符号，如 ABC-123"
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="unit-row">
        <button type="button" className="btn btn--primary" onClick={download} disabled={!drawable}>
          下载 PNG
        </button>
      </div>

      {tooLong && (
        <p className="site-form__error" role="alert">
          内容太长：最多 {MAX_BARCODE_LENGTH} 个字符，当前 {result.text.length} 个。
          条码太宽扫码枪和手机都扫不全，长内容（如网址）请改用二维码。
        </p>
      )}

      {allInvalid && (
        <p className="site-form__error" role="alert">
          没有可编码的字符：Code 128 只支持 ASCII 32–126（数字、英文字母、常见符号），中文等字符无法编码。
        </p>
      )}

      {!hasInput && (
        <p className="hint">输入内容后实时生成条形码。只支持数字、英文字母和常见符号，内容只在本机处理、不会上传。</p>
      )}

      {partiallyFiltered && (
        <p className="hint">部分字符（如换行、中文）不受支持，已被忽略；实际编码的是「{result.text}」。</p>
      )}

      {drawable && result.codeSet === 'C' && (
        <p className="hint">纯数字内容已自动使用 Code Set C（两位数字编一个符号），条码更短、更好扫。</p>
      )}

      {drawable && (
        <div className="barcode-preview">
          <canvas ref={canvasRef} role="img" aria-label={`条形码：${result.text}`} />
          <p className="barcode-preview__text">{result.text}</p>
        </div>
      )}
    </div>
  )
}
