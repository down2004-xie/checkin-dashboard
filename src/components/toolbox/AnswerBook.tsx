import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { ANSWERS } from '../../data/answers'
import { HOLD_MS, holdProgress, pickAnswer } from '../../lib/answer-book'
import '../../styles/tools/answer-book.css'

/** 松手时给的提示：太早松手 / 被系统打断（来电、手势、切窗口） */
type HoldNotice = 'early' | 'cancel' | null

const NOTICE_TEXT: Record<Exclude<HoldNotice, null>, string> = {
  early: `松手太早了，书还没翻开。按住约 ${HOLD_MS / 1000} 秒试试`,
  cancel: '按住被打断了，再按住一次',
}

const isHoldKey = (key: string) => key === ' ' || key === 'Enter'

/**
 * 答案之书：按住按钮约 1.5 秒，翻开一条随机答案。
 *
 * 为什么要「按住」而不是点一下：这个玩法的乐趣在于默念问题的那几秒，点一下太随意。
 * 但按住对一部分人不友好（读屏软件只会发「点击」，手部不便的人按不住），
 * 所以旁边留一个「直接翻开」的入口。
 *
 * 实现要点：
 * - 计时用 requestAnimationFrame 读 performance.now()，不累加帧数：
 *   掉帧或后台节流时帧数不准，时间戳准。
 * - 起点存 ref 不存 state：pointerup / keyup 回调要读到「此刻」的值，state 会有闭包旧值的问题。
 * - 鼠标、触屏、笔走 pointer 事件 + setPointerCapture：手指稍微滑出按钮不算松手；
 *   pointercancel（系统接管了这次触摸）只复位、提示「被打断」，不算「松手太早」。
 * - 键盘：按住空格或回车。keydown 会自动重复，靠 ref 判重，只认第一次。
 * - 抽签逻辑（不连续重复）在 lib/answer-book.ts。不记录历史、不碰 localStorage。
 */
export function AnswerBook() {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [answerIndex, setAnswerIndex] = useState(-1)
  // 每翻一次 +1，作为答案卡片的 key：换 key 会重新挂载元素，翻书动画才会再播一遍
  const [revealCount, setRevealCount] = useState(0)
  const [notice, setNotice] = useState<HoldNotice>(null)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const answerRef = useRef(-1)

  const reveal = () => {
    const next = pickAnswer(ANSWERS, answerRef.current)
    answerRef.current = next
    setAnswerIndex(next)
    setRevealCount((count) => count + 1)
    setNotice(null)
  }

  const startHold = () => {
    if (startRef.current !== null) return
    startRef.current = performance.now()
    setHolding(true)
    setProgress(0)
    setNotice(null)
    const step = () => {
      const start = startRef.current
      if (start === null) return
      const value = holdProgress(performance.now() - start)
      if (value >= 1) {
        // 按够了：立刻翻开，不必等松手。之后的 pointerup 看到 startRef 为空，什么都不做
        startRef.current = null
        frameRef.current = 0
        setHolding(false)
        setProgress(0)
        reveal()
        return
      }
      setProgress(value)
      frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
  }

  /** 结束按住。只有还在计时时才有事做；reason 决定给哪句提示 */
  const endHold = (reason: Exclude<HoldNotice, null>) => {
    if (startRef.current === null) return
    startRef.current = null
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    setHolding(false)
    setProgress(0)
    setNotice(reason)
  }

  // 按住时切走窗口（Alt+Tab、来电）收不到 pointerup / keyup，不复位的话回来时按钮卡在「按住中」。
  // endHold 只读 ref 和 setState，不依赖渲染时的值，所以监听只在 holding 变化时挂/摘一次
  useEffect(() => {
    if (!holding) return
    const onBlur = () => endHold('cancel')
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [holding])

  // 卸载时停掉动画帧，免得对已卸载组件 setState
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // 只认主键（左键 / 手指 / 笔尖），右键不算
    if (event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 极少数情况下指针已失效，捕获失败不影响计时
    }
    startHold()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) return
    // 阻止默认行为：回车在 keydown 时就会触发 click，空格会滚动页面
    event.preventDefault()
    if (!event.repeat) startHold()
  }

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) return
    event.preventDefault()
    endHold('early')
  }

  const answer = answerIndex >= 0 ? ANSWERS[answerIndex] : null
  const label = holding ? '继续按住…' : answer === null ? '按住翻开' : '按住，再问一次'

  return (
    <div className="tool-panel answer-book">
      <p className="hint answer-book__intro">心里默念一个问题，然后按住下面的按钮约 {HOLD_MS / 1000} 秒，书会翻开。</p>

      <div className="answer-book__stage" aria-live="polite">
        {answer === null ? (
          <div className="answer-book__cover">
            <span className="answer-book__cover-title">答案之书</span>
            <span className="answer-book__cover-sub">默念你的问题</span>
          </div>
        ) : (
          <div key={revealCount} className="answer-book__page">
            <span className="answer-book__answer">{answer}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`btn btn--primary answer-book__button${holding ? ' answer-book__button--holding' : ''}`}
        onPointerDown={onPointerDown}
        onPointerUp={() => endHold('early')}
        onPointerCancel={() => endHold('cancel')}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => endHold('cancel')}
        // 触屏长按会弹出系统菜单，打断这次按住
        onContextMenu={(event) => event.preventDefault()}
        aria-describedby="answer-book-howto"
      >
        {label}
      </button>
      <div className="answer-book__progress" role="progressbar" aria-label="按住进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span className="answer-book__progress-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="hint answer-book__notice" role="status">{notice ? NOTICE_TEXT[notice] : ''}</p>

      <button type="button" className="btn answer-book__direct" onClick={reveal}>直接翻开（不用按住）</button>

      <p className="hint" id="answer-book-howto">
        鼠标、手指按住，或聚焦按钮后按住空格 / 回车都可以。
        仅供娱乐，随机抽取，不是预测。书里共 {ANSWERS.length} 条答案，不记录你的问题和结果，刷新即清空。
      </p>
    </div>
  )
}
