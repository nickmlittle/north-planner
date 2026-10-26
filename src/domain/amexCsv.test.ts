import { describe, expect, it } from 'vitest'
import { parseAmexCsv } from './amexCsv'

describe('Amex CSV import', () => {
  it('parses quoted fields and preserves statement credits', () => {
    expect(parseAmexCsv('Date,Description,Amount\n25/10/2026,"Cafe, London",12.34\n2026-10-26,Refund,-3.25')).toEqual({ transactions: [
      { date: '2026-10-25', description: 'Cafe, London', amountPence: 1234 }, { date: '2026-10-26', description: 'Refund', amountPence: -325 },
    ] })
  })
  it('reports malformed input rather than silently dropping transactions', () => {
    expect(parseAmexCsv('Date,Amount\n2026-01-01,1').error).toContain('date, description and amount')
    expect(parseAmexCsv('Date,Description,Amount\nwrong,Shop,3').error).toContain('row 2')
  })
})
