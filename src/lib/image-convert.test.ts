import { describe, expect, it } from 'vitest'

import { IMAGE_FORMATS, getFormat, swapExtension } from './image-convert'

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
