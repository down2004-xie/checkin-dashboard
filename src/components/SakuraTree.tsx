import { useMemo } from 'react'

import { SAKURA_SEED, buildSakuraTree } from '../lib/sakura'

interface SakuraTreeProps {
  /**
   * 今天是否已全部签完。
   * false → 满树含苞（花苞小、颜色淡）
   * true  → 满开（大花淡入，树冠亮一下）
   */
  fullBloom: boolean
}

/**
 * 背景层的樱花树。
 *
 * 定位在整个页面的最底层（z-index: -1），也就是玻璃卡片的**背后**。
 * 这是刻意的：卡片的 backdrop-filter 会把身后的东西糊掉，
 * 一棵树被玻璃糊成一片粉色光斑，正是玻璃效果最好的展示。
 *
 * 代价是每帧重绘 —— 树一旦动起来，它背后那几张卡片的模糊就得重算。
 * 所以摆动做得极慢（11 秒），并且在移动端直接关掉（见 sakura.css）。
 *
 * 整棵树用 SVG path 画，不用图片：
 *   1. 体积上是几百字节的 path 字符串，比一张背景图小一个数量级
 *   2. 能直接吃 CSS 变量，跟着时段配色走
 *   3. 递归生成的形态可以调参数，图片改不动
 */
export function SakuraTree({ fullBloom }: SakuraTreeProps) {
  // 只在首帧生成一次。种子固定，所以「生成」这件事本身是幂等的 ——
  // 加这个 useMemo 只是省掉每次重渲染几百次递归，不是为了稳定形态
  const tree = useMemo(() => buildSakuraTree(SAKURA_SEED), [])

  const { bounds } = tree
  // viewBox 由树的实际包围盒算出来，而不是写死。
  // 这样换种子换形态时，树永远刚好填满容器，不会缩在角落
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${
    bounds.maxY - bounds.minY
  }`

  return (
    <div className={`sakura${fullBloom ? ' sakura--full' : ''}`} aria-hidden="true">
      {/* 满开时亮起的柔光。用单独的渐变 div 而不是 SVG 的 filter:
          filter 会新建一层渲染上下文，对这个尺寸的元素不划算 */}
      <div className="sakura__glow" />

      <svg
        className="sakura__svg"
        viewBox={viewBox}
        /* 右下对齐：树根钉在视口右下角，树干从画面外长进来。
           换成默认的 xMidYMid 树会飘到容器中间，构图就散了 */
        preserveAspectRatio="xMaxYMax meet"
      >
        <defs>
          <radialGradient id="sakura-bloom-grad">
            {/* 颜色由 sakura.css 通过 CSS 变量给。
                不能写成 stop-color="var(--x)" 属性 ——
                表现属性按 SVG 值解析，不认 CSS 变量，会静默失效 */}
            <stop className="sakura__stop-core" offset="0%" />
            <stop className="sakura__stop-mid" offset="60%" />
            <stop className="sakura__stop-edge" offset="100%" />
          </radialGradient>
        </defs>

        {/* 会摆动的部分单独包一层，transform-origin 设在树根 */}
        <g className="sakura__canopy">
          <g className="sakura__branches">
            {tree.branches.map((branch, i) => (
              <path key={i} d={branch.d} strokeWidth={branch.width} />
            ))}
          </g>

          {/* 花苞：一直都在，撑起树冠的轮廓 */}
          <g className="sakura__buds">
            {tree.buds.map((bud, i) => (
              <circle
                key={i}
                cx={bud.x}
                cy={bud.y}
                r={bud.r}
                opacity={bud.opacity}
              />
            ))}
          </g>

          {/* 盛开的花：默认不可见，满签时整组淡入 + 微微张开 */}
          <g className="sakura__blooms">
            {tree.blooms.map((bloom, i) => (
              <circle
                key={i}
                cx={bloom.x}
                cy={bloom.y}
                r={bloom.r}
                opacity={bloom.opacity}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  )
}
