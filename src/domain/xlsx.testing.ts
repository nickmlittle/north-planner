// Test-only: writes small XLSX workbooks so the reader can be tested on every cell type and zip method.
import { crc32, deflateRawSync } from 'node:zlib'

export type CellSpec = string | number | boolean | null | { inline: string } | { str: string } | { runs: string[] } | { raw: string }

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const column = (index: number) => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name }

/** A zip archive of the given files; `stored` skips compression. */
export function zip(files: Array<{ name: string; text: string; stored?: boolean }>): Uint8Array {
  const locals: Buffer[] = [], centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const data = Buffer.from(file.text, 'utf8'), name = Buffer.from(file.name, 'utf8')
    const body = file.stored ? data : deflateRawSync(data)
    const crc = crc32(data), method = file.stored ? 0 : 8
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, body); centrals.push(central, name)
    offset += local.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

/** A workbook with these sheets; text goes to shared strings unless given as `inline`, `str` or `runs`. */
export function workbook(sheets: Record<string, CellSpec[][]>, { stored = false, prefix = '' }: { stored?: boolean; prefix?: string } = {}): Uint8Array {
  const shared: string[] = []
  const share = (text: string) => { const at = shared.indexOf(text); if (at >= 0) return at; shared.push(text); return shared.length - 1 }
  const p = prefix ? `${prefix}:` : ''
  const ns = prefix ? `xmlns:${prefix}` : 'xmlns'
  const names = Object.keys(sheets)
  const sheetXml = names.map(name => {
    const rows = sheets[name]!.map((cells, r) => `<${p}row r="${r + 1}">${cells.map((cell, c) => {
      const ref = `${column(c)}${r + 1}`
      if (cell === null) return ''
      if (typeof cell === 'number') return `<${p}c r="${ref}"><${p}v>${cell}</${p}v></${p}c>`
      if (typeof cell === 'boolean') return `<${p}c r="${ref}" t="b"><${p}v>${cell ? 1 : 0}</${p}v></${p}c>`
      if (typeof cell === 'string') return `<${p}c r="${ref}" t="s"><${p}v>${share(cell)}</${p}v></${p}c>`
      if ('inline' in cell) return `<${p}c r="${ref}" t="inlineStr"><${p}is><${p}t>${escape(cell.inline)}</${p}t></${p}is></${p}c>`
      if ('str' in cell) return `<${p}c r="${ref}" t="str"><${p}f>A1</${p}f><${p}v>${escape(cell.str)}</${p}v></${p}c>`
      if ('raw' in cell) return `<${p}c r="${ref}"><${p}v>${cell.raw}</${p}v></${p}c>`
      return `<${p}c r="${ref}" t="s"><${p}v>${shared.push(`\u0000runs:${cell.runs.join('\u0001')}`) - 1}</${p}v></${p}c>`
    }).join('')}</${p}row>`).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${p}worksheet ${ns}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><${p}sheetData>${rows}</${p}sheetData></${p}worksheet>`
  })
  const si = shared.map(text => text.startsWith('\u0000runs:')
    ? `<si>${text.slice(6).split('\u0001').map(run => `<r><rPr><b/></rPr><t xml:space="preserve">${escape(run)}</t></r>`).join('')}<rPh><t>ignored</t></rPh></si>`
    : `<si><t xml:space="preserve">${escape(text)}</t></si>`).join('')
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return zip([
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', stored },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`, stored },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>${names.map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`, stored },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="${rel}/sharedStrings" Target="/xl/sharedStrings.xml"/></Relationships>`, stored },
    { name: 'xl/sharedStrings.xml', text: `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${si}</sst>`, stored },
    ...sheetXml.map((text, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text, stored })),
  ])
}
