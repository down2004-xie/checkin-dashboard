/**
 * 樱花树与花瓣的生成逻辑。
 *
 * 为什么这些放在 lib 而不是组件里：
 * 「给定种子 → 输出一棵树 / 一批花瓣」是纯函数，没有 React、没有 DOM，
 * 可以单测。而它确实需要测 —— 见下面「确定性」那条。
 *
 * 确定性是这里的核心约束：
 * 组件因为勾选签到而重渲染（一天点十几次），如果每次都用 Math.random()，
 * 树会在用户眼皮底下换一个形状。所以用固定种子的伪随机数发生器，
 * 保证「同一种子 → 同一棵树」，重渲染、刷新页面都不变。
 */

/** 默认种子。换一个数字就得到另一棵形态不同的树，但同一数字永远是同一棵 */
export const SAKURA_SEED = 20261006

/**
 * mulberry32 —— 32 位状态的伪随机数发生器。
 *
 * 选它而不是 Math.random() 的原因只有一个：可复现。
 * 选它而不是自己写一个 LCG 的原因：LCG 低位周期极短，
 * 连续取值会呈现明显的规律（花瓣排成斜线），这个算法没有这个问题。
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ============================================================
 * 樱花树
 * ============================================================ */

export interface Branch {
  /** SVG path 的 d。用二次贝塞尔而不是直线，枝条才有自然的弧度 */
  d: string
  width: number
  /** 枝级，0 是最末梢的细枝。渲染时按它分粗细 */
  depth: number
  /**
   * 生长方向（弧度，与竖直方向的夹角，0 = 正上，正数 = 偏左）。
   *
   * 单独带出来是为了让测试能直接检查「方向的分布」。
   * 方向趋同是这类递归生成最典型的失败模式（枝条互相平行，树变成一把扫帚），
   * 而它从 path 字符串里反解也能拿到，但那既啰嗦又依赖 path 的格式。
   */
  angle: number
}

export interface Blossom {
  x: number
  y: number
  /** 半径，画布单位 */
  r: number
  opacity: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface SakuraTree {
  branches: Branch[]
  /** 花苞：一直都在，构成树冠的底子 */
  buds: Blossom[]
  /** 盛开的花：满签时才浮现，所以单独一组 */
  blooms: Blossom[]
  /**
   * 树实际占据的矩形范围（画布单位，已含花瓣半径和外扩余量）。
   *
   * 为什么要返回它：随机生成的分形树到底长多大、长成什么比例，
   * 事先算不出来。组件用这份范围当 viewBox，树就永远刚好填满容器，
   * 不会出现「换个种子树就缩在角落里」。
   */
  bounds: Bounds
}

/**
 * 坐标系：约 1000×1000 的画布，原点在左上、y 向下。
 *
 * 不用 0~1 的归一化坐标，是因为 SVG 的 stroke-width 在过小的坐标系里
 * 会失真（1 单位 = 整条线宽）；1000 这个量级下，枝宽 26 到 0.9 都能正常表达。
 * 画布边界本身不影响渲染 —— 组件用的是算出来的包围盒，不是这 1000。
 */

/** 树干根部。放在画布右下角附近，看起来像是从画面外长进来的 */
const ROOT_X = 985
const ROOT_Y = 1012

/** 递归层数。7 层的枝条没有被整除，宁可少画几根也别让 DOM 里塞上千个节点 */
const MAX_DEPTH = 7

/** 树冠整体的倾斜目标（弧度）。0 = 正上，正数 = 往左偏 */
const LEAN = 0.55

/**
 * 把倾角折回合理区间 —— 注意是**反射**，不是截断。
 *
 * 上界 1.5（约 86°）：不限的话递归几十次之后会出现朝下长的枝条
 * （tilt 超过 π/2），看起来像树在往下淌。
 *
 * 下界是 0 —— 永远不往右倾。树根钉在容器右下角，右边没有画布了，
 * 枝条一旦右倾就会长出边界，还会把树干从角落里挤到画面中间去。
 *
 * ⚠️ 这里踩过一个坑，值得记下来：
 * 第一版写的是 `Math.max(0, tilt)`，也就是越界就截断到 0。
 * 结果是半个树冠塌成一条竖线、花簇挤成一条窄带 —— 因为 0 变成了**吸引子**：
 * 一旦某个枝条被截到 0，它的子枝再减一次又是负数、又被截回 0，
 * 整条支路从此永远垂直。树看起来像把扫帚，而不是一棵树。
 *
 * 改成反射（-0.3 → +0.3）之后，越界的角度会带着同样的幅度弹回左侧，
 * 分布不减、形态不塌。**凡是递归里的边界处理，截断都要警惕吸引子。**
 */
function foldTilt(tilt: number): number {
  const MAX = 1.5

  if (tilt > MAX) return MAX - (tilt - MAX)
  if (tilt < 0) return -tilt
  return tilt
}

/** 保留一位小数。path 字符串里 0.1 和 0.10000000000000002 渲染结果一样，
 *  但后者每个坐标多 15 个字符，一千个节点就是十几 KB */
function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * 递归生成一棵樱花树。
 *
 * 形态学上的两个关键点（少了哪一个都不像树）：
 *   1. 枝条长度和粗度逐级递减（0.78 / 0.7），越往末梢越细
 *   2. 每次分叉后把角度往 LEAN「拉」一点（向性），否则枝条会各走各的、
 *      均匀散开成蒲公英，而不是朝一个方向铺开的树冠
 */
export function buildSakuraTree(seed: number = SAKURA_SEED): SakuraTree {
  const rand = createRandom(seed)
  const branches: Branch[] = []
  /** 末梢枝条的端点，花就开在这些位置上 */
  const tips: Array<{ x: number; y: number }> = []
  /**
   * 每段枝条的终点，用来量包围盒。
   *
   * 刻意在这里顺手记下来，而不是回头去解析 path 字符串：
   * 把刚拼好的字符串再拆开，任何格式微调（加个空格、换个分隔符）
   * 都会静默解析出错误坐标，而且不报错 —— 直接记数值没有这个风险。
   */
  const ends: Array<{ x: number; y: number; r: number }> = []

  const grow = (
    x: number,
    y: number,
    tilt: number,
    len: number,
    width: number,
    depth: number,
  ): void => {
    // tilt 是「与竖直方向的夹角」而不是标准极角。
    // 好处：0 永远是正上，分叉时直接加减，不会遇到 ±π 环绕的问题。
    const nx = x - Math.sin(tilt) * len
    const ny = y - Math.cos(tilt) * len

    // 控制点沿垂直方向偏移，把直线掰成微弯的枝
    const bend = (rand() - 0.5) * len * (0.2 + depth * 0.03)
    const cx = (x + nx) / 2 - Math.cos(tilt) * bend
    const cy = (y + ny) / 2 + Math.sin(tilt) * bend

    const strokeWidth = Math.max(0.9, width)

    branches.push({
      d: `M${r1(x)} ${r1(y)}Q${r1(cx)} ${r1(cy)} ${r1(nx)} ${r1(ny)}`,
      width: strokeWidth,
      depth,
      angle: tilt,
    })

    // 起点也要记：只有一根主干时，包围盒不能只靠终点撑起来。
    // 半径取线宽的一半 —— stroke 是以路径为中心往两侧各扩一半，
    // 写成一整个线宽会让包围盒凭空胖出 13 个单位，树干末端就会悬空
    ends.push({ x: nx, y: ny, r: strokeWidth / 2 })
    if (depth === MAX_DEPTH) ends.push({ x, y, r: strokeWidth / 2 })

    // 挂花。注意深度 0、1、2 的枝都要挂，不能只挂末梢 ——
    // 只挂末梢时花全在树冠的最外缘，中间是空的，
    // 渲染出来就是「一圈花边套着一个空壳」，一眼看穿是生成的
    if (depth <= 2) {
      const count = depth === 0 ? 2 : 1
      for (let i = 0; i < count; i++) {
        // t 落在枝条的后半段，花朝枝梢方向聚集
        const t = 0.35 + rand() * 0.65
        tips.push({
          x: x + (nx - x) * t + (rand() - 0.5) * 20,
          y: y + (ny - y) * t + (rand() - 0.5) * 20,
        })
      }
    }

    if (depth === 0) return

    // 张开角度偏大。这个值直接决定树冠在画面里占多大 ——
    // 太小的话树冠缩成一小团，剩下的全是光秃的主干斜线
    const spread = 0.45 + rand() * 0.6
    /**
     * 向性：把子枝的角度往 LEAN 拉一点点。
     *
     * 这个系数必须很小。它拉得太狠（比如 0.16）就会出现一种很难反推的形态：
     * 所有枝条都被拉向同一个角度，于是互相平行、均匀铺开，
     * 看起来像一把扇子或扫帚，而不是一棵树。
     * 树冠的体积感来自各枝条**方向不同**，而不是角度整齐。
     *
     * 现在只留 0.04 来防止枝条朝下长，真正决定形态的是下面的 jitter。
     */
    const pull = (t: number) => t + (LEAN - t) * 0.04
    const jitter = () => (rand() - 0.5) * 0.32

    grow(nx, ny, foldTilt(pull(tilt - spread) + jitter()), len * 0.78, width * 0.7, depth - 1)
    grow(nx, ny, foldTilt(pull(tilt + spread * 0.85) + jitter()), len * 0.76, width * 0.68, depth - 1)
  }

  // 主干初始就朝左偏 0.5 rad（约 29°）：树根在右下角，
  // 主干斜着插进画面比笔直向上自然，也顺便把树冠推向左上
  grow(ROOT_X, ROOT_Y, 0.5, 190, 26, MAX_DEPTH)

  const buds: Blossom[] = []
  const blooms: Blossom[] = []

  for (const tip of tips) {
    const x = tip.x + (rand() - 0.5) * 16
    const y = tip.y + (rand() - 0.5) * 16

    // 每个末梢一定有花苞 —— 树冠的轮廓靠它撑起来，不能随机跳过
    buds.push({ x, y, r: 6 + rand() * 5, opacity: 0.3 + rand() * 0.2 })

    // 只有一部分末梢开出大花。全开会让树冠糊成一坨粉色，失去枝干的层次
    if (rand() < 0.42) {
      blooms.push({
        x: x + (rand() - 0.5) * 10,
        y: y + (rand() - 0.5) * 10,
        r: 15 + rand() * 17,
        opacity: 0.55 + rand() * 0.35,
      })
    }
  }

  return { branches, buds, blooms, bounds: measureBounds(ends, buds, blooms) }
}

/**
 * 量出整棵树的包围盒。
 *
 * 只取每段枝条的终点、不取控制点：二次贝塞尔曲线一定落在
 * 起点、控制点、终点围成的三角形内，光用终点会略微收紧，
 * 但外面还留了 padding，视觉上看不出来，换来的是实现简单。
 */
function measureBounds(
  ends: Array<{ x: number; y: number; r: number }>,
  buds: Blossom[],
  blooms: Blossom[],
): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const include = (x: number, y: number, r: number) => {
    if (x - r < minX) minX = x - r
    if (y - r < minY) minY = y - r
    if (x + r > maxX) maxX = x + r
    if (y + r > maxY) maxY = y + r
  }

  for (const end of ends) include(end.x, end.y, end.r)
  for (const b of buds) include(b.x, b.y, b.r)
  for (const b of blooms) include(b.x, b.y, b.r)

  // 留一点余量，免得树冠的花贴着容器边缘被切掉。
  // 花瓣的半径已经单独算进去了，这 16 只是视觉上的呼吸空间，不用给多
  const pad = 16

  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  }
}

/* ============================================================
 * 花瓣
 * ============================================================ */

/** 常态飘落的花瓣。全部参数都交给 CSS 变量，元素本身不带状态 */
export interface Petal {
  /** 起始水平位置，视口宽度的百分比 0~100 */
  left: number
  /** 尺寸 px */
  size: number
  /** 单次下落耗时，秒 */
  duration: number
  /** 负的延迟，让动画从中途开始 —— 否则一刷新所有花瓣都从顶部同时出发 */
  delay: number
  /** 一次下落中的水平漂移 px */
  drift: number
  /** 旋转圈数，正负表示方向 */
  spin: number
  opacity: number
  /** 初始倾角 deg，避免所有花瓣姿态一致 */
  tilt: number
}

export function makePetals(count: number, seed: number): Petal[] {
  const rand = createRandom(seed)
  const petals: Petal[] = []

  for (let i = 0; i < count; i++) {
    const duration = 9 + rand() * 9
    petals.push({
      left: rand() * 100,
      size: 8 + rand() * 9,
      duration,
      delay: -rand() * duration,
      drift: (rand() - 0.5) * 220,
      spin: (rand() < 0.5 ? -1 : 1) * (1.2 + rand() * 2.6),
      opacity: 0.35 + rand() * 0.45,
      tilt: rand() * 360,
    })
  }

  return petals
}

/** 满签爆发用的花瓣。和常态飘落是两套参数：
 *  常态只关心「从顶部落到底」，爆发要多一个「先升到树冠再散落」的抛物线 */
export interface BurstPetal {
  /** 起点，视口宽度的百分比 */
  left: number
  /** 起点，视口高度的百分比 */
  top: number
  size: number
  duration: number
  delay: number
  /** 终点水平偏移 px */
  dx: number
  /** 终点垂直偏移 px，正值向下 */
  dy: number
  /** 最高点相对起点的垂直偏移 px，负值向上 */
  rise: number
  spin: number
  opacity: number
}

/**
 * 生成一批「从树根涌起」的花瓣。
 *
 * 起点固定在视口右下角（树根所在），水平方向刻意偏左 ——
 * 因为屏幕右侧没有空间，往右飞的花瓣一出场就飞出画面了。
 */
export function makeBurstPetals(count: number, seed: number): BurstPetal[] {
  const rand = createRandom(seed)
  const petals: BurstPetal[] = []

  for (let i = 0; i < count; i++) {
    petals.push({
      left: 88 + rand() * 12,
      top: 94 + rand() * 6,
      size: 9 + rand() * 11,
      duration: 3.2 + rand() * 2.4,
      // 起跳时间错开，整批一起飞会像一堵墙扑过来
      delay: rand() * 0.7,
      dx: 40 - rand() * 380,
      dy: 140 + rand() * 280,
      rise: -(180 + rand() * 300),
      spin: (rand() < 0.5 ? -1 : 1) * (1.5 + rand() * 3),
      opacity: 0.55 + rand() * 0.4,
    })
  }

  return petals
}
