import { useMemo, useState } from 'react'

import { caesarDecrypt, caesarEncrypt, decodeMorse, encodeMorse } from '../../lib/classic-cipher'
import {
  decodeBase64,
  decodeHex,
  decodeUrl,
  encodeBase64,
  encodeHex,
  encodeUrl,
  escapeUnicode,
  unescapeUnicode,
} from '../../lib/encoding'
import '../../styles/tools/encode-convert.css'

type Mode = 'base64' | 'url' | 'unicode' | 'hex' | 'caesar' | 'morse'
type Direction = 'encode' | 'decode'

const MODES: { id: Mode; label: string }[] = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'hex', label: '十六进制' },
  { id: 'caesar', label: '凯撒密码' },
  { id: 'morse', label: '摩斯电码' },
]

/** 每种模式下面的一句说明。Base64 那句是硬要求：很多人以为 Base64 是加密 */
const NOTES: Record<Mode, string> = {
  base64: 'Base64 不是加密：它只是把字节换成 64 个可打印字符，任何人都能还原。别用它「藏」密码。文字按 UTF-8 编码，解码同时认标准和 URL 安全两种写法。',
  url: '按 encodeURIComponent 规则编码，适合拼进网址的参数。注意表单里的 + 代表空格，这里解码时 + 原样保留。',
  unicode: '转成 \\uXXXX 形式。emoji 等超出 FFFF 的字符写成两个 \\u（代理对），JSON、Java、JS 都认；解码也接受 \\u{1F600} 写法。',
  hex: '每个字节两位十六进制，文字先按 UTF-8 转字节（一个汉字 3 字节）。解码时可带空格、0x 前缀或冒号分隔。',
  caesar: '只移动英文字母 A-Z / a-z，数字、中文、标点原样保留。偏移可以是负数，也可以大于 26。凯撒密码只有 25 种可能，挨个试就能破，只适合玩。',
  morse: '支持英文字母、数字和常见标点，字母间用空格、单词间用 / 分隔。中文不支持（中文电报用的是另一套四位数字码）。',
}

interface Conversion {
  value: string
  error: string | null
  /** 摩斯电码里被原样保留的字符 */
  unsupported: string[]
}

/**
 * 编码转换工具：六种编码共用一组「输入 → 输出」框，靠 mode + direction 切换。
 *
 * 输出用 useMemo 从输入派生（不存 state）：输入、模式、选项任何一个变了，输出立刻跟上，
 * 不会出现「改了输入，输出还是上一次点按钮的结果」的失同步。
 * 所有转换逻辑在 lib/encoding.ts 和 lib/classic-cipher.ts（有单测），这里只做渲染。
 */
export function EncodeConvert() {
  const [mode, setMode] = useState<Mode>('base64')
  const [direction, setDirection] = useState<Direction>('encode')
  const [input, setInput] = useState('')
  const [urlSafe, setUrlSafe] = useState(false)
  const [escapeAscii, setEscapeAscii] = useState(false)
  const [shiftText, setShiftText] = useState('3')
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const result = useMemo<Conversion>(() => {
    const plain = (value: string): Conversion => ({ value, error: null, unsupported: [] })
    const from = (r: { ok: true; value: string } | { ok: false; error: string }): Conversion =>
      r.ok ? plain(r.value) : { value: '', error: r.error, unsupported: [] }
    if (input === '') return plain('')
    const encode = direction === 'encode'
    switch (mode) {
      case 'base64': return encode ? plain(encodeBase64(input, { urlSafe })) : from(decodeBase64(input))
      case 'url': return from(encode ? encodeUrl(input) : decodeUrl(input))
      case 'unicode': return encode ? plain(escapeUnicode(input, { escapeAscii })) : from(unescapeUnicode(input))
      case 'hex': return encode ? plain(encodeHex(input)) : from(decodeHex(input))
      case 'caesar': {
        const shift = Number(shiftText)
        if (shiftText.trim() === '' || !Number.isInteger(shift)) return { value: '', error: '偏移量要是整数（可以是负数）', unsupported: [] }
        return plain(encode ? caesarEncrypt(input, shift) : caesarDecrypt(input, shift))
      }
      case 'morse': {
        const morse = encode ? encodeMorse(input) : decodeMorse(input)
        return { value: morse.value, error: null, unsupported: morse.unsupported }
      }
    }
  }, [mode, direction, input, urlSafe, escapeAscii, shiftText])

  const encodeLabel = mode === 'caesar' ? '加密' : '编码'
  const decodeLabel = mode === 'caesar' ? '解密' : '解码'

  const switchMode = (next: Mode) => { setMode(next); setCopyMessage(null) }
  const switchDirection = (next: Direction) => { setDirection(next); setCopyMessage(null) }

  /** 把输出挪到输入并反转方向：方便「编完马上解回去」核对 */
  const swap = () => {
    if (result.error || result.value === '') return
    setInput(result.value)
    setDirection(direction === 'encode' ? 'decode' : 'encode')
    setCopyMessage(null)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.value)
      setCopyMessage('已复制')
    } catch {
      // 非 HTTPS、浏览器拒绝剪贴板权限时会失败；输出框是只读文本框，用户仍可以手动选中复制
      setCopyMessage('复制失败，请在输出框里手动全选复制')
    }
  }

  return (
    <div className="tool-panel encode-convert">
      <div className="filter" role="group" aria-label="编码类型">
        {MODES.map((item) => (
          <button key={item.id} type="button" className={`chip${mode === item.id ? ' chip--active' : ''}`}
            aria-pressed={mode === item.id} onClick={() => switchMode(item.id)}>{item.label}</button>
        ))}
      </div>

      <div className="encode-convert__bar">
        <div className="filter encode-convert__direction" role="group" aria-label="方向">
          <button type="button" className={`chip${direction === 'encode' ? ' chip--active' : ''}`}
            aria-pressed={direction === 'encode'} onClick={() => switchDirection('encode')}>{encodeLabel}</button>
          <button type="button" className={`chip${direction === 'decode' ? ' chip--active' : ''}`}
            aria-pressed={direction === 'decode'} onClick={() => switchDirection('decode')}>{decodeLabel}</button>
        </div>
        {mode === 'base64' && direction === 'encode' && (
          <label className="check-inline encode-convert__option">
            <input type="checkbox" checked={urlSafe} onChange={(event) => setUrlSafe(event.target.checked)} />
            URL 安全（-_，不补 =）
          </label>
        )}
        {mode === 'unicode' && direction === 'encode' && (
          <label className="check-inline encode-convert__option">
            <input type="checkbox" checked={escapeAscii} onChange={(event) => setEscapeAscii(event.target.checked)} />
            英文和数字也转义
          </label>
        )}
        {mode === 'caesar' && (
          <label className="unit-field encode-convert__shift">
            <span className="unit-field__label">偏移量</span>
            <input className="site-form__input" type="number" step={1} inputMode="numeric" aria-label="偏移量"
              value={shiftText} onChange={(event) => setShiftText(event.target.value)} />
          </label>
        )}
      </div>

      <label className="unit-field encode-convert__field">
        <span className="unit-field__label">输入</span>
        <textarea className="site-form__input encode-convert__text" aria-label="输入文本" value={input}
          spellCheck={false} placeholder={direction === 'encode' ? '输入要转换的文字' : '粘贴要还原的内容'}
          onChange={(event) => { setInput(event.target.value); setCopyMessage(null) }} />
      </label>

      <label className="unit-field encode-convert__field">
        <span className="unit-field__label">输出</span>
        <textarea className="site-form__input encode-convert__text encode-convert__output" aria-label="输出结果"
          value={result.value} readOnly spellCheck={false} placeholder="结果显示在这里" />
      </label>

      {result.error && <p className="site-form__error" role="alert">{result.error}</p>}
      {result.unsupported.length > 0 && (
        <p className="site-form__error" role="status">
          {direction === 'encode' ? '摩斯电码不支持这些字符，已原样保留' : '这些码组认不出，已原样保留'}：{result.unsupported.join(' ')}
        </p>
      )}

      <div className="unit-row encode-convert__actions">
        <button type="button" className="btn btn--primary" onClick={copy} disabled={result.value === ''}>复制结果</button>
        <button type="button" className="btn" onClick={swap} disabled={result.value === '' || result.error !== null}>输出放回输入</button>
        {copyMessage && <span className="hint" role="status">{copyMessage}</span>}
      </div>

      <p className="hint">{NOTES[mode]}</p>
      <p className="hint">所有转换都在浏览器本地完成，不上传、不保存。</p>
    </div>
  )
}
