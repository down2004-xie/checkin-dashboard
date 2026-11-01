import { useEffect, useRef, useState, type DragEvent } from 'react'

import { partitionFiles, unsupportedHint } from '../../lib/file-accept'

interface FilePickerProps {
  /** 同 <input accept>，如 "image/*"、".pdf,application/pdf" */
  accept: string
  multiple?: boolean
  /** 主文案，如「选择图片」；同时作为文件输入框的 aria-label（验收脚本按它找输入框） */
  label: string
  /** 是否响应 Ctrl+V 粘贴文件（截图类工具很需要）。默认开 */
  paste?: boolean
  onFiles: (files: File[]) => void
  /** 有文件被拒收时回调一句人话提示；不传则组件自己显示 */
  onReject?: (message: string) => void
}

/**
 * 工具箱统一的选文件入口：点击选择 + 拖放 + 粘贴，三条入口共用一把类型过滤尺子。
 *
 * 为什么要统一：<input accept> 只管点击选择，拖放和粘贴进来的文件浏览器不过滤；
 * 各工具各写一份的话，迟早有一个工具忘了过滤。
 *
 * 粘贴监听挂在 window 上（用户不会先点一下拖放区再粘贴），但只在剪贴板里**有文件**时才接管：
 * 在文本框里粘贴文字照常工作。一个页面同时只有一个工具面板，不会两个 FilePicker 抢同一次粘贴。
 */
export function FilePicker({ accept, multiple = false, label, paste = true, onFiles, onReject }: FilePickerProps) {
  const [dragging, setDragging] = useState(false)
  const [rejectMessage, setRejectMessage] = useState<string | null>(null)
  // 回调存 ref：window 监听只挂一次，又总能拿到最新的 onFiles（避免闭包拿到旧 props）
  const handlerRef = useRef({ onFiles, onReject, accept, multiple })
  handlerRef.current = { onFiles, onReject, accept, multiple }

  const deliver = (files: File[]) => {
    const { onFiles: give, onReject: reject, accept: rule, multiple: many } = handlerRef.current
    if (files.length === 0) return
    const { accepted, rejected } = partitionFiles(files, rule, many)
    const message = rejected.length > 0 ? unsupportedHint(rejected[0]) : null
    if (reject && message) reject(message)
    else setRejectMessage(message)
    if (accepted.length > 0) give(accepted)
  }
  const deliverRef = useRef(deliver)
  deliverRef.current = deliver

  useEffect(() => {
    if (!paste) return
    const handlePaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])]
      if (files.length === 0) return // 粘贴的是文字：不接管
      event.preventDefault()
      deliverRef.current(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [paste])

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    deliver([...event.dataTransfer.files])
  }

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    // dragleave 在移到子元素上时也会触发；只有真的离开整个区域才取消高亮，否则会闪
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragging(false)
  }

  return (
    <div className="file-picker">
      <label className={`file-picker__zone${dragging ? ' file-picker__zone--active' : ''}`}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true) }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        <input type="file" className="file-picker__input" accept={accept} multiple={multiple} aria-label={label}
          onChange={(event) => {
            deliver([...(event.target.files ?? [])])
            // 清空：否则重复选同一个文件不会再触发 change
            event.target.value = ''
          }} />
        <span className="file-picker__title">{label}</span>
        <span className="file-picker__hint">点击选择、拖到这里{paste ? '，或 Ctrl+V 粘贴' : ''}</span>
      </label>
      {!onReject && rejectMessage && <p className="site-form__error" role="alert">{rejectMessage}</p>}
    </div>
  )
}
