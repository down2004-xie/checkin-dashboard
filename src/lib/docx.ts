import { createZip } from './zip'

const encoder = new TextEncoder()

/** XML 1.0 不允许大多数控制字符；PDF 文字层偶尔会带这些字符，写进 DOCX 会让 Word 判文件损坏。 */
function stripInvalidXmlChars(text: string): string {
  return Array.from(text).filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return code === 0x09 || code === 0x0a || code === 0x0d
      || (code >= 0x20 && code <= 0xd7ff)
      || (code >= 0xe000 && code <= 0xfffd)
      || (code >= 0x10000 && code <= 0x10ffff)
  }).join('')
}

/** 放进 <w:t> 前转义 XML 元字符，并剔除 OOXML 不接受的控制字符。 */
export function escapeDocxText(text: string): string {
  return stripInvalidXmlChars(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 把段落变成 WordprocessingML 主文档。
 * 只表达「这些文字分成这些段」，刻意不伪造 PDF 的字体、表格或多栏排版。
 */
export function documentXml(paragraphs: readonly string[]): string {
  const body = paragraphs
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${escapeDocxText(paragraph)}</w:t></w:r></w:p>`)
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
    `</w:body></w:document>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

/**
 * 生成最小但真实的 .docx（OOXML ZIP）。now 可注入，让测试里的 ZIP 字节稳定。
 * DOCX 不需要压缩才能合法；createZip 的 store 模式能被 Word / LibreOffice 正常读取。
 */
export function createDocx(paragraphs: readonly string[], now: Date = new Date()): Uint8Array {
  return createZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'word/document.xml', data: encoder.encode(documentXml(paragraphs)) },
  ], now)
}
