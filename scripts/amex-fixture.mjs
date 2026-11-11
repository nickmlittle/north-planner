/* global Buffer, URL, console */
// Writes a synthetic Amex Excel export with the real layout and quirks (card-tracker-build-plan §4):
// both sheets, the 6-row header with the period in B1, text dates, float amounts, a newline inside
// Extended Details, a payment, a refund, a row dated the day before the period, two card endings and
// a summary that matches. Also writes a variant whose summary doesn't match.
// Every merchant, name, reference and balance here is fictitious. Never put a real export in the repo.
// Run: node scripts/amex-fixture.mjs
import { writeFileSync } from 'node:fs'
import { crc32, deflateRawSync } from 'node:zlib'

const period = 'Oct 25, 2026 to Nov 24, 2026'
const product = 'Example Rewards Credit Card'
const members = { ada: ['ADA EXAMPLE', '-41001'], ben: ['BEN EXAMPLE', '-41009'] }
// [date, description, who, amount, category, extended details?]
const rows = [
  ['08/11/2026', 'PAYMENT RECEIVED - THANK YOU', 'ada', -350.0, ''],
  ['08/11/2026', 'GREEN GROCER          LONDON', 'ada', 62.4, 'General Purchases-Groceries'],
  ['07/11/2026', 'CORNER CAFE 0042      BRISTOL', 'ben', 18.0, 'Entertainment-Restaurants'],
  ['06/11/2026', 'FUEL STOP 118         READING', 'ben', 58.2, 'General Purchases-Fuel'],
  ['05/11/2026', 'STREAMFLIX            LONDON', 'ada', 19.99, 'General Purchases-Online Purchases'],
  ['05/11/2026', 'HOMEWARE HUT          LEEDS', 'ben', -24.99, 'General Purchases-Home'],
  ['04/11/2026', 'GREEN GROCER          LONDON', 'ben', 44.6, 'General Purchases-Groceries'],
  ['03/11/2026', 'BOOK NOOK             YORK', 'ada', 12.5, 'General Purchases-Books', 'Foreign Spend Amount: 0.00\nCommission Amount: 0.00'],
  ['02/11/2026', 'HOMEWARE HUT          LEEDS', 'ben', 89.97, 'General Purchases-Home'],
  ['01/11/2026', 'MARKET HALL DELI      BATH', 'ada', 74.9, 'General Purchases-Groceries'],
  ['30/10/2026', 'CORNER CAFE 0042      BRISTOL', 'ada', 31.2, 'Entertainment-Restaurants'],
  ['28/10/2026', 'SEASIDE INN           WHITBY', 'ben', 210.0, 'Travel-Lodging'],
  ['26/10/2026', 'GREEN GROCER          LONDON', 'ada', 88.35, 'General Purchases-Groceries'],
  ['25/10/2026', 'PHONE CO              ONLINE', 'ben', 15.0, 'Communications-Mobile'],
  // Dated the day before the period starts: Amex posted it on this statement, so it belongs here.
  ['24/10/2026', 'MARKET HALL DELI      BATH', 'ben', 27.15, 'General Purchases-Groceries'],
]
const previous = 1278.75

const pence = value => Math.round(value * 100)
const charges = rows.filter(row => row[3] > 0).reduce((sum, row) => sum + pence(row[3]), 0)
const credits = rows.filter(row => row[3] < 0).reduce((sum, row) => sum + pence(row[3]), 0)
const float = cents => (cents / 100).toFixed(2).replace(/\.?0+$/, match => match.startsWith('.') ? '.0' : '')

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const columnName = index => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name }

function build(summaryCharges) {
  const shared = []
  const share = text => { let at = shared.indexOf(text); if (at < 0) { shared.push(text); at = shared.length - 1 } return at }
  const sheet = grid => {
    const xml = grid.map((cells, r) => `<row r="${r + 1}">${cells.map((cell, c) => {
      const ref = `${columnName(c)}${r + 1}`
      if (cell === null || cell === '') return ''
      if (typeof cell === 'object') return `<c r="${ref}"><v>${cell.number}</v></c>`
      return `<c r="${ref}" t="s"><v>${share(cell)}</v></c>`
    }).join('')}</row>`).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`
  }
  const header = title => [[title, `${product} / ${period}`], ['Prepared for'], ['A N EXAMPLE'], ['Account Number'], ['XXXX-XXXXXX-41001'], []]
  const details = [...header('Transaction Details'),
    ['Date', 'Description', 'Card Member', 'Account #', 'Amount', 'Extended Details', 'Appears On Your Statement As', 'Address', 'Town/City', 'Postcode', 'Country', 'Reference', 'Category'],
    ...rows.map(([date, description, who, amount, category, extended], index) => {
      const [member, suffix] = members[who]
      const town = description.split(/\s{2,}/)[1] ?? ''
      const payment = category === ''
      return [date, description, member, suffix, { number: float(pence(amount)) }, extended ?? '', description,
        payment ? '' : `${10 + index} EXAMPLE STREET\n${town}`, payment ? '' : town, payment ? '' : 'ZZ1 1ZZ', payment ? '' : 'UNITED KINGDOM',
        `AT26${String(9000000000000000000n + BigInt(index + 1))}`, category]
    })]
  const summary = [...header('Transaction Summary'), ['SUMMARY'], ['', 'Total'],
    ['Previous Balance', { number: float(pence(previous)) }],
    ['Payments & Credits', { number: float(credits) }],
    ['Charges', { number: float(summaryCharges) }],
    ['Total Balance', { number: float(pence(previous) + credits + summaryCharges) }]]
  const detailsXml = sheet(details), summaryXml = sheet(summary)
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map(text => `<si><t xml:space="preserve">${escape(text)}</t></si>`).join('')}</sst>`
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="Transaction Details" sheetId="1" r:id="rId1"/><sheet name="Transaction Summary" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ['xl/sharedStrings.xml', sharedXml],
    ['xl/worksheets/sheet1.xml', detailsXml],
    ['xl/worksheets/sheet2.xml', summaryXml],
  ])
}

/** A zip with deflate-raw entries and a fixed timestamp, so the output is byte-for-byte repeatable. */
function zip(files) {
  const locals = [], centrals = []
  let offset = 0
  for (const [fileName, text] of files) {
    const data = Buffer.from(text, 'utf8'), name = Buffer.from(fileName, 'utf8'), body = deflateRawSync(data, { level: 9 })
    const crc = crc32(data), time = 0, date = (2026 - 1980) << 9 | 11 << 5 | 9
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, body); centrals.push(central, name)
    offset += local.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const out = name => new URL(`../docs/fixtures/${name}`, import.meta.url)
writeFileSync(out('amex-export-sample.xlsx'), build(charges))
// The same rows, but Amex's summary has £12.34 of charges that aren't in the file.
writeFileSync(out('amex-export-mismatch.xlsx'), build(charges + 1234))
console.log(`Wrote ${rows.length} rows: charges £${(charges / 100).toFixed(2)}, payments and credits £${(credits / 100).toFixed(2)}`)
