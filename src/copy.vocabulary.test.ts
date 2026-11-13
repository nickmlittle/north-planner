import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Keeps on-screen copy to the four-word vocabulary from UX review §6.10:
// Available (income), Planned (items and the balance: "£X over / £X left"),
// Funding (what each person pays into an account) and Move (account to pot).
// It reads the prose in string literals and JSX text, not identifiers or class names.
const sourceFiles = (dir: string): string[] => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sourceFiles(`${dir}${entry.name}/`)
    : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [`${dir}${entry.name}`] : [])
const files = [...sourceFiles('./pages/'), ...sourceFiles('./components/'), './domain/budgetItemDrafts.ts']

/** Prose only: literals with a space in them and JSX text, with hyphenated class names removed. */
function prose(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const literals = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '')
  const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map(match => match[1]!).filter(text => !/[;=[\]]|\?\?|\breturn\b/.test(text))
  return [...literals.filter(text => /\s/.test(text.trim())), ...jsxText]
    .map(text => text.replace(/[\w]+(?:-[\w]+)+/g, '').trim()).filter(Boolean)
}

const retired: Array<[RegExp, string]> = [
  [/funding total/i, 'Funding (or Total in a table footer)'],
  [/budget balance/i, '"£X over" / "£X left" / "Balanced"'],
  [/planned budget/i, 'Planned'],
  [/available (this month|income)/i, 'Available'],
  [/\bcontribut/i, 'Funding, or Fixed amounts for the fixed rule'],
  [/\ballocat/i, 'Funding / funded / unassigned'],
  [/left to allocate|\bremaining\b|shortfall/i, '"£X left" / "£X over"'],
  [/transfers by (destination|person)|monthly plan by person|people (&|&amp;|and) transfers/i, 'Funding by account / Funding'],
  [/later saved budgets/i, 'nothing: the scope line already says which months change'],
  [/edit budget item/i, 'Edit item'],
  // Figure first, no second-person headlines (audit 3 D11).
  [/you['’]re both (over|up to date)/i, 'the figure: "£1,141.87 over", "Payday · 18 of 18 done"'],
  [/needs care|need care/i, '"ahead of pace" / "over"'],
  [/who['’]s moving money/i, 'nothing: the person switch says whose steps'],
  [/all from salary/i, 'nothing: the basis shows only when it isn’t all salary'],
  // Recurring bills (recurring-bills-rules, glossary).
  [/scheduled payment|standing item|payment method/i, 'Recurring bill / Paid by'],
  [/\boutstanding\b|pending (bill|payment)/i, 'Due: “£172.00 of it due”, “Due 22 Nov”'],
  [/\bexpires\b/i, 'Renews: “Renews 3 Mar”'],
]

describe('on-screen vocabulary', () => {
  const texts = files.flatMap(file => prose(readFileSync(new URL(file, import.meta.url), 'utf8')).map(text => ({ file, text })))

  it('reads some prose from every screen', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(texts.some(({ text }) => text.includes('Funding by account'))).toBe(true)
  })

  it.each(retired)('does not use %s', (pattern, instead) => {
    const hits = texts.filter(({ text }) => pattern.test(text)).map(({ file, text }) => `${file}: “${text}” → use ${instead}`)
    expect(hits).toEqual([])
  })
})
