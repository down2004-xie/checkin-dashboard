import { useEffect, useRef, useState } from 'react'

import {
  composite,
  contrastRatio,
  formatHex,
  formatHsl,
  formatRatio,
  formatRgb,
  parseColor,
  wcagVerdict,
  type Rgba,
} from '../../lib/color'
import '../../styles/tools/color-tool.css'

/* EyeDropper（屏幕取色）只有 Chromium 系实现，TS 自带的 DOM 类型里也没有，这里只声明用到的部分。
 * 规范：https://wicg.github.io/eyedropper-api/ */
interface EyeDropperResult {
  sRGBHex: string
}
interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>
}
type EyeDropperConstructor = new () => EyeDropperInstance

/** 特性检测：不支持的浏览器（Firefox / Safari）返回 null，界面上就不出现取色按钮 */
function getEyeDropper(): EyeDropperConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper
  return typeof candidate === 'function' ? candidate : null
}

type Which = 'fg' | 'bg'

interface Field {
  /** 文本框里的原文（可能暂时是非法的，用户还没打完） */
  text: string
  /** 最近一次合法的颜色。文本框非法时预览和对比度保持上一个合法值，不闪成黑色 */
  color: Rgba
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }
const LABELS: Record<Which, string> = { fg: '文字色', bg: '背景色' }

/**
 * 颜色工具：HEX / RGB / HSL 互转 + WCAG 对比度检查。
 *
 * 解析、互转、对比度全在 lib/color.ts（有单测），这里只做输入同步和展示。
 * 每个颜色有两条输入：原生取色器和文本框。文本框是「草稿」，打到一半（#12）是非法的，
 * 所以合法值单独存一份，非法时显示错误但不改颜色。
 */
export function ColorTool() {
  const [fields, setFields] = useState<Record<Which, Field>>({
    fg: { text: '#334155', color: { r: 0x33, g: 0x41, b: 0x55, a: 1 } },
    bg: { text: '#ffffff', color: WHITE },
  })
  const [copied, setCopied] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [eyeDropper] = useState(getEyeDropper)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const setText = (which: Which, text: string) => {
    const parsed = parseColor(text)
    setFields((prev) => ({ ...prev, [which]: { text, color: parsed ?? prev[which].color } }))
  }

  // 原生取色器只认 #rrggbb、没有透明度：保留原来的透明度，免得一拖就把半透明变成不透明
  const setFromPicker = (which: Which, hex: string) => {
    const parsed = parseColor(hex)
    if (!parsed) return
    setFields((prev) => {
      const color = { ...parsed, a: prev[which].color.a }
      return { ...prev, [which]: { text: formatHex(color), color } }
    })
  }

  const pick = async (which: Which) => {
    if (!eyeDropper) return
    try {
      const { sRGBHex } = await new eyeDropper().open()
      setText(which, sRGBHex)
    } catch {
      // 用户按 Esc 取消会 reject（AbortError），不是错误，什么都不做
    }
  }

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyError(null)
      setCopied(key)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopyError('浏览器不允许写剪贴板，请手动选中文字复制')
    }
  }

  const swap = () => setFields((prev) => ({ fg: prev.bg, bg: prev.fg }))

  const fg = fields.fg.color
  const bg = fields.bg.color
  const ratio = contrastRatio(fg, bg)
  const verdict = wcagVerdict(ratio)
  // 预览底色和计算口径保持一致：半透明背景按叠在白底上显示
  const previewBg = bg.a < 1 ? composite(bg, WHITE) : bg

  const checks: { label: string; need: string; ok: boolean }[] = [
    { label: 'AA 正文', need: '≥ 4.5', ok: verdict.aaNormal },
    { label: 'AA 大字', need: '≥ 3', ok: verdict.aaLarge },
    { label: 'AAA 正文', need: '≥ 7', ok: verdict.aaaNormal },
    { label: 'AAA 大字', need: '≥ 4.5', ok: verdict.aaaLarge },
  ]

  const renderField = (which: Which) => {
    const field = fields[which]
    const invalid = parseColor(field.text) === null
    const formats = [formatHex(field.color), formatRgb(field.color), formatHsl(field.color)]
    return (
      <div className="color-field" key={which}>
        <span className="unit-field__label">{LABELS[which]}</span>
        <div className="color-field__inputs">
          <input type="color" className="color-field__swatch" aria-label={`${LABELS[which]}取色器`}
            value={formatHex({ ...field.color, a: 1 })} onChange={(event) => setFromPicker(which, event.target.value)} />
          <input className="site-form__input color-field__text" aria-label={`${LABELS[which]}数值`} spellCheck={false}
            value={field.text} aria-invalid={invalid} onChange={(event) => setText(which, event.target.value)} />
          {eyeDropper && (
            <button type="button" className="btn color-field__pick" onClick={() => void pick(which)}
              title="从屏幕上任意位置取色">取色</button>
          )}
        </div>
        {invalid && <p className="site-form__error" role="alert">认不出这个颜色，支持 #rgb、#rrggbb、#rrggbbaa、rgb()、hsl()</p>}
        <ul className="color-formats">
          {formats.map((value, index) => (
            <li key={index} className="color-formats__row">
              <span className="color-formats__name">{['HEX', 'RGB', 'HSL'][index]}</span>
              <code className="color-formats__value">{value}</code>
              <button type="button" className="chip" aria-label={`复制${LABELS[which]} ${['HEX', 'RGB', 'HSL'][index]}`}
                onClick={() => void copy(`${which}-${index}`, value)}>{copied === `${which}-${index}` ? '已复制' : '复制'}</button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="tool-panel">
      <div className="color-fields">
        {renderField('fg')}
        {renderField('bg')}
      </div>
      <div className="color-actions">
        <button type="button" className="btn" onClick={swap}>交换文字色和背景色</button>
      </div>
      {copyError && <p className="site-form__error" role="alert">{copyError}</p>}

      <div className="color-preview" style={{ background: formatRgb(previewBg), color: formatRgb(fg) }}>
        <p className="color-preview__large">大字示例 Large Text 24px</p>
        <p className="color-preview__normal">正文示例：每天打卡一小步，简历上就多一行。The quick brown fox jumps over the lazy dog.</p>
      </div>

      <div className="color-result" aria-live="polite">
        <div className="color-result__ratio">
          <span className="unit-field__label">对比度</span>
          <strong className="color-ratio">{formatRatio(ratio)} : 1</strong>
        </div>
        <ul className="color-checks">
          {checks.map((check) => (
            <li key={check.label} className={`color-check ${check.ok ? 'color-check--pass' : 'color-check--fail'}`}>
              <span>{check.label}<small>（{check.need}）</small></span>
              <strong>{check.ok ? '通过' : '不通过'}</strong>
            </li>
          ))}
        </ul>
      </div>

      {(fg.a < 1 || bg.a < 1) && (
        <p className="hint">含透明度：文字色先叠到背景上再算{bg.a < 1 ? '；背景色半透明时，按它叠在白底上计算' : ''}。</p>
      )}
      <p className="hint">
        对比度按 WCAG 2.x 公式计算，不四舍五入（4.49 就是没到 4.5）。大字指 24px 以上，或 18.66px 以上且加粗。
        {eyeDropper ? '' : '当前浏览器不支持屏幕取色（只有 Chrome / Edge 支持），可以用取色器或直接输入数值。'}
      </p>
    </div>
  )
}
