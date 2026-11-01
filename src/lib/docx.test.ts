import { describe, expect, it } from 'vitest'

import { createDocx, documentXml, escapeDocxText } from './docx'

interface ZipFile {
  name: string
  data: string
}

/** createZip 是 store 模式；测试直接从中央目录取文件，不引入解压库。 */
function readZip(zip: Uint8Array): ZipFile[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files: ZipFile[] = []

  for (let index = 0; index < count; index++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50)
    const nameLength = view.getUint16(offset + 28, true)
    const size = view.getUint32(offset + 24, true)
    const local = view.getUint32(offset + 42, true)
    const localNameLength = view.getUint16(local + 26, true)
    const dataStart = local + 30 + localNameLength
    files.push({
      name: new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength)),
      data: new TextDecoder().decode(zip.subarray(dataStart, dataStart + size)),
    })
    offset += 46 + nameLength
  }
  return files
}

describe('escapeDocxText', () => {
  it('escapes XML metacharacters without changing Chinese text', () => {
    expect(escapeDocxText('中文 & <tag> "双" \'单\'')).toBe('中文 &amp; &lt;tag&gt; &quot;双&quot; &apos;单&apos;')
  })

  it('drops XML 1.0 forbidden controls but keeps tabs and line breaks', () => {
    expect(escapeDocxText(`A\u0000B\u0008C\tD\nE`)).toBe('ABC\tD\nE')
  })
})

describe('documentXml', () => {
  it('writes each extracted paragraph as a separate Word paragraph', () => {
    const xml = documentXml(['第一段：你好世界', '第二段 & more'])
    expect(xml.match(/<w:p>/g)).toHaveLength(2)
    expect(xml).toContain('<w:t xml:space="preserve">第一段：你好世界</w:t>')
    expect(xml).toContain('第二段 &amp; more')
    expect(xml).toContain('<w:sectPr>')
  })

  it('skips empty paragraphs instead of creating blank pages', () => {
    expect(documentXml(['', '正文']).match(/<w:p>/g)).toHaveLength(1)
  })
})

describe('createDocx', () => {
  it('builds the required OOXML package with UTF-8 Chinese text', () => {
    const bytes = createDocx(['你好，世界', 'PDF 提取文字'], new Date(2026, 10, 2, 12, 0, 0))
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])

    const files = readZip(bytes)
    expect(files.map((file) => file.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ])
    expect(files[0].data).toContain('wordprocessingml.document.main+xml')
    expect(files[1].data).toContain('relationships/officeDocument')
    expect(files[2].data).toContain('你好，世界')
    expect(files[2].data).toContain('PDF 提取文字')
  })

  it('is deterministic when the ZIP timestamp is injected', () => {
    const now = new Date(2026, 10, 2, 12, 0, 0)
    expect(createDocx(['same'], now)).toEqual(createDocx(['same'], now))
  })
})
