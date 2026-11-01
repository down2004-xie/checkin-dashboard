import { describe, expect, it } from 'vitest'

import {
  IDENTITY_ORIENTATION,
  applyMatrix,
  applyOrientationOp,
  clampRect,
  fullRect,
  normalizeRotation,
  orientationMatrix,
  pointsToRatio,
  ratioRectToPixels,
  rotatedSize,
  transformCropRect,
  type Orientation,
  type OrientationOp,
  type Rotation,
} from './image-transform'

describe('normalizeRotation', () => {
  it('归一到 0/90/180/270', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(180)).toBe(180)
    expect(normalizeRotation(270)).toBe(270)
  })

  it('超出一圈取模', () => {
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(720)).toBe(0)
  })

  it('负数归一（-90 → 270）', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(-180)).toBe(180)
    expect(normalizeRotation(-270)).toBe(90)
  })

  it('非整档就近取整', () => {
    expect(normalizeRotation(44)).toBe(0)
    expect(normalizeRotation(46)).toBe(90)
  })
})

describe('rotatedSize', () => {
  const size = { width: 400, height: 300 }
  it('90/270 宽高互换', () => {
    expect(rotatedSize(size, 90)).toEqual({ width: 300, height: 400 })
    expect(rotatedSize(size, 270)).toEqual({ width: 300, height: 400 })
  })
  it('0/180 不变', () => {
    expect(rotatedSize(size, 0)).toEqual(size)
    expect(rotatedSize(size, 180)).toEqual(size)
  })
})

describe('fullRect', () => {
  it('覆盖整张图', () => {
    expect(fullRect({ width: 100, height: 50 })).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })
})

describe('clampRect', () => {
  const bounds = { width: 100, height: 100 }

  it('越界矩形被钳进边界', () => {
    const rect = clampRect({ x: -10, y: -10, width: 50, height: 50 }, bounds)
    expect(rect).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('右下角超出时收缩宽高', () => {
    const rect = clampRect({ x: 80, y: 80, width: 50, height: 50 }, bounds)
    expect(rect).toEqual({ x: 80, y: 80, width: 20, height: 20 })
  })

  it('宽高至少 1px', () => {
    const rect = clampRect({ x: 50, y: 50, width: 0, height: 0 }, bounds)
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})

describe('ratioRectToPixels', () => {
  it('百分比转像素', () => {
    const rect = ratioRectToPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 }, { width: 400, height: 200 })
    expect(rect).toEqual({ x: 100, y: 100, width: 200, height: 100 })
  })

  it('超范围会 clamp', () => {
    const rect = ratioRectToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, { width: 100, height: 100 })
    expect(rect.x).toBe(90)
    expect(rect.width).toBe(10)
  })
})

describe('pointsToRatio', () => {
  const expectRatio = (actual: ReturnType<typeof pointsToRatio>, expected: { x: number; y: number; width: number; height: number }) => {
    expect(actual.x).toBeCloseTo(expected.x, 10)
    expect(actual.y).toBeCloseTo(expected.y, 10)
    expect(actual.width).toBeCloseTo(expected.width, 10)
    expect(actual.height).toBeCloseTo(expected.height, 10)
  }

  it('正向拖拽（左上→右下）', () => {
    expectRatio(pointsToRatio(0.1, 0.2, 0.6, 0.8), { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
  })

  it('反向拖拽（右下→左上）也能得到正向矩形', () => {
    expectRatio(pointsToRatio(0.6, 0.8, 0.1, 0.2), { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
  })

  it('拖出容器被 clamp 到 0~1', () => {
    expectRatio(pointsToRatio(-0.5, -0.5, 1.5, 1.5), { x: 0, y: 0, width: 1, height: 1 })
  })
})

/* ---------- 方向与矩阵 ---------- */

type Grid = string[][]

/** 参照实现：直接在像素网格上做「屏幕上看到的」操作，和矩阵实现完全独立 */
function screenOp(grid: Grid, op: OrientationOp): Grid {
  const h = grid.length
  const w = grid[0].length
  if (op === 'rotate') return Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, c) => grid[h - 1 - c][r]))
  if (op === 'flipH') return grid.map((row) => [...row].reverse())
  return [...grid].reverse()
}

/** 用矩阵把原图每个像素（取像素中心）搬到输出网格，模拟 setTransform + drawImage */
function renderWithMatrix(grid: Grid, orientation: Orientation): Grid {
  const source = { width: grid[0].length, height: grid.length }
  const out = rotatedSize(source, orientation.rotation)
  const m = orientationMatrix(source, orientation)
  const result: Grid = Array.from({ length: out.height }, () => Array.from({ length: out.width }, () => '?'))
  grid.forEach((row, y) => row.forEach((label, x) => {
    const p = applyMatrix(m, { x: x + 0.5, y: y + 0.5 })
    result[Math.floor(p.y)][Math.floor(p.x)] = label
  }))
  return result
}

const SOURCE_3x2: Grid = [['a', 'b', 'c'], ['d', 'e', 'f']]

/** 长度 0~4 的全部操作序列 */
function allSequences(maxLength: number): OrientationOp[][] {
  const ops: OrientationOp[] = ['rotate', 'flipH', 'flipV']
  let level: OrientationOp[][] = [[]]
  const all: OrientationOp[][] = [[]]
  for (let i = 0; i < maxLength; i += 1) {
    level = level.flatMap((seq) => ops.map((op) => [...seq, op]))
    all.push(...level)
  }
  return all
}

describe('orientationMatrix + applyOrientationOp（翻转沿屏幕轴）', () => {
  it('2×1 的图旋转 90° 后点水平翻转：左像素仍在上、右像素仍在下（旧 bug 会上下颠倒）', () => {
    const source = { width: 2, height: 1 }
    const rotated = applyOrientationOp(IDENTITY_ORIENTATION, 'rotate')
    const flipped = applyOrientationOp(rotated, 'flipH')
    const m = orientationMatrix(source, flipped)
    // 输出是 1×2：左像素中心 (0.5, 0.5)、右像素中心 (1.5, 0.5)
    const left = applyMatrix(m, { x: 0.5, y: 0.5 })
    const right = applyMatrix(m, { x: 1.5, y: 0.5 })
    // 只有一列，水平翻转对它是恒等：左像素落在 (0, 0)，右像素落在 (0, 1)
    expect([Math.floor(left.x), Math.floor(left.y)]).toEqual([0, 0])
    expect([Math.floor(right.x), Math.floor(right.y)]).toEqual([0, 1])
    // 旧实现「先 rotate 再 scale(-1, 1)」等于在原图上做水平翻转再旋转 → 左像素跑到下面
    const buggy = orientationMatrix(source, { rotation: 90, mirror: true })
    expect(Math.floor(applyMatrix(buggy, { x: 0.5, y: 0.5 }).y)).toBe(1)
  })

  it('2×1 的图旋转 90° 后点垂直翻转：左右像素上下互换', () => {
    const source = { width: 2, height: 1 }
    const o = applyOrientationOp(applyOrientationOp(IDENTITY_ORIENTATION, 'rotate'), 'flipV')
    const m = orientationMatrix(source, o)
    expect(Math.floor(applyMatrix(m, { x: 0.5, y: 0.5 }).y)).toBe(1)
    expect(Math.floor(applyMatrix(m, { x: 1.5, y: 0.5 }).y)).toBe(0)
  })

  it('任意操作序列（长度 0~4，共 121 种）：矩阵画出的图 = 在屏幕上逐步操作的结果', () => {
    for (const seq of allSequences(4)) {
      const expected = seq.reduce(screenOp, SOURCE_3x2)
      const orientation = seq.reduce(applyOrientationOp, IDENTITY_ORIENTATION)
      expect(renderWithMatrix(SOURCE_3x2, orientation), seq.join(',') || '(none)').toEqual(expected)
    }
  })

  it('8 种方向全部可达且互不相同（旋转 + 一次镜像的表示是唯一的）', () => {
    const seen = new Set(allSequences(4).map((seq) => {
      const o = seq.reduce(applyOrientationOp, IDENTITY_ORIENTATION)
      return `${o.rotation}/${o.mirror}`
    }))
    expect(seen.size).toBe(8)
    const pictures = new Set(['0/false', '90/false', '180/false', '270/false', '0/true', '90/true', '180/true', '270/true']
      .map((key) => {
        const [r, m] = key.split('/')
        return JSON.stringify(renderWithMatrix(SOURCE_3x2, { rotation: Number(r) as Rotation, mirror: m === 'true' }))
      }))
    expect(pictures.size).toBe(8)
  })

  it('同一个翻转点两次回到原样；转四次回到原样', () => {
    const o: Orientation = { rotation: 90, mirror: false }
    expect(applyOrientationOp(applyOrientationOp(o, 'flipH'), 'flipH')).toEqual(o)
    expect(applyOrientationOp(applyOrientationOp(o, 'flipV'), 'flipV')).toEqual(o)
    const four = ['rotate', 'rotate', 'rotate', 'rotate'] as OrientationOp[]
    expect(four.reduce(applyOrientationOp, o)).toEqual(o)
  })

  it('offset 把裁剪框左上角移到画布原点，scale 最后整体缩放', () => {
    const source = { width: 400, height: 200 }
    const o: Orientation = { rotation: 90, mirror: false }
    // 变换后是 200×400；裁剪框左上角 (50, 100)
    const m = orientationMatrix(source, o, 0.5, { x: 50, y: 100 })
    // 原图 (100, 150) 在变换后位于 (200 - 150, 100) = (50, 100)，即裁剪框左上角 → 画布 (0, 0)
    expect(applyMatrix(m, { x: 100, y: 150 })).toEqual({ x: 0, y: 0 })
    // 原图 (0, 0) 变换后在 (200, 0)，减偏移 (150, -100)，缩一半 (75, -50)
    expect(applyMatrix(m, { x: 0, y: 0 })).toEqual({ x: 75, y: -50 })
  })
})

describe('transformCropRect（裁剪框跟着图变）', () => {
  const expectRect = (actual: { x: number; y: number; width: number; height: number }, expected: typeof actual) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(actual[key]).toBeCloseTo(expected[key], 10)
  }

  it('左上四分之一：顺时针 90° 后到右上，水平翻转后到右上，垂直翻转后到左下', () => {
    const topLeft = { x: 0, y: 0, width: 0.5, height: 0.5 }
    expectRect(transformCropRect(topLeft, 'rotate'), { x: 0.5, y: 0, width: 0.5, height: 0.5 })
    expectRect(transformCropRect(topLeft, 'flipH'), { x: 0.5, y: 0, width: 0.5, height: 0.5 })
    expectRect(transformCropRect(topLeft, 'flipV'), { x: 0, y: 0.5, width: 0.5, height: 0.5 })
  })

  it('非对称框旋转 90°：宽高互换', () => {
    expectRect(transformCropRect({ x: 0.1, y: 0.2, width: 0.6, height: 0.3 }, 'rotate'), { x: 0.5, y: 0.1, width: 0.3, height: 0.6 })
  })

  it('转四次、翻两次都回到原框', () => {
    const rect = { x: 0.1, y: 0.2, width: 0.6, height: 0.3 }
    let r = rect
    for (let i = 0; i < 4; i += 1) r = transformCropRect(r, 'rotate')
    expectRect(r, rect)
    expectRect(transformCropRect(transformCropRect(rect, 'flipH'), 'flipH'), rect)
    expectRect(transformCropRect(transformCropRect(rect, 'flipV'), 'flipV'), rect)
  })

  it('任意方向下做任意操作：框里框住的原图像素集合不变', () => {
    // 4×2 原图，每格一个标签
    const source: Grid = [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]
    const cellsIn = (grid: Grid, rect: { x: number; y: number; width: number; height: number }) => {
      const h = grid.length
      const w = grid[0].length
      const labels: string[] = []
      grid.forEach((row, y) => row.forEach((label, x) => {
        const cx = (x + 0.5) / w
        const cy = (y + 0.5) / h
        if (cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height) labels.push(label)
      }))
      return labels.sort()
    }
    const rect = { x: 0, y: 0, width: 0.5, height: 0.5 } // 起始方向下框住左上 2×1 格
    for (const seq of allSequences(3)) {
      const orientation = seq.reduce(applyOrientationOp, IDENTITY_ORIENTATION)
      const before = cellsIn(renderWithMatrix(source, orientation), rect)
      for (const op of ['rotate', 'flipH', 'flipV'] as OrientationOp[]) {
        const after = cellsIn(renderWithMatrix(source, applyOrientationOp(orientation, op)), transformCropRect(rect, op))
        expect(after, `${seq.join(',')} + ${op}`).toEqual(before)
      }
    }
  })
})
