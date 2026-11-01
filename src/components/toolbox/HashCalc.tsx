import { useEffect, useRef, useState } from 'react'

import { utf8Encode } from '../../lib/encoding'
import {
  HASH_ALGORITHMS,
  digestAll,
  fileTooLargeMessage,
  matchExpected,
  type HashResults,
} from '../../lib/hash'
import '../../styles/tools/hash-calc.css'
import { FilePicker } from './FilePicker'

type Source = 'text' | 'file'

interface FileInfo {
  name: string
  size: number
}

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB`
    : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`

/**
 * 哈希计算工具：文字或文件 → MD5 / SHA-1 / SHA-256 / SHA-512，并可粘贴期望值对比。
 *
 * 文字模式输入即算（停手 200 ms 后算一次，避免每敲一个字算四遍）；
 * 文件模式整个读进内存再算（subtle.digest 不支持流式，见 lib/hash.ts 的上限说明）。
 * runId 用来丢弃过期结果：用户连续选两个文件时，先选的那个可能后算完，不能让它覆盖后选的。
 */
export function HashCalc() {
  const [source, setSource] = useState<Source>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<FileInfo | null>(null)
  const [results, setResults] = useState<HashResults | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [expected, setExpected] = useState('')
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const runId = useRef(0)

  // 组件卸载时作废进行中的任务，算完也不再 setState
  useEffect(() => () => { runId.current += 1 }, [])

  // 文字模式：输入变化后防抖计算
  useEffect(() => {
    if (source !== 'text') return
    const id = ++runId.current
    if (text === '') { setResults(null); return }
    const timer = setTimeout(() => {
      digestAll(utf8Encode(text)).then((next) => { if (runId.current === id) setResults(next) })
    }, 200)
    return () => clearTimeout(timer)
  }, [source, text])

  const switchSource = (next: Source) => {
    if (next === source) return
    runId.current += 1 // 作废另一模式还没算完的结果
    setSource(next)
    setResults(null)
    setFile(null)
    setBusy(false)
    setError(null)
    setCopyMessage(null)
  }

  const hashFile = async (picked: File) => {
    const id = ++runId.current
    setFile({ name: picked.name, size: picked.size })
    setResults(null)
    setCopyMessage(null)
    const tooLarge = fileTooLargeMessage(picked.size)
    if (tooLarge) { setError(tooLarge); setBusy(false); return }
    setError(null)
    setBusy(true)
    setProgress(0)
    try {
      const data = new Uint8Array(await picked.arrayBuffer())
      if (runId.current !== id) return
      const next = await digestAll(data, (done) => { if (runId.current === id) setProgress(done) })
      if (runId.current === id) setResults(next)
    } catch {
      // 读取失败多半是内存不够，或者文件在选中后被移动/删除了
      if (runId.current === id) setError('读取文件失败：可能是文件太大、内存不够，或文件已被移动。请重试或换个小一点的文件。')
    } finally {
      if (runId.current === id) setBusy(false)
    }
  }

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(`已复制 ${label}`)
    } catch {
      setCopyMessage('复制失败，请手动选中哈希值复制')
    }
  }

  const match = results ? matchExpected(expected, results) : null

  return (
    <div className="tool-panel hash-calc">
      <div className="filter" role="group" aria-label="计算对象">
        {(['text', 'file'] as const).map((item) => (
          <button key={item} type="button" className={`chip${source === item ? ' chip--active' : ''}`}
            aria-pressed={source === item} onClick={() => switchSource(item)}>{item === 'text' ? '文字' : '文件'}</button>
        ))}
      </div>

      {source === 'text' && (
        <label className="unit-field hash-calc__field">
          <span className="unit-field__label">输入文字（按 UTF-8 字节计算）</span>
          <textarea className="site-form__input hash-calc__text" aria-label="要计算哈希的文字" value={text}
            spellCheck={false} placeholder="输入后自动计算" onChange={(event) => setText(event.target.value)} />
        </label>
      )}

      {source === 'file' && (
        <>
          <FilePicker accept="" label="选择文件" onFiles={(files) => { void hashFile(files[0]) }} />
          {file && <p className="hint hash-calc__file">{file.name}（{formatSize(file.size)}）</p>}
          {busy && (
            <div className="hash-calc__progress" role="status">
              <progress max={1} value={progress} aria-label="计算进度" />
              <span className="hint">计算中 {Math.round(progress * 100)}%</span>
            </div>
          )}
        </>
      )}

      {error && <p className="site-form__error" role="alert">{error}</p>}

      {results && (
        <dl className="hash-calc__results">
          {HASH_ALGORITHMS.map((algorithm) => {
            const highlighted = match && (match.status === 'match' || match.status === 'mismatch') && match.algorithm === algorithm
            return (
              <div key={algorithm} className={`hash-calc__row${highlighted ? ` hash-calc__row--${match.status}` : ''}`} data-algorithm={algorithm}>
                <dt className="hash-calc__name">{algorithm}</dt>
                <dd className="hash-calc__value">{results[algorithm]}</dd>
                <dd className="hash-calc__copy">
                  <button type="button" className="btn" onClick={() => { void copy(results[algorithm], algorithm) }}>复制</button>
                </dd>
              </div>
            )
          })}
        </dl>
      )}
      {copyMessage && <p className="hint" role="status">{copyMessage}</p>}

      <label className="unit-field hash-calc__field">
        <span className="unit-field__label">对比期望值（粘贴下载页给的哈希，自动识别算法，不分大小写）</span>
        <input className="site-form__input hash-calc__expected" aria-label="期望的哈希值" value={expected}
          spellCheck={false} placeholder="例如 e3b0c442…" onChange={(event) => setExpected(event.target.value)} />
      </label>
      {match?.status === 'match' && (
        <p className="hash-calc__verdict hash-calc__verdict--match" role="status">✓ 一致（{match.algorithm}）：文件没有损坏，和发布者给的是同一份</p>
      )}
      {match?.status === 'mismatch' && (
        <p className="hash-calc__verdict hash-calc__verdict--mismatch" role="status">✗ 不一致（{match.algorithm}）：文件可能下载不完整或被改过，建议重新下载</p>
      )}
      {match?.status === 'invalid' && <p className="site-form__error" role="status">{match.message}</p>}
      {!results && expected.trim() !== '' && <p className="hint">先输入文字或选择文件，算出结果后自动对比。</p>}

      <p className="hint">
        哈希是单向的「指纹」，不能「解密」。网上所谓的 MD5 解密，其实是拿常见密码提前算好一张对照表去查，
        查不到就解不出来。MD5 和 SHA-1 已能被人为构造碰撞，只适合校验下载是否完整，防篡改请用 SHA-256 或以上。
      </p>
      <p className="hint">文件只在本机读取计算，不会上传。单个文件上限 1 GB（浏览器要把整个文件读进内存）。</p>
    </div>
  )
}
