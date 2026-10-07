/**
 * 补间缓动函数。
 *
 * 为什么放在 lib：缓动是纯数学，不依赖 React 和 DOM，可以单测；
 * rAF 驱动的部分留在 hooks/useTweenNumber。
 */

/**
 * 三次方缓出：起步快、收尾慢。
 *
 * 数字滚动和进度弧生长用「缓出」而不是线性 —— 真实物体的运动
 * 都是先快后慢地停下，线性变化看起来像机器。
 * 选 cubic 而不是更陡的 quart/quint：450ms 的短补间里体感差别不大，
 * 而且 cubic 不会过冲 —— 进度超过目标再弹回来是错误感
 * （勾选按钮的 pop 动画要过冲，进度弧不要，语义不同）。
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
