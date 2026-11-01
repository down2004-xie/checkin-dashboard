/* 答案之书 —— 纯函数，可单测。
 *
 * 随机源 `random` 可注入（和 random-pick.ts 同一个动机）：测试注入固定序列，
 * 结果可复现、可断言；组件里用默认的 Math.random。
 */

/** 随机源：返回 [0, 1) 的数 */
export type Random = () => number

/** 按住多久才翻开（毫秒）。太短等于普通点击，没有「默念问题」的仪式感；太长会不耐烦 */
export const HOLD_MS = 1500

/**
 * 抽一条答案，返回它在清单里的下标。清单为空返回 -1。
 *
 * 不连续两次抽到同一条：连抽两次同一句，用户会以为按钮坏了。
 * 做法是只在「除了上一条之外」的 n−1 条里抽：先抽 0..n−2，落在上一条或之后的就整体后移一位。
 * 这样每条剩下的答案概率仍然相等（都是 1/(n−1)），不用「抽到重复就重抽」那种
 * 理论上可能一直不停的循环。
 *
 * previousIndex 传 -1（或任何越界值）表示没有上一条。
 */
export function pickAnswer(answers: readonly string[], previousIndex: number, random: Random = Math.random): number {
  const count = answers.length
  if (count === 0) return -1
  const hasPrevious = Number.isInteger(previousIndex) && previousIndex >= 0 && previousIndex < count
  // 只有一条时没得换，只能重复
  if (count === 1) return 0
  const pool = hasPrevious ? count - 1 : count
  // min 兜底：random() 理论上不该返回 1，但被注入的假随机源可能会
  const index = Math.min(Math.floor(random() * pool), pool - 1)
  return hasPrevious && index >= previousIndex ? index + 1 : index
}

/** 按住进度（0~1）：已按住的毫秒数 / HOLD_MS，夹在 [0, 1] 内 */
export function holdProgress(elapsedMs: number, holdMs: number = HOLD_MS): number {
  if (!(elapsedMs > 0) || !(holdMs > 0)) return 0
  return Math.min(1, elapsedMs / holdMs)
}
