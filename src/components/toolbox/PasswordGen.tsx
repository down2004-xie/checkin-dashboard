import { useState } from 'react'

import {
  DEFAULT_PASSWORD_OPTIONS,
  MAX_LENGTH,
  MIN_LENGTH,
  generatePassword,
  strengthOf,
  type PasswordOptions,
  type PasswordResult,
} from '../../lib/password'
import '../../styles/tools/password-gen.css'

type ClassKey = 'upper' | 'lower' | 'digits' | 'symbols'

const CLASS_OPTIONS: { key: ClassKey; label: string }[] = [
  { key: 'upper', label: '大写 A-Z' },
  { key: 'lower', label: '小写 a-z' },
  { key: 'digits', label: '数字 0-9' },
  { key: 'symbols', label: '符号 !@#…' },
]

const clampLength = (value: number) => Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(value)))

/**
 * 密码生成器。算法在 lib/password.ts（crypto.getRandomValues + 拒绝采样，有单测）。
 *
 * 每次改选项就当场重新生成（在事件处理里算，不放 useEffect：选项和密码是一次操作的两个结果，
 * 放 effect 会先渲染一帧「新选项 + 旧密码」）。
 * 只保留当前这一个密码，不记录历史、不落盘 —— 生成过的密码留在页面上就是多一处泄露点。
 */
export function PasswordGen() {
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS)
  // 长度输入框单独存文本：用户删光重打「24」时，中间会经过空串和「2」，不能每一步都夹到 8
  const [lengthText, setLengthText] = useState(String(DEFAULT_PASSWORD_OPTIONS.length))
  const [result, setResult] = useState<PasswordResult>(() => generatePassword(DEFAULT_PASSWORD_OPTIONS))
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const apply = (patch: Partial<PasswordOptions>) => {
    const next = { ...options, ...patch }
    setOptions(next)
    setResult(generatePassword(next))
    setCopyMessage(null)
  }

  const changeLengthText = (text: string) => {
    setLengthText(text)
    const value = Number(text)
    if (text.trim() !== '' && Number.isInteger(value) && value >= MIN_LENGTH && value <= MAX_LENGTH) apply({ length: value })
  }

  /** 失焦时把不合法的长度纠正回范围内，输入框和实际长度重新对齐 */
  const commitLengthText = () => {
    const value = Number(lengthText)
    const fixed = Number.isFinite(value) && lengthText.trim() !== '' ? clampLength(value) : options.length
    setLengthText(String(fixed))
    if (fixed !== options.length) apply({ length: fixed })
  }

  const copy = async () => {
    if (!result.ok) return
    try {
      await navigator.clipboard.writeText(result.password)
      setCopyMessage('已复制')
    } catch {
      setCopyMessage('复制失败，请手动选中密码复制')
    }
  }

  const strength = result.ok ? strengthOf(result.entropyBits) : null

  return (
    <div className="tool-panel password-gen">
      <div className="password-gen__output">
        <output className="password-gen__value" aria-label="生成的密码" aria-live="polite">
          {result.ok ? result.password : '—'}
        </output>
        <div className="password-gen__buttons">
          <button type="button" className="btn btn--primary" onClick={() => apply({})}>重新生成</button>
          <button type="button" className="btn" onClick={() => { void copy() }} disabled={!result.ok}>复制</button>
        </div>
      </div>
      {copyMessage && <p className="hint" role="status">{copyMessage}</p>}

      {!result.ok && <p className="site-form__error" role="alert">{result.error}</p>}

      {result.ok && strength && (
        <div className={`password-gen__strength password-gen__strength--${strength.level}`}>
          <div className="password-gen__meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (result.entropyBits / 128) * 100)}%` }} />
          </div>
          <span className="password-gen__strength-text">
            强度：<strong>{strength.label}</strong>（约 {Math.floor(result.entropyBits)} 比特熵，字符集 {result.poolSize} 个）
          </span>
        </div>
      )}

      <div className="unit-row password-gen__length">
        <label className="unit-field password-gen__length-field">
          <span className="unit-field__label">长度（{MIN_LENGTH}~{MAX_LENGTH}）</span>
          <input className="site-form__input" type="number" min={MIN_LENGTH} max={MAX_LENGTH} step={1} inputMode="numeric"
            aria-label="密码长度" value={lengthText}
            onChange={(event) => changeLengthText(event.target.value)} onBlur={commitLengthText} />
        </label>
        <input type="range" className="password-gen__slider" min={MIN_LENGTH} max={MAX_LENGTH} step={1} aria-label="密码长度滑块"
          value={options.length} onChange={(event) => { setLengthText(event.target.value); apply({ length: Number(event.target.value) }) }} />
      </div>

      <div className="password-gen__classes" role="group" aria-label="字符类型">
        {CLASS_OPTIONS.map((item) => (
          <label key={item.key} className="check-inline">
            <input type="checkbox" checked={options[item.key]} onChange={(event) => apply({ [item.key]: event.target.checked })} />
            {item.label}
          </label>
        ))}
        <label className="check-inline">
          <input type="checkbox" checked={options.excludeAmbiguous} onChange={(event) => apply({ excludeAmbiguous: event.target.checked })} />
          排除易混字符（0 O 1 l I）
        </label>
      </div>

      <p className="hint">
        用浏览器的密码学安全随机数（crypto.getRandomValues）生成，选中的每类字符至少出现一次。
        密码只显示在本页，不记录、不上传，刷新即消失。
      </p>
      <p className="hint">
        强度按「长度 × log2(字符集大小)」估算，前提是密码真的随机生成。自己编的密码（生日、单词加数字）实际强度远低于这个数。
      </p>
    </div>
  )
}
