import { describe, expect, it } from 'vitest'
import { merchantKey, type CardTransaction } from './cardTracker'
import { brandOf, merchantBreakdown } from './merchants'

describe('brandOf', () => {
  it.each([
    ['TESCO STORES', 'Tesco'],
    ['TESCO STORE 3180 SIDCUP', 'Tesco'],
    [merchantKey('TESCO STORE 3180      SIDCUP'), 'Tesco'],
    ['TESCO EXPRESS', 'Tesco'],
    ['AMZNMKTPLACE', 'Amazon'],
    ['AMZNMKTPLACE*AB12CD', 'Amazon'],
    ['AMAZON.CO.UK', 'Amazon'],
    ['AMAZON MARKETPLACE', 'Amazon'],
    [merchantKey('B&M Retail - 10742 B&M  Dartford'), 'B&M'],
    ['B & M RETAIL', 'B&M'],
    ['LIDL GB SIDCUP', 'Lidl'],
    ['SAINSBURYS S/MKTS', 'Sainsbury’s'],
    ['UBER *EATS', 'Uber Eats'],
    ['GREEN GROCER', 'Green Grocer'],
    ['MARKET HALL DELI', 'Market Hall Deli'],
    ['TRAIN TICKETS ONLINE', 'Train Tickets'],
    ['WWW.ASOS.COM', 'Asos'],
    ['SEASIDE INN', 'Seaside Inn'],
    ['H&M', 'H&M'],
    ['STORES', 'Stores'],
  ])('%s → %s', (merchant, brand) => expect(brandOf(merchant)).toBe(brand))
})

const tx = (id: string, merchant: string, amountPence: number, lines: Array<[string, number]> = [['groceries', amountPence]]): CardTransaction => ({
  id, cardId: 'amex', date: '2026-11-06', description: merchant, merchant, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
  sort: { lines: lines.map(([potId, pence]) => ({ amountPence: pence, destination: { kind: 'pot' as const, potId } })), by: 'person', at: 'x' },
})
const groceries = { kind: 'pot' as const, potId: 'groceries' }

describe('merchantBreakdown', () => {
  it('groups by brand, biggest first, with each transaction’s line on the pot', () => {
    const { rows, other, totalPence } = merchantBreakdown([
      tx('a', 'TESCO STORES', 13581), tx('b', 'TESCO STORE 3180 SIDCUP', 5281), tx('c', 'LIDL', 903),
      // Half of this shop was for the pot; the rest went elsewhere.
      tx('d', 'B&M RETAIL - B&M', 6112, [['groceries', 2000], ['treats', 4112]]),
      tx('e', 'TESCO STORES', -500),
      tx('f', 'CORNER SHOP', 400, [['treats', 400]]),
    ], groceries)
    expect(rows.map(row => [row.brand, row.pence, row.count])).toEqual([['Tesco', 18362, 3], ['B&M', 2000, 1], ['Lidl', 903, 1]])
    expect(rows[0]!.transactionIds).toEqual(['a', 'b', 'e'])
    expect(other).toBeUndefined()
    expect(totalPence).toBe(18362 + 2000 + 903)
  })

  it('shows up to five brands, then Other for the rest', () => {
    const names = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF']
    const { rows, other, totalPence } = merchantBreakdown(names.map((name, index) => tx(name, name, 1000 - index * 100)), groceries)
    expect(rows.map(row => row.brand)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    expect(other).toEqual({ brand: 'Other', pence: 500 + 400, count: 2, transactionIds: ['FOXTROT', 'GOLF'] })
    expect(rows.reduce((sum, row) => sum + row.pence, other!.pence)).toBe(totalPence)
    // Six brands fit: Other never stands in for just one.
    expect(merchantBreakdown(names.slice(0, 6).map(name => tx(name, name, 100)), groceries).other).toBeUndefined()
  })

  it('has nothing for a pot with no card spend', () => {
    expect(merchantBreakdown([tx('a', 'TESCO', 100, [['treats', 100]])], groceries)).toEqual({ rows: [], totalPence: 0 })
  })
})
