// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeBudgetDocument } from '../domain/budgetDocument'
import { buildCommands, matchScore, rankCommands, readRecentCommands, rememberCommand, type Command } from './commands'

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const commands = () => buildCommands(seed(), '2026-11', '2026-11-13')
const titles = (query: string, recent: string[] = []) => rankCommands(commands(), query, recent).map(section => [section.group, section.commands.map(command => command.title)] as const)
const groupOf = (query: string, group: string) => rankCommands(commands(), query).find(section => section.group === group)?.commands ?? []

afterEach(() => window.localStorage.clear())

describe('command palette sources', () => {
  it('has every screen and Settings section, the month’s items, pots, statements, months, transactions and actions', () => {
    const all = commands()
    const count = (group: Command['group']) => all.filter(command => command.group === group).length
    expect(all.filter(command => command.group === 'Go to').map(command => command.title).slice(0, 7)).toEqual(['Home', 'Month', 'Plan', 'Spending', 'Transactions', 'Statements', 'Settings'])
    expect(all.some(command => command.title === 'Settings · Sorting rules')).toBe(true)
    expect(count('Items')).toBe(40)
    expect(count('Months')).toBe(9)
    expect(count('Statements')).toBe(2)
    expect(all.filter(command => command.group === 'Actions').map(command => command.title)).toEqual(['Add item', 'Bills by date', 'Bring in transactions', 'Add a transaction', 'Previous month', 'Next month', 'Keyboard shortcuts'])
    const groceries = all.find(command => command.id.startsWith('item:') && command.title === 'Groceries')!
    expect(groceries.meta).toBe('£325.47 · Home · Groceries · Monzo Joint')
    expect(groceries.target).toEqual({ kind: 'go', to: { view: 'plan', month: '2026-11', planDestination: null }, state: { northPlanItem: groceries.id.slice(5) } })
  })

  it('finds Groceries as an item, a pot and GREEN GROCER transactions for "groc"', () => {
    expect(groupOf('groc', 'Items').map(command => command.title)).toContain('Groceries')
    expect(groupOf('groc', 'Pots').map(command => command.title)).toContain('Groceries pot')
    expect(groupOf('groc', 'Transactions').every(command => command.title === 'GREEN GROCER LONDON')).toBe(true)
    expect(groupOf('groc', 'Transactions').length).toBeGreaterThan(0)
    // Transactions need three letters.
    expect(groupOf('gr', 'Transactions')).toEqual([])
  })

  it('finds the October statement and October 2026 for "oct", and puts Add item first for "add"', () => {
    expect(groupOf('oct', 'Statements').map(command => command.title)).toEqual(['October statement'])
    expect(groupOf('oct', 'Months').map(command => command.title)).toEqual(['October 2026'])
    expect(rankCommands(commands(), 'add')[0]!.commands[0]!.title).toBe('Add item')
  })

  it('matches amounts, ranks word prefixes over substrings, and matches initials', () => {
    expect(groupOf('325', 'Items').map(command => command.title)).toEqual(['Groceries'])
    const item = (title: string): Command => ({ id: title, group: 'Items', title, target: { kind: 'action', action: 'add-item' } })
    expect(matchScore(item('Water'), 'wat')).toBeGreaterThan(matchScore(item('Hot water'), 'wat'))
    expect(matchScore(item('Hot water'), 'wat')).toBeGreaterThan(matchScore(item('Sweatshop'), 'wat'))
    expect(matchScore(item('Keyboard shortcuts'), 'ks')).toBeGreaterThan(0)
    expect(matchScore(item('Rent'), 'zzz')).toBe(0)
  })

  it('limits each group to six and thirty in all, and shows Recent first on an empty query', () => {
    const sections = rankCommands(commands(), 'e')
    expect(sections.every(section => section.commands.length <= 6)).toBe(true)
    expect(sections.reduce((sum, section) => sum + section.commands.length, 0)).toBeLessThanOrEqual(30)
    expect(titles('').map(([group]) => group)).toEqual(['Go to', 'Actions'])
    rememberCommand('pot:nonexistent'); rememberCommand('do:add-item')
    expect(readRecentCommands()).toEqual(['do:add-item', 'pot:nonexistent'])
    expect(titles('', readRecentCommands())[0]).toEqual(['Recent', ['Add item']])
  })
})
