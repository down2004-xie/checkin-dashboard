import { describe, expect, it } from 'vitest'

import {
  IMAGE_FORMATS,
  baseName,
  canvasFailureMessage,
  downscaleNotice,
  exportFormatFor,
  fallbackNotice,
  getFormat,
  joinNotices,
  resolveOutput,
  shortLabel,
  swapExtension,
} from './image-convert'

describe('IMAGE_FORMATS', () => {
  it('三种格式都配齐了 mime / ext / 能力标记', () => {
    expect(IMAGE_FORMATS).toHaveLength(3)
    const mimes = IMAGE_FORMATS.map((format) => format.mime)
    expect(mimes).toEqual(['image/png', 'image/jpeg', 'image/webp'])
  })

  it('PNG 不支持质量、支持透明', () => {
    const png = getFormat('image/png')!
    expect(png.supportsQuality).toBe(false)
    expect(png.supportsAlpha).toBe(true)
    expect(png.ext).toBe('png')
  })

  it('JPEG 支持质量、不支持透明', () => {
    const jpeg = getFormat('image/jpeg')!
    expect(jpeg.supportsQuality).toBe(true)
    expect(jpeg.supportsAlpha).toBe(false)
    expect(jpeg.ext).toBe('jpg')
  })

  it('每个格式的 mime 与 ext 都不重复（避免选错目标格式）', () => {
    expect(new Set(IMAGE_FORMATS.map((f) => f.mime)).size).toBe(3)
    expect(new Set(IMAGE_FORMATS.map((f) => f.ext)).size).toBe(3)
  })
})

describe('getFormat', () => {
  it('按 MIME 命中', () => {
    expect(getFormat('image/webp')?.ext).toBe('webp')
  })

  it('未知 MIME 返回 null', () => {
    expect(getFormat('image/gif')).toBeNull()
    expect(getFormat('')).toBeNull()
  })
})

describe('swapExtension', () => {
  it('替换已有扩展名', () => {
    expect(swapExtension('photo.png', 'jpg')).toBe('photo.jpg')
    expect(swapExtension('my.photo.v2.jpeg', 'webp')).toBe('my.photo.v2.webp')
  })

  it('没有扩展名时补上', () => {
    expect(swapExtension('photo', 'png')).toBe('photo.png')
  })

  it('空名退回 image', () => {
    expect(swapExtension('', 'png')).toBe('image.png')
    expect(swapExtension('   ', 'jpg')).toBe('image.jpg')
  })
})

describe('baseName', () => {
  it('去掉最后一个扩展名，空名退回 fallback', () => {
    expect(baseName('my.photo.jpg')).toBe('my.photo')
    expect(baseName('', 'cropped')).toBe('cropped')
  })
})

describe('resolveOutput（toBlob 静默退回 PNG 的检查）', () => {
  it('请求 WebP、实际 PNG（Safari）→ 按 PNG 算，标记 fellBack', () => {
    const r = resolveOutput('image/webp', 'image/png')
    expect(r.format.ext).toBe('png')
    expect(r.fellBack).toBe(true)
  })

  it('请求和实际一致 → 不标记', () => {
    expect(resolveOutput('image/jpeg', 'image/jpeg')).toEqual({ format: getFormat('image/jpeg'), fellBack: false })
  })

  it('blob.type 为空 → 相信请求的格式', () => {
    expect(resolveOutput('image/webp', '')).toEqual({ format: getFormat('image/webp'), fellBack: false })
  })

  it('未知类型按 PNG 处理', () => {
    expect(resolveOutput('image/jpeg', 'image/x-weird').format.ext).toBe('png')
  })
})

describe('fallbackNotice / shortLabel', () => {
  it('提示里写清请求的和实际的格式（短名）', () => {
    const text = fallbackNotice('image/webp', getFormat('image/png')!)
    expect(text).toContain('不支持导出 WebP')
    expect(text).toContain('实际导出的是 PNG')
  })

  it('短名去掉括号说明', () => {
    expect(IMAGE_FORMATS.map(shortLabel)).toEqual(['PNG', 'JPEG', 'WebP'])
  })
})

describe('exportFormatFor（导出跟随原格式）', () => {
  it('JPEG / PNG / WebP 原样跟随', () => {
    expect(exportFormatFor('image/jpeg').mime).toBe('image/jpeg')
    expect(exportFormatFor('image/png').mime).toBe('image/png')
    expect(exportFormatFor('image/webp').mime).toBe('image/webp')
  })

  it('非标准写法 image/jpg、大写也认作 JPEG', () => {
    expect(exportFormatFor('image/jpg').mime).toBe('image/jpeg')
    expect(exportFormatFor('IMAGE/JPEG').mime).toBe('image/jpeg')
  })

  it('canvas 编不出来的格式（GIF / BMP / 空）退回 PNG', () => {
    expect(exportFormatFor('image/gif').mime).toBe('image/png')
    expect(exportFormatFor('image/bmp').mime).toBe('image/png')
    expect(exportFormatFor('').mime).toBe('image/png')
  })
})

describe('canvasFailureMessage（不说「请重试」）', () => {
  it('超过保守上限 → 明说图太大', () => {
    const text = canvasFailureMessage({ width: 8000, height: 6000 }, 'encode')
    expect(text).toContain('图片太大')
    expect(text).toContain('8000×6000')
  })

  it('没超限 → 说是内存不够，并区分创建 / 编码', () => {
    expect(canvasFailureMessage({ width: 800, height: 600 }, 'context')).toContain('没能创建 800×600')
    expect(canvasFailureMessage({ width: 800, height: 600 }, 'encode')).toContain('没能编码')
  })

  it('任何情况都不出现「请重试」', () => {
    for (const size of [{ width: 10, height: 10 }, { width: 50000, height: 10 }]) {
      for (const stage of ['context', 'encode'] as const) expect(canvasFailureMessage(size, stage)).not.toContain('请重试')
    }
  })
})

describe('downscaleNotice', () => {
  it('没缩小返回 null', () => {
    expect(downscaleNotice({ width: 100, height: 50 }, { width: 100, height: 50 })).toBeNull()
  })

  it('缩小了写清前后尺寸', () => {
    const text = downscaleNotice({ width: 8000, height: 6000 }, { width: 4729, height: 3547 })
    expect(text).toContain('8000×6000')
    expect(text).toContain('4729×3547')
  })
})

describe('joinNotices', () => {
  it('跳过空项，全空返回 null', () => {
    expect(joinNotices('a', null, 'b')).toBe('a；b')
    expect(joinNotices(null, null)).toBeNull()
  })
})
