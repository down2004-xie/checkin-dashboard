import { describe, expect, it } from 'vitest'

import {
  SAKURA_SEED,
  buildSakuraTree,
  createRandom,
  flowerTransform,
  makeBurstPetals,
  makePetals,
} from './sakura'

describe('createRandom', () => {
  it('同一种子产生完全相同的序列', () => {
    // 这是整个樱花模块的地基：一旦这条断了，
    // 表现是「勾一次签到树就换个形状」，而且不会报错
    const a = createRandom(42)
    const b = createRandom(42)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('不同种子产生不同的序列', () => {
    const a = Array.from({ length: 10 }, createRandom(1))
    const b = Array.from({ length: 10 }, createRandom(2))
    expect(a).not.toEqual(b)
  })

  it('取值落在 [0, 1)', () => {
    const rand = createRandom(7)
    for (let i = 0; i < 500; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('连续取值不呈单调趋势（LCG 那种低位短周期的坑）', () => {
    // mulberry32 存在的理由就是这个：换成线性同余发生器，
    // 相邻值会出现肉眼可见的规律，花瓣会排成斜线
    const rand = createRandom(99)
    let up = 0
    let down = 0
    let prev = rand()
    for (let i = 0; i < 500; i++) {
      const cur = rand()
      if (cur > prev) up++
      else down++
      prev = cur
    }
    // 涨跌次数都应该在同一量级，不该一边倒
    expect(Math.abs(up - down)).toBeLessThan(120)
  })
})

describe('buildSakuraTree', () => {
  it('同一种子生成完全相同的树', () => {
    expect(buildSakuraTree(SAKURA_SEED)).toEqual(buildSakuraTree(SAKURA_SEED))
  })

  it('不同种子生成不同的树', () => {
    const a = buildSakuraTree(1)
    const b = buildSakuraTree(2)
    expect(a.branches).not.toEqual(b.branches)
  })

  it('枝条数量符合满二叉树的递归结构', () => {
    // MAX_DEPTH = 6 → 每层分两叉 → 1+2+4+...+64 = 127 段。
    // 这条守的是「有人改深度忘了 DOM 会指数膨胀」
    expect(buildSakuraTree(SAKURA_SEED).branches.length).toBe(127)
  })

  it('每段枝条的粗细都是正数且逐级变细', () => {
    const { branches } = buildSakuraTree(SAKURA_SEED)
    for (const branch of branches) {
      expect(branch.width).toBeGreaterThan(0)
      expect(Number.isFinite(branch.width)).toBe(true)
    }

    const trunk = branches.find((b) => b.depth === 6)
    const twig = branches.find((b) => b.depth === 0)
    expect(trunk).toBeDefined()
    expect(twig).toBeDefined()
    expect(trunk!.width).toBeGreaterThan(twig!.width)
  })

  it('path 里没有 NaN —— 坐标算错时最容易出现的形态', () => {
    const { branches } = buildSakuraTree(SAKURA_SEED)
    for (const branch of branches) {
      expect(branch.d).not.toContain('NaN')
      expect(branch.d).not.toContain('Infinity')
    }
  })

  it('树是朝上长的，不是朝下淌的', () => {
    const { bounds } = buildSakuraTree(SAKURA_SEED)
    // 根部在 y≈1012，树冠顶部必须明显高于它
    expect(bounds.minY).toBeLessThan(700)
  })

  it('树冠朝左铺开，不会缩在右下角一根直棍', () => {
    const { bounds } = buildSakuraTree(SAKURA_SEED)
    // 根部 x≈985，展开的左边界必须离它足够远
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(400)
  })

  it('包围盒是有限数且宽高为正', () => {
    const { bounds } = buildSakuraTree(SAKURA_SEED)
    for (const v of Object.values(bounds)) {
      expect(Number.isFinite(v)).toBe(true)
    }
    expect(bounds.maxX).toBeGreaterThan(bounds.minX)
    expect(bounds.maxY).toBeGreaterThan(bounds.minY)
  })

  it('所有花苞、花朵和柔光云都落在包围盒内', () => {
    // 这条直接对应「花被容器边缘切掉」这个视觉 bug
    const { buds, flowers, blooms, mist, bounds } = buildSakuraTree(SAKURA_SEED)
    for (const b of [...buds, ...mist]) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(bounds.minX)
      expect(b.x + b.r).toBeLessThanOrEqual(bounds.maxX)
      expect(b.y - b.r).toBeGreaterThanOrEqual(bounds.minY)
      expect(b.y + b.r).toBeLessThanOrEqual(bounds.maxY)
    }
    for (const f of [...flowers, ...blooms]) {
      // 花按「旋转后最远的花瓣尖」算 —— 旋转不改变最大距离，
      // 所以用 scale 缩放后的花瓣半径（组件里 FLOWER_RADIUS = 11.2）
      const r = 11.2 * f.scale
      expect(f.x - r).toBeGreaterThanOrEqual(bounds.minX)
      expect(f.x + r).toBeLessThanOrEqual(bounds.maxX)
      expect(f.y - r).toBeGreaterThanOrEqual(bounds.minY)
      expect(f.y + r).toBeLessThanOrEqual(bounds.maxY)
    }
  })

  it('花覆盖每一个挂花点：花 + 花苞数量等于挂花点数', () => {
    // 挂花点要么开花要么留苞，不能凭空丢 —— 丢了树冠就有秃斑
    const { buds, flowers } = buildSakuraTree(SAKURA_SEED)
    expect(buds.length + flowers.length).toBeGreaterThan(0)
    // 花占多数（rand < 0.72 开花），花苞是少数
    expect(flowers.length).toBeGreaterThan(buds.length)
  })

  it('满签 blooms 的位置取自花苞 —— 含苞的位置盛开', () => {
    // 叙事约束：满开不是凭空多一批花，是花苞开成花
    const { buds, blooms } = buildSakuraTree(SAKURA_SEED)
    expect(blooms.length).toBeGreaterThan(0)
    expect(blooms.length).toBeLessThanOrEqual(buds.length)
    for (const bloom of blooms) {
      const matched = buds.some(
        (b) => Math.abs(b.x - bloom.x) < 0.5 && Math.abs(b.y - bloom.y) < 0.5,
      )
      expect(matched).toBe(true)
    }
  })

  it('柔光云存在且在树冠内部（不盖过轮廓）', () => {
    const { mist, buds, flowers } = buildSakuraTree(SAKURA_SEED)
    expect(mist.length).toBe(6)

    // 树冠的横向范围由花决定，云的质心必须落在里面
    const xs = [...buds, ...flowers].map((b) => b.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    for (const m of mist) {
      expect(m.x).toBeGreaterThan(minX)
      expect(m.x).toBeLessThan(maxX)
      expect(m.r).toBeGreaterThan(0)
      expect(m.opacity).toBeGreaterThan(0)
      expect(m.opacity).toBeLessThan(1)
    }
  })

  it('枝条方向是分散的，不会退化成一把平行的扫帚', () => {
    // 这条守的是一个真踩过的坑，而且**前两版测试都守不住它**：
    //
    // 角度边界最初写成 `Math.max(0, tilt)`（越界截断）。0 于是成了吸引子 ——
    // 被截到 0 的枝条，子枝再减依然是负数、又被截回 0，整条支路从此永远垂直。
    // 半个树冠塌成互相平行的竖线，树像一把扫帚。
    //
    // 第一版测试查的是「花苞横向离散度」，没用：截断后竖线虽然方向一致，
    // 但各自的 x 不同，离散度不降反升。第二版查「花苞跨度/树跨度」更糟 ——
    // 它**在有 bug 的版本上通过、在正确版本上失败**，是条反向测试。
    //
    // 真正有效的指标是**方向的集中度**：截断版有 29% 的枝条挤在同一个方向桶里，
    // 反射版只有 9%~11%。阈值取 18%，两边都留了余量。
    const { branches } = buildSakuraTree(SAKURA_SEED)
    const buckets = new Map<number, number>()
    for (const branch of branches) {
      const key = Math.round(branch.angle / 0.1)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    const densest = Math.max(...buckets.values()) / branches.length
    expect(densest).toBeLessThan(0.18)
  })

  it('花苞的半径和不透明度都在合理区间', () => {
    const { buds, flowers, blooms } = buildSakuraTree(SAKURA_SEED)
    for (const b of buds) {
      // 花苞是小点（r < 4）：上一版 r 6~11 的大圆叠出来是棉花糖
      expect(b.r).toBeGreaterThan(0)
      expect(b.r).toBeLessThan(4)
      expect(b.opacity).toBeGreaterThan(0)
      expect(b.opacity).toBeLessThanOrEqual(1)
    }
    for (const f of [...flowers, ...blooms]) {
      expect(f.scale).toBeGreaterThan(0)
      expect(f.rotation).toBeGreaterThanOrEqual(0)
      expect(f.rotation).toBeLessThan(360)
      expect(f.opacity).toBeGreaterThan(0)
      expect(f.opacity).toBeLessThanOrEqual(1)
    }
  })

  it('flowerTransform 输出可复现且格式正确', () => {
    const { flowers } = buildSakuraTree(SAKURA_SEED)
    const t1 = flowerTransform(flowers[0])
    const t2 = flowerTransform(flowers[0])
    expect(t1).toBe(t2)
    expect(t1).toMatch(/^translate\(-?\d+(\.\d+)? -?\d+(\.\d+)?\) rotate\(\d+\) scale\(\d+(\.\d+)?\)$/)
  })
})

describe('makePetals', () => {
  it('同一种子产生同一批花瓣', () => {
    expect(makePetals(14, 1)).toEqual(makePetals(14, 1))
  })

  it('数量正确，0 片就是空数组', () => {
    expect(makePetals(14, 1)).toHaveLength(14)
    expect(makePetals(0, 1)).toEqual([])
  })

  it('水平位置在 0~100 之间（它是百分比）', () => {
    for (const p of makePetals(50, 3)) {
      expect(p.left).toBeGreaterThanOrEqual(0)
      expect(p.left).toBeLessThan(100)
    }
  })

  it('延迟是负的且不超过一个周期', () => {
    // 负延迟让动画从中途开始；超过一个周期就白绕了一圈
    for (const p of makePetals(50, 3)) {
      expect(p.delay).toBeLessThanOrEqual(0)
      expect(p.delay).toBeGreaterThanOrEqual(-p.duration)
    }
  })

  it('尺寸、时长、透明度都在可用区间', () => {
    for (const p of makePetals(50, 3)) {
      expect(p.size).toBeGreaterThan(0)
      expect(p.duration).toBeGreaterThan(0)
      expect(p.opacity).toBeGreaterThan(0)
      expect(p.opacity).toBeLessThanOrEqual(1)
    }
  })
})

describe('makeBurstPetals', () => {
  it('同一种子产生同一批花瓣', () => {
    expect(makeBurstPetals(44, 7)).toEqual(makeBurstPetals(44, 7))
  })

  it('数量正确，0 片就是空数组', () => {
    expect(makeBurstPetals(44, 7)).toHaveLength(44)
    expect(makeBurstPetals(0, 7)).toEqual([])
  })

  it('先上升后下落：rise 向上、dy 向下', () => {
    // 这是「从树下涌起」这个效果的定义，写反了会变成从天上掉下来
    for (const p of makeBurstPetals(44, 7)) {
      expect(p.rise).toBeLessThan(0)
      expect(p.dy).toBeGreaterThan(0)
    }
  })

  it('起点集中在视口右下角（树根所在）', () => {
    for (const p of makeBurstPetals(44, 7)) {
      expect(p.left).toBeGreaterThanOrEqual(80)
      expect(p.left).toBeLessThanOrEqual(100)
      expect(p.top).toBeGreaterThanOrEqual(90)
      expect(p.top).toBeLessThanOrEqual(100)
    }
  })

  it('水平偏移偏向左侧，不会一出场就飞出右边界', () => {
    const petals = makeBurstPetals(44, 7)
    for (const p of petals) {
      expect(p.dx).toBeLessThan(60)
    }
  })

  it('不同批次的花瓣不一样 —— 连着满签两次不该看到同一套', () => {
    expect(makeBurstPetals(44, 8)).not.toEqual(makeBurstPetals(44, 9))
  })
})
