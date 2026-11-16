import { destinationKey, type CardTransaction } from './cardTracker'
import { countedTotals, type Held } from './expectingBack'
import type { BudgetDestination } from './monthlyBudget'

/**
 * Merchants by brand, for a pot's "Where it went" (Spending ↔ Month link F4). Amex writes one shop many ways
 * ("TESCO STORES", "TESCO STORE 3180 SIDCUP"), so spend is grouped by brand, not by description.
 */

/** Chains that a prefix names, whatever follows (store, town, format). The first match wins. */
const BRANDS: Array<[RegExp, string]> = [
  [/^(AMZN|AMAZON)/, 'Amazon'],
  [/^TESCO\b/, 'Tesco'],
  [/^(SAINSBURY|J SAINSBURY|JS\b)/, 'Sainsbury’s'],
  [/^LIDL\b/, 'Lidl'],
  [/^ALDI\b/, 'Aldi'],
  [/^ASDA\b/, 'Asda'],
  [/^(M&S|M & S|MARKS ?& ?SPENCER)/, 'M&S'],
  [/^WAITROSE\b/, 'Waitrose'],
  [/^(WM MORRISON|MORRISONS?\b)/, 'Morrisons'],
  [/^(CO-OP|COOP|CO OP)\b/, 'Co-op'],
  [/^B ?& ?M\b/, 'B&M'],
  [/^IKEA\b/, 'IKEA'],
  [/^(UBER EATS|UBER \*EATS)/, 'Uber Eats'],
  [/^UBER\b/, 'Uber'],
  [/^DELIVEROO\b/, 'Deliveroo'],
  [/^JUST EAT\b/, 'Just Eat'],
]

/** Words that describe the shop rather than name it: the brand ends before the first one. */
const GENERIC = new Set(['STORE', 'STORES', 'SUPERSTORE', 'SUPERMARKET', 'SUPERMARKETS', 'S/MKT', 'S/MKTS', 'EXPRESS', 'METRO', 'EXTRA', 'LOCAL', 'RETAIL', 'LTD', 'LIMITED', 'PLC', 'UK', 'GB', 'ONLINE', 'WWW'])

/** "GROCER" → "Grocer"; initials and symbols stay as they are ("BP", "H&M"). */
const titleCase = (word: string) => word.length <= 2 || /[^A-Z']/.test(word) ? word : `${word[0]}${word.slice(1).toLowerCase()}`

/**
 * A merchant's brand, for grouping and showing: "TESCO STORE 3180 SIDCUP" and "TESCO STORES" → "Tesco",
 * "B&M Retail - 10742 B&M" → "B&M", "AMZNMKTPLACE" → "Amazon", "GREEN GROCER" → "Green Grocer".
 */
export function brandOf(merchant: string): string {
  const text = merchant.toUpperCase().replace(/[\d*]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [pattern, brand] of BRANDS) if (pattern.test(text)) return brand
  const head = text.split(' - ')[0]!.replace(/^WWW\./, '').replace(/\.(CO\.UK|COM|UK)\b.*$/, '')
  const words: string[] = []
  for (const word of head.split(' ').filter(Boolean)) { if (GENERIC.has(word)) break; words.push(word) }
  return (words.length ? words : head.split(' ').filter(Boolean).slice(0, 1)).map(titleCase).join(' ') || merchant
}

export type MerchantRow = {
  brand: string
  /** What this brand put on the pot: its lines on it, refunds taking away. */
  pence: number
  /** Transactions with a line on the pot. */
  count: number
  transactionIds: string[]
}

/**
 * Where a pot's card spend went, by brand, biggest first: up to `bars` brands, then everything else as one "Other"
 * row (`other`). Only each transaction's lines on this destination count, so splits and refunds add up to the pot's
 * card spend (`totalPence`). Held money (expecting back, `heldOut`) isn't spend, so it's left out.
 */
export function merchantBreakdown(transactions: readonly CardTransaction[], destination: BudgetDestination, bars = 5, held?: Held): { rows: MerchantRow[]; other?: MerchantRow; totalPence: number } {
  const key = destinationKey(destination)
  const byBrand = new Map<string, MerchantRow>()
  let totalPence = 0
  for (const transaction of transactions) {
    const pence = countedTotals(transaction, held).get(key)?.pence ?? 0
    if (!transaction.sort?.lines.some(line => destinationKey(line.destination) === key)) continue
    const brand = brandOf(transaction.merchant || transaction.description)
    const row = byBrand.get(brand) ?? { brand, pence: 0, count: 0, transactionIds: [] }
    row.pence += pence
    row.count++
    row.transactionIds.push(transaction.id)
    byBrand.set(brand, row)
    totalPence += pence
  }
  // Biggest first; a tie goes to the brand used more often, then the name.
  const sorted = [...byBrand.values()].sort((a, b) => b.pence - a.pence || b.count - a.count || a.brand.localeCompare(b.brand, 'en-GB'))
  const shown = sorted.length > bars + 1 ? sorted.slice(0, bars) : sorted
  const rest = sorted.slice(shown.length)
  const other = rest.length ? { brand: 'Other', pence: rest.reduce((sum, row) => sum + row.pence, 0), count: rest.reduce((sum, row) => sum + row.count, 0), transactionIds: rest.flatMap(row => row.transactionIds) } : undefined
  return { rows: shown, ...other ? { other } : {}, totalPence }
}
