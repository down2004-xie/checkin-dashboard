import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { SAKURA_SEED, makeBurstPetals, makePetals } from '../lib/sakura'
import type { BurstPetal, Petal } from '../lib/sakura'

/** 常态飘落的花瓣数量（桌面端）。移动端由 CSS 隐藏掉一半 */
const PETAL_COUNT = 14

/** 满签爆发一次放出多少片 */
const BURST_COUNT = 44

/**
 * 爆发花瓣在 DOM 里保留多久。
 * 单片的 duration 最长 5.6s、delay 最长 0.7s，加起来 6.3s，留点余量。
 * 到点就把节点卸掉 —— 它们停在 opacity:0，但不清的话每满签一次就多留 44 个元素。
 */
const BURST_LIFETIME_MS = 7000

interface PetalLayerProps {
  /**
   * 「从未满签变成满签」的次数。0 表示本次会话还没满签过。
   *
   * 用自增计数而不是布尔值：如果只是 true/false，
   * 用户取消一个勾选再重新勾上，值从 true 变 false 再变 true，
   * 组件看得出来，但「第二次满签」和「第一次」在 DOM 上长得一模一样，
   * React 不会重建节点，动画也就不会重播。
   */
  burstId: number
}

/**
 * 飘落的花瓣层。
 *
 * 刻意放在**所有内容之上**（z-index: 1），而不是和树一起放背景层。
 * 原因只有一个：性能。玻璃卡片会 backdrop-filter 它身后的一切，
 * 花瓣如果在卡片后面飘，每一帧都要让浏览器把每张卡片背后的像素
 * 重新模糊一遍，中低端手机必掉帧。
 *
 * 放到最上层之后，花瓣走的是纯 GPU 合成层（只动 transform 和 opacity），
 * 代价接近于零，还顺带有了「花从眼前飘过」的景深感。
 * pointer-events: none 保证它不会挡住底下卡片的点击。
 */
export function PetalLayer({ burstId }: PetalLayerProps) {
  // 常态花瓣的种子加 1，和树的种子岔开 ——
  // 用同一个种子虽然也不会出错，但花瓣的横向分布会和树枝的生长随机数
  // 同源，看上去像是从树枝上生出来的，少一点偶然感
  const petals = useMemo(() => makePetals(PETAL_COUNT, SAKURA_SEED + 1), [])
  const [burst, setBurst] = useState<BurstPetal[] | null>(null)

  useEffect(() => {
    if (burstId === 0) return

    // 每批用不同的种子：连着满签两次应该看到两套不一样的花瓣
    setBurst(makeBurstPetals(BURST_COUNT, SAKURA_SEED + burstId * 131))

    const id = window.setTimeout(() => setBurst(null), BURST_LIFETIME_MS)
    return () => window.clearTimeout(id)
  }, [burstId])

  return (
    <>
      <div className="petal-layer" aria-hidden="true">
        {petals.map((petal, i) => (
          <span key={i} className="petal" style={petalStyle(petal)} />
        ))}
      </div>

      {burst && (
        /* key 必须是 burstId 而不是固定的：
           React 靠 key 判断「这还是不是同一批节点」。key 不变的话
           第二次满签会复用第一次的 DOM 元素，CSS 动画不会重头播。 */
        <div className="petal-layer petal-layer--burst" key={burstId} aria-hidden="true">
          {burst.map((petal, i) => (
            <span key={i} className="petal petal--burst" style={burstStyle(petal)} />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * 把花瓣参数写成 CSS 自定义属性。
 *
 * 为什么绕这一道：花瓣的随机参数有 8 个，如果每个都写成 CSS 类
 * 就要预先枚举出无数种组合。写成内联的 CSS 变量之后，
 * 动画逻辑完全留在 CSS 里（连 keyframes 都能读这些变量），
 * JS 只负责「给出参数」这一件事。
 */
function petalStyle(petal: Petal): CSSProperties {
  return {
    '--left': `${petal.left}%`,
    '--size': `${petal.size}px`,
    '--duration': `${petal.duration}s`,
    '--delay': `${petal.delay}s`,
    '--drift': `${petal.drift}px`,
    '--spin': petal.spin,
    '--opacity': petal.opacity,
    '--tilt': `${petal.tilt}deg`,
  } as CSSProperties
}

function burstStyle(petal: BurstPetal): CSSProperties {
  return {
    '--left': `${petal.left}%`,
    '--top': `${petal.top}%`,
    '--size': `${petal.size}px`,
    '--duration': `${petal.duration}s`,
    '--delay': `${petal.delay}s`,
    '--dx': `${petal.dx}px`,
    '--dy': `${petal.dy}px`,
    '--rise': `${petal.rise}px`,
    '--spin': petal.spin,
    '--opacity': petal.opacity,
  } as CSSProperties
}
