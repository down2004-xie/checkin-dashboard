import { describe, expect, it } from 'vitest'

import {
  BG_COLORS,
  ID_PHOTO_SIZES,
  centerCropRect,
  colorDistance,
  estimateBackgroundColor,
  backgroundMask,
  estimateBackground,
  idPhotoFileName,
  isBackgroundPixel,
  replaceConnectedBackground,
  workingSize,
  type Rgb,
} from './id-photo'

describe('ID_PHOTO_SIZES', () => {
  it('三种常见尺寸，宽高比合理（竖版）', () => {
    expect(ID_PHOTO_SIZES).toHaveLength(3)
    for (const size of ID_PHOTO_SIZES) {
      expect(size.height).toBeGreaterThan(size.width)
      expect(size.width).toBeGreaterThan(0)
    }
  })

  it('一寸约 295×413（300dpi）', () => {
    const one = ID_PHOTO_SIZES.find((s) => s.id === 'one')!
    expect(one.width).toBe(295)
    expect(one.height).toBe(413)
  })
})

describe('BG_COLORS', () => {
  it('白蓝红三色齐备', () => {
    expect(BG_COLORS.map((c) => c.id)).toEqual(['white', 'blue', 'red'])
  })
})

describe('colorDistance', () => {
  it('相同颜色距离 0', () => {
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0)
  })

  it('黑白距离 = 255√3', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(255 * Math.sqrt(3), 5)
  })

  it('对称', () => {
    expect(colorDistance([1, 2, 3], [4, 5, 6])).toBeCloseTo(colorDistance([4, 5, 6], [1, 2, 3]), 10)
  })
})

describe('isBackgroundPixel', () => {
  it('距离在容差内算背景', () => {
    expect(isBackgroundPixel([250, 250, 250], [255, 255, 255], 20)).toBe(true)
  })

  it('距离超容差不算背景', () => {
    expect(isBackgroundPixel([100, 100, 100], [255, 255, 255], 20)).toBe(false)
  })

  it('容差 0 时只有完全相同才算', () => {
    expect(isBackgroundPixel([255, 255, 255], [255, 255, 255], 0)).toBe(true)
    expect(isBackgroundPixel([254, 255, 255], [255, 255, 255], 0)).toBe(false)
  })
})

/**
 * 用字符画造一张小图：每个字符一个像素，按调色板查 RGBA。
 * 比手写一长串数字直观：测试一眼能看出「背景包着主体、主体里有块同色区」。
 */
type Rgba = [number, number, number, number]
function picture(rows: string[], palette: Record<string, Rgba>) {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8ClampedArray(width * height * 4)
  rows.forEach((row, y) => [...row].forEach((ch, x) => data.set(palette[ch], (y * width + x) * 4)))
  const at = (out: Uint8ClampedArray, x: number, y: number) => [...out.slice((y * width + x) * 4, (y * width + x) * 4 + 4)]
  return { data, width, height, at }
}

const WHITE: Rgba = [255, 255, 255, 255]
const DARK: Rgba = [30, 30, 30, 255]
const BLUE: Rgb = [67, 142, 219]
const opts = { reference: [255, 255, 255] as Rgb, tolerance: 30, target: BLUE, feather: 0 }

describe('replaceConnectedBackground', () => {
  // 白底（.）包着一个深色主体（#），主体里有一块白（o）—— 白衬衫 / 眼白
  const portrait = picture([
    '.......',
    '.#####.',
    '.#ooo#.',
    '.#ooo#.',
    '.#####.',
    '.......',
  ], { '.': WHITE, '#': DARK, o: WHITE })

  it('和边缘连通的背景换成目标色', () => {
    const out = replaceConnectedBackground(portrait.data, portrait.width, portrait.height, opts)
    expect(portrait.at(out, 0, 0)).toEqual([...BLUE, 255])
    expect(portrait.at(out, 6, 5)).toEqual([...BLUE, 255])
  })

  it('主体内部和背景同色、但不和边缘连通的区域不被替换', () => {
    const out = replaceConnectedBackground(portrait.data, portrait.width, portrait.height, opts)
    for (const [x, y] of [[2, 2], [3, 2], [4, 3]]) expect(portrait.at(out, x, y)).toEqual(WHITE)
    // 主体轮廓本身也不动
    expect(portrait.at(out, 1, 1)).toEqual(DARK)
  })

  it('只贴着底边的白衬衫不被当成背景（种子不取底边和两侧下半）', () => {
    const shirt = picture([
      '.....',
      '.###.',
      '#ooo#',
      '#ooo#',
      'ooooo',
    ], { '.': WHITE, '#': DARK, o: WHITE })
    const out = replaceConnectedBackground(shirt.data, shirt.width, shirt.height, opts)
    expect(shirt.at(out, 2, 4)).toEqual(WHITE)
    expect(shirt.at(out, 0, 4)).toEqual(WHITE)
    expect(shirt.at(out, 0, 0)).toEqual([...BLUE, 255])
  })

  it('透明像素视为背景，深色头发不被换掉；输出一律不透明', () => {
    const cutout = picture([
      '___',
      '_#_',
      '___',
    ], { _: [0, 0, 0, 0], '#': DARK })
    // 透明背景：reference 为 null，只按透明度判
    const out = replaceConnectedBackground(cutout.data, 3, 3, { ...opts, reference: null })
    expect(cutout.at(out, 0, 0)).toEqual([...BLUE, 255])
    expect(cutout.at(out, 1, 1)).toEqual(DARK)
  })

  it('半透明像素叠在目标色上', () => {
    const edge = picture(['#'], { '#': [0, 0, 0, 128] })
    const out = replaceConnectedBackground(edge.data, 1, 1, { ...opts, reference: null, target: [255, 255, 255] })
    // 128/255 的黑叠在白上 ≈ 127
    expect(edge.at(out, 0, 0)[0]).toBeGreaterThan(120)
    expect(edge.at(out, 0, 0)[0]).toBeLessThan(135)
    expect(edge.at(out, 0, 0)[3]).toBe(255)
  })

  it('羽化：紧挨背景的「混了白」的像素往目标色偏，远处主体不动', () => {
    // m 是白和深色的过渡色（离白 ≈ 52，略超容差 30）
    const soft = picture([
      '.....',
      '.mmm.',
      '.m#m.',
      '.mmm.',
      '.....',
    ], { '.': WHITE, m: [225, 225, 225, 255], '#': DARK })
    const hard = replaceConnectedBackground(soft.data, 5, 5, opts)
    const feathered = replaceConnectedBackground(soft.data, 5, 5, { ...opts, feather: 2 })
    expect(soft.at(hard, 1, 1)).toEqual([225, 225, 225, 255])
    const [r, g, b] = soft.at(feathered, 1, 1)
    // 往蓝偏：红绿下降，蓝基本不动
    expect(r).toBeLessThan(225)
    expect(g).toBeLessThan(225)
    expect(b).toBeGreaterThan(205)
    // 深色主体离白很远，不在羽化带内
    expect(soft.at(feathered, 2, 2)).toEqual(DARK)
  })

  it('不改原数组', () => {
    const before = [...portrait.data]
    replaceConnectedBackground(portrait.data, portrait.width, portrait.height, { ...opts, feather: 2 })
    expect([...portrait.data]).toEqual(before)
  })

  it('容差 0 时不按颜色替换', () => {
    const out = replaceConnectedBackground(portrait.data, portrait.width, portrait.height, { ...opts, tolerance: 0 })
    expect(portrait.at(out, 0, 0)).toEqual(WHITE)
  })
})

describe('backgroundMask', () => {
  it('大面积纯色背景不爆栈（BFS 不递归）', () => {
    const width = 1000
    const height = 1000
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    const mask = backgroundMask(data, width, height, [255, 255, 255], 10)
    expect(mask.reduce((sum, v) => sum + v, 0)).toBe(width * height)
  })
})

describe('estimateBackground', () => {
  it('只采上角和两侧上半：下半部的衣服色不影响结果', () => {
    // 上半白，下半整行红（肩膀压满底边）
    const rows = [...Array(10).fill('..........'), ...Array(10).fill('RRRRRRRRRR')]
    const img = picture(rows, { '.': WHITE, R: [200, 0, 0, 255] })
    expect(estimateBackground(img.data, img.width, img.height)).toEqual({ color: [255, 255, 255], transparent: false })
  })

  it('透明背景识别为透明，而不是黑色', () => {
    const rows = Array(10).fill('__________')
    const img = picture(rows, { _: [0, 0, 0, 0] })
    expect(estimateBackground(img.data, img.width, img.height)).toEqual({ color: null, transparent: true })
  })
})

describe('workingSize', () => {
  it('大图缩到约 2 倍目标尺寸', () => {
    expect(workingSize(3000, 4200, 295, 413)).toEqual({ width: 590, height: 826 })
  })

  it('小图不放大', () => {
    expect(workingSize(300, 420, 295, 413)).toEqual({ width: 300, height: 420 })
  })
})

describe('idPhotoFileName', () => {
  const one = ID_PHOTO_SIZES[0]
  it('扩展名跟实际 blob 类型走', () => {
    expect(idPhotoFileName('me.heic.png', one, 'image/jpeg')).toBe('me.heic-295x413.jpg')
    expect(idPhotoFileName('me.png', one, 'image/png')).toBe('me-295x413.png')
  })

  it('空文件名有兜底', () => {
    expect(idPhotoFileName('', one, 'image/png')).toBe('idphoto-295x413.png')
  })
})

describe('estimateBackgroundColor', () => {
  it('取中位数，抗单个离群采样点', () => {
    const samples: Rgb[] = [[250, 250, 250], [252, 252, 252], [248, 248, 248], [0, 0, 0]]
    // 中位数应为 ~250，不被黑色的 0 拉偏
    const bg = estimateBackgroundColor(samples)
    expect(bg[0]).toBeGreaterThan(200)
  })

  it('空样本退回白色', () => {
    expect(estimateBackgroundColor([])).toEqual([255, 255, 255])
  })
})

describe('centerCropRect', () => {
  it('源图更宽：裁左右，高度铺满', () => {
    // 源 400×200，目标 1:1 → 裁成 200×200 居中
    const rect = centerCropRect(400, 200, 100, 100)
    expect(rect).toEqual({ x: 100, y: 0, width: 200, height: 200 })
  })

  it('源图更高：裁上下，宽度铺满', () => {
    // 源 200×400，目标 1:1 → 裁成 200×200 居中
    const rect = centerCropRect(200, 400, 100, 100)
    expect(rect).toEqual({ x: 0, y: 100, width: 200, height: 200 })
  })

  it('比例一致时整张保留', () => {
    const rect = centerCropRect(300, 400, 295, 413)
    expect(rect.width).toBeLessThanOrEqual(300)
    expect(rect.height).toBeLessThanOrEqual(400)
  })

  it('非法尺寸返回原尺寸矩形', () => {
    const rect = centerCropRect(0, 0, 100, 100)
    expect(rect.width).toBe(0)
  })
})
