import { useState } from 'react'

import { decryptText, encryptText } from '../../lib/text-crypto'
import '../../styles/tools/text-encrypt.css'

type Mode = 'encrypt' | 'decrypt'

/**
 * 文本加密工具：密码 + AES-256-GCM。算法和格式在 lib/text-crypto.ts（有单测）。
 *
 * PBKDF2 60 万次迭代要几百毫秒（调用从主线程发起；WebCrypto 是异步接口，具体在哪个线程算由浏览器决定），
 * 所以运行期间显示「处理中」并禁用按钮，防止用户连点触发多次派生。
 * 输入、密码、模式一变就清掉旧输出：否则屏幕上的密文对应的是上一次的明文，容易复制错。
 * 不保存任何明文、密文和密码。
 */
export function TextEncrypt() {
  const [mode, setMode] = useState<Mode>('encrypt')
  const [input, setInput] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const reset = () => { setOutput(''); setError(null); setCopyMessage(null) }

  const run = async () => {
    if (input.trim() === '') { setError(mode === 'encrypt' ? '先输入要加密的文字' : '先粘贴要解密的密文'); return }
    if (password === '') { setError('先输入密码'); return }
    reset()
    setBusy(true)
    try {
      if (mode === 'encrypt') {
        setOutput(await encryptText(input, password))
      } else {
        const result = await decryptText(input, password)
        if (result.ok) setOutput(result.text)
        else setError(result.error)
      }
    } catch {
      // crypto.subtle 只在安全上下文（HTTPS 或 localhost）里存在；用 http 打开局域网地址时会走到这里
      setError('浏览器的加密功能不可用：请通过 HTTPS 打开本页面后再试')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopyMessage('已复制')
    } catch {
      setCopyMessage('复制失败，请在结果框里手动全选复制')
    }
  }

  const actionLabel = mode === 'encrypt' ? '加密' : '解密'

  return (
    <div className="tool-panel text-encrypt">
      <div className="filter" role="group" aria-label="模式">
        {(['encrypt', 'decrypt'] as const).map((item) => (
          <button key={item} type="button" className={`chip${mode === item ? ' chip--active' : ''}`} disabled={busy}
            aria-pressed={mode === item} onClick={() => { setMode(item); reset() }}>{item === 'encrypt' ? '加密' : '解密'}</button>
        ))}
      </div>

      <label className="unit-field text-encrypt__field">
        <span className="unit-field__label">{mode === 'encrypt' ? '要加密的文字' : '本工具加密得到的密文'}</span>
        <textarea className="site-form__input text-encrypt__text" aria-label={mode === 'encrypt' ? '明文' : '密文'} value={input}
          spellCheck={false} readOnly={busy} onChange={(event) => { setInput(event.target.value); reset() }} />
      </label>

      <div className="unit-row text-encrypt__password-row">
        <label className="unit-field text-encrypt__password">
          <span className="unit-field__label">密码</span>
          <input className="site-form__input" type={showPassword ? 'text' : 'password'} aria-label="密码" value={password}
            autoComplete="off" readOnly={busy} onChange={(event) => { setPassword(event.target.value); reset() }}
            onKeyDown={(event) => { if (event.key === 'Enter' && !busy) void run() }} />
        </label>
        <label className="check-inline text-encrypt__show">
          <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
          显示密码
        </label>
        <button type="button" className="btn btn--primary" onClick={() => { void run() }} disabled={busy} aria-busy={busy}>
          {busy ? '处理中…' : actionLabel}
        </button>
      </div>

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {output !== '' && (
        <>
          <label className="unit-field text-encrypt__field">
            <span className="unit-field__label">{mode === 'encrypt' ? '密文（Base64）' : '解密结果'}</span>
            <textarea className="site-form__input text-encrypt__text text-encrypt__output" aria-label="结果" value={output}
              readOnly spellCheck={false} />
          </label>
          <div className="unit-row text-encrypt__actions">
            <button type="button" className="btn" onClick={() => { void copy() }}>复制结果</button>
            {copyMessage && <span className="hint" role="status">{copyMessage}</span>}
          </div>
          {mode === 'encrypt' && <p className="hint">同样的文字和密码，每次加密结果都不一样，这是正常的（每次用新的随机盐和 IV）。</p>}
        </>
      )}

      <p className="hint">
        本工具的密文只能用本工具解开：格式是自定义的（版本号 + 盐 + IV + 密文），和 CryptoJS、在线 AES 工具等都不兼容。
        忘了密码就无法解开，没有任何找回办法。
      </p>
      <p className="hint">
        算法：AES-256-GCM，密钥由密码经 PBKDF2-SHA256（60 万次迭代）派生。密码越长越难破解。
        全部在浏览器本地完成，不上传、不保存。
      </p>
    </div>
  )
}
