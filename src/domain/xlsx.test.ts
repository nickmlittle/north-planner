// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { excelSerialDate, readXlsx, XlsxError } from './xlsx'
import { workbook, zip } from './xlsx.testing'

describe('readXlsx', () => {
  it('reads shared strings, inline strings, formula strings, numbers and booleans', async () => {
    const sheets = await readXlsx(workbook({ Data: [
      ['Text', { inline: 'Inline & <odd>' }, { str: 'Formula result' }, 61.12, true, false],
      [null, 'After a gap', null, { raw: '1.8E1' }],
      [{ runs: ['Rich ', 'text'] }],
    ] }))
    expect(sheets.get('Data')).toEqual([
      ['Text', 'Inline & <odd>', 'Formula result', 61.12, true, false],
      [null, 'After a gap', null, 18],
      ['Rich text'],
    ])
  })

  it('reads stored (uncompressed) entries as well as deflated ones', async () => {
    const sheets = await readXlsx(workbook({ One: [['a', 1]], Two: [['b', 2]] }, { stored: true }))
    expect([...sheets.keys()]).toEqual(['One', 'Two'])
    expect(sheets.get('Two')).toEqual([['b', 2]])
  })

  it('keeps newlines inside text', async () => {
    const sheets = await readXlsx(workbook({ Data: [['Line one\nLine two']] }))
    expect(sheets.get('Data')?.[0]?.[0]).toBe('Line one\nLine two')
  })

  it('reads sheets written with a namespace prefix', async () => {
    const sheets = await readXlsx(workbook({ Data: [['x', 2.5]] }, { prefix: 'x' }))
    expect(sheets.get('Data')).toEqual([['x', 2.5]])
  })

  it('places cells by their reference, leaving gaps empty', async () => {
    const sheets = await readXlsx(workbook({ Data: [[null, null, 'C1'], [], ['A3']] }))
    expect(sheets.get('Data')).toEqual([[null, null, 'C1'], [], ['A3']])
  })

  it('rejects files that are not zips or have no workbook', async () => {
    await expect(readXlsx(new TextEncoder().encode('Date,Description,Amount\n01/11/2026,SHOP,1.00\n'))).rejects.toBeInstanceOf(XlsxError)
    await expect(readXlsx(zip([{ name: 'hello.txt', text: 'hi' }]))).rejects.toBeInstanceOf(XlsxError)
  })

  it('turns Excel date serials into dates', () => {
    expect(excelSerialDate(46335)).toBe('2026-11-09')
    expect(excelSerialDate(46335.75)).toBe('2026-11-09')
  })
})
