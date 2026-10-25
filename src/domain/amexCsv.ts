import type { BudgetTransaction } from './monthlyBudget'

export function parseAmexCsv(text: string): { transactions: Omit<BudgetTransaction, 'id' | 'potId'>[]; error?: string } {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i++) { const c = text[i]!; if (c === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { row.push(cell); cell = '' } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = '' } else cell += c }
  if (quoted) return { transactions: [], error: 'The CSV contains an unfinished quoted field.' }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (rows.length < 2) return { transactions: [], error: 'The CSV needs a header and at least one transaction.' }
  const headers = rows[0]!.map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''))
  const find = (...names: string[]) => headers.findIndex(h => names.includes(h))
  const date = find('date', 'transactiondate'); const description = find('description', 'details', 'merchant', 'transaction'); const amount = find('amount', 'gbp', 'debit', 'credit')
  if (date < 0 || description < 0 || amount < 0) return { transactions: [], error: 'Could not find date, description and amount columns.' }
  const transactions = [] as Omit<BudgetTransaction, 'id' | 'potId'>[]
  for (const values of rows.slice(1)) {
    const rawDate = values[date]?.trim() ?? ''; const parsedDate = /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate) ? `${rawDate.slice(6)}-${rawDate.slice(3,5)}-${rawDate.slice(0,2)}` : rawDate
    const rawAmount = (values[amount] ?? '').replace(/[£,\s]/g, '')
    const value = Number(rawAmount); const dateValue = new Date(`${parsedDate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate) || !Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== parsedDate || !Number.isFinite(value)) return { transactions: [], error: `Invalid date or amount on row ${rows.indexOf(values) + 1}.` }
    transactions.push({ date: parsedDate, description: values[description]?.trim() ?? '', amountPence: Math.round(value * 100) })
  }
  return { transactions }
}
