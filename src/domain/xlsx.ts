/**
 * A minimal, dependency-free XLSX reader: enough to read the Amex Excel export.
 * Unzips with the ZIP central directory (stored or deflated entries, inflated by DecompressionStream),
 * finds sheets by name through the workbook and its relationships, and reads shared strings and cells
 * with DOMParser. Returns each sheet as rows of cells.
 */
export type XlsxCell = string | number | boolean | null
export type XlsxSheets = Map<string, XlsxCell[][]>

export class XlsxError extends Error {}

const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50

type Entry = { name: string; method: number; compressedSize: number; offset: number }

function entries(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  // The end-of-central-directory record sits in the last 22 bytes plus any comment (up to 64 KB).
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) if (view.getUint32(at, true) === EOCD) { end = at; break }
  if (end < 0) throw new XlsxError('Not a zip file')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const found = new Map<string, Entry>()
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw new XlsxError('Broken zip directory')
    const method = view.getUint16(at + 10, true), compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    found.set(name, { name, method, compressedSize, offset })
    at += 46 + nameLength + extraLength + commentLength
  }
  return found
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  // A broken entry rejects here and in read() below; read() is the one that reports it.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {})
  writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); length += value.length
  }
  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}

async function read(bytes: Uint8Array, entry: Entry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.offset, true) !== LOCAL) throw new XlsxError('Broken zip entry')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method === 8) return new TextDecoder().decode(await inflate(data))
  throw new XlsxError(`Unsupported zip compression ${entry.method}`)
}

function parse(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new XlsxError('Broken XML')
  return document
}

/** Elements by local name, whatever namespace prefix the writer used. */
const byName = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)]
const children = (element: Element, name: string) => [...element.children].filter(child => child.localName === name)
/** An attribute by local name (`r:id` and friends, whatever the prefix). */
function attribute(element: Element, name: string): string | null {
  for (const attr of element.attributes) if (attr.localName === name) return attr.value
  return null
}

/** Visible text of a string item: every <t>, skipping phonetic runs (<rPh>). */
function text(element: Element): string {
  return byName(element, 't').filter(t => !t.closest('rPh')).map(t => t.textContent ?? '').join('')
}

/** "B12" → column 1 (0-based). */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? ''
  let index = 0
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}

function relationships(xml: string | undefined, base: string): Array<{ id: string; type: string; target: string }> {
  if (!xml) return []
  return byName(parse(xml), 'Relationship').map(row => ({ id: row.getAttribute('Id') ?? '', type: row.getAttribute('Type') ?? '', target: resolveTarget(base, row.getAttribute('Target') ?? '') }))
}

function sheetRows(xml: string, shared: string[]): XlsxCell[][] {
  const rows: XlsxCell[][] = []
  let nextRow = 0
  for (const row of byName(parse(xml), 'row')) {
    const rowNumber = Number(row.getAttribute('r'))
    const rowIndex = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : nextRow
    nextRow = rowIndex + 1
    const cells: XlsxCell[] = []
    let nextColumn = 0
    for (const cell of children(row, 'c')) {
      const ref = cell.getAttribute('r')
      const column = ref ? columnIndex(ref) : nextColumn
      nextColumn = column + 1
      const type = cell.getAttribute('t') ?? 'n'
      const value = children(cell, 'v')[0]?.textContent ?? null
      let content: XlsxCell
      if (type === 's') content = value === null ? null : shared[Number(value)] ?? null
      else if (type === 'inlineStr') content = children(cell, 'is')[0] ? text(children(cell, 'is')[0]!) : null
      else if (type === 'str' || type === 'e') content = value
      else if (type === 'b') content = value === null ? null : value === '1'
      else content = value === null || value.trim() === '' ? null : Number(value)
      if (typeof content === 'number' && !Number.isFinite(content)) content = null
      while (cells.length < column) cells.push(null)
      cells[column] = content
    }
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex] = cells
  }
  return rows
}

/** Reads every sheet of a workbook, by name. Throws XlsxError if the file isn't a readable XLSX. */
export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<XlsxSheets> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const zip = entries(bytes)
  const file = async (path: string) => { const entry = zip.get(path); return entry ? read(bytes, entry) : undefined }
  const root = relationships(await file('_rels/.rels'), '')
  const workbookPath = root.find(row => row.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml'
  const workbookXml = await file(workbookPath)
  if (!workbookXml) throw new XlsxError('No workbook')
  const workbookRels = relationships(await file(workbookPath.replace(/[^/]+$/, '_rels/$&.rels')), workbookPath)
  const sharedPath = workbookRels.find(row => row.type.endsWith('/sharedStrings'))?.target ?? 'xl/sharedStrings.xml'
  const sharedXml = await file(sharedPath)
  const shared = sharedXml ? byName(parse(sharedXml), 'si').map(text) : []
  const sheets: XlsxSheets = new Map()
  for (const sheet of byName(parse(workbookXml), 'sheet')) {
    const name = sheet.getAttribute('name') ?? ''
    const target = workbookRels.find(row => row.id === attribute(sheet, 'id'))?.target
    const xml = target ? await file(target) : undefined
    if (name && xml) sheets.set(name, sheetRows(xml, shared))
  }
  return sheets
}

/** An Excel date serial (days since 30 Dec 1899) to YYYY-MM-DD. */
export function excelSerialDate(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
}
