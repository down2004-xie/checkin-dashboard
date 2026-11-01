import { describe, expect, it } from 'vitest'

import { matchesAccept, partitionFiles, unsupportedHint } from './file-accept'

const file = (name: string, type: string) => ({ name, type })

describe('matchesAccept', () => {
  it('accepts everything when accept is empty', () => {
    expect(matchesAccept(file('a.bin', ''), '')).toBe(true)
  })

  it('matches wildcard MIME types', () => {
    expect(matchesAccept(file('a.png', 'image/png'), 'image/*')).toBe(true)
    expect(matchesAccept(file('a.pdf', 'application/pdf'), 'image/*')).toBe(false)
  })

  it('matches extensions case-insensitively, even without a MIME type', () => {
    // 拖放来的文件有时 type 是空串（Windows 上的少见扩展名），只能靠扩展名认
    expect(matchesAccept(file('Report.PDF', ''), '.pdf')).toBe(true)
  })

  it('matches exact MIME types and comma-separated lists', () => {
    expect(matchesAccept(file('a.jpg', 'image/jpeg'), 'application/pdf, image/jpeg')).toBe(true)
    expect(matchesAccept(file('a.gif', 'image/gif'), 'application/pdf, image/jpeg')).toBe(false)
  })

  it('does not let image/* match a type that merely starts with "image"', () => {
    expect(matchesAccept(file('a', 'imagex/foo'), 'image/*')).toBe(false)
  })
})

describe('partitionFiles', () => {
  const files = [file('a.txt', 'text/plain'), file('b.png', 'image/png'), file('c.jpg', 'image/jpeg')]

  it('keeps all matching files when multiple', () => {
    const { accepted, rejected } = partitionFiles(files, 'image/*', true)
    expect(accepted.map((f) => f.name)).toEqual(['b.png', 'c.jpg'])
    expect(rejected.map((f) => f.name)).toEqual(['a.txt'])
  })

  it('keeps only the first matching file when not multiple', () => {
    expect(partitionFiles(files, 'image/*', false).accepted.map((f) => f.name)).toEqual(['b.png'])
  })
})

describe('unsupportedHint', () => {
  it('names HEIC explicitly with a fix', () => {
    expect(unsupportedHint(file('IMG_0001.HEIC', ''))).toContain('HEIC')
    expect(unsupportedHint(file('x', 'image/heif'))).toContain('HEIC')
  })

  it('falls back to a generic message', () => {
    expect(unsupportedHint(file('a.txt', 'text/plain'))).toBe('「a.txt」的格式不受这个工具支持')
  })
})
