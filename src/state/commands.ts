import type { BudgetDocument } from '../domain/budgetDocument'
import { allTransactions } from '../domain/cardSorting'
import { statementKeys, statementSummary } from '../domain/cardStatements'
import { cardTracker, parseStatementKey } from '../domain/cardTracker'
import { resolveBudget } from '../domain/monthlyBudget'
import { formatGBP } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from '../pages/budgetLabels'
import { dayDate } from '../pages/cardLabels'
import { planItemLabels } from '../pages/planRows'
import { signedPounds, statementName, statementStatus } from '../pages/spendingFormat'
import type { NavigationState, SettingsSection } from './navigation'

/**
 * ⌘K's sources (audit 3 PR 19): every screen, item, pot, statement, month, transaction and action as a command, and
 * how a query ranks them. Pure, so it's tested on its own; the palette only draws and runs them.
 */
export type CommandGroup = 'Recent' | 'Go to' | 'Actions' | 'Items' | 'Pots' | 'Statements' | 'Months' | 'Transactions'
export type CommandAction = 'add-item' | 'bills-by-date' | 'bring-in' | 'add-transaction' | 'previous-month' | 'next-month' | 'shortcuts'
export type CommandTarget =
  | { kind: 'go'; to: Partial<NavigationState>; state?: Record<string, unknown> }
  | { kind: 'action'; action: CommandAction }
export type Command = { id: string; group: Exclude<CommandGroup, 'Recent'>; title: string; meta?: string; keys?: string; target: CommandTarget }

const GROUP_ORDER: CommandGroup[] = ['Recent', 'Go to', 'Actions', 'Items', 'Pots', 'Statements', 'Months', 'Transactions']
const SETTINGS: Array<[SettingsSection, string]> = [['household', 'Household'], ['income', 'Pay & income'], ['accounts', 'Accounts & pots'], ['categories', 'Categories'], ['cards', 'Cards'], ['rules', 'Sorting rules'], ['account', 'Account & sync']]
const pounds = (pence: number) => formatGBP(pence / 100)
const shiftMonth = (month: string, by: number) => { const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1)); return date.toISOString().slice(0, 7) }

/** Everything ⌘K can jump to or do, for the month in view. Transactions come last and only match longer queries. */
export function buildCommands(document: BudgetDocument, month: string, today: string): Command[] {
  const go = (to: Partial<NavigationState>, state?: Record<string, unknown>): CommandTarget => ({ kind: 'go', to, ...state ? { state } : {} })
  const tracker = cardTracker(document)
  const hasCard = tracker.cards.length > 0
  const card = tracker.cards[0]?.name ?? 'the card'
  const accountLabels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const labels = planItemLabels(document, accountLabels)
  const monthName = formatMonth(month)

  const screens: Command[] = [
    { id: 'go:home', group: 'Go to', title: 'Home', keys: 'g h', target: go({ view: 'home' }) },
    { id: 'go:month', group: 'Go to', title: 'Month', meta: monthName, keys: 'g m', target: go({ view: 'month', month }) },
    { id: 'go:plan', group: 'Go to', title: 'Plan', meta: monthName, keys: 'g p', target: go({ view: 'plan', month }) },
    { id: 'go:spending', group: 'Go to', title: 'Spending', keys: 'g s', target: go({ view: 'spending', section: 'sort' }) },
    { id: 'go:transactions', group: 'Go to', title: 'Transactions', meta: 'Spending', target: go({ view: 'spending', section: 'transactions' }) },
    { id: 'go:statements', group: 'Go to', title: 'Statements', meta: 'Spending', target: go({ view: 'spending', section: 'statements' }) },
    { id: 'go:settings', group: 'Go to', title: 'Settings', keys: 'g ,', target: go({ view: 'settings', section: null }) },
    ...SETTINGS.map(([section, label]): Command => ({ id: `go:settings:${section}`, group: 'Go to', title: `Settings · ${label}`, target: go({ view: 'settings', section }) })),
  ]
  const actions: Command[] = [
    { id: 'do:add-item', group: 'Actions', title: 'Add item', meta: `Plan · ${monthName}`, keys: 'n', target: { kind: 'action', action: 'add-item' } },
    { id: 'do:bills-by-date', group: 'Actions', title: 'Bills by date', meta: `Plan · ${monthName}`, target: { kind: 'action', action: 'bills-by-date' } },
    ...hasCard ? [
      { id: 'do:bring-in', group: 'Actions', title: 'Bring in transactions', meta: `The Excel export from ${card}`, keys: 'i', target: { kind: 'action', action: 'bring-in' } } satisfies Command,
      { id: 'do:add-transaction', group: 'Actions', title: 'Add a transaction', meta: 'Spending', target: { kind: 'action', action: 'add-transaction' } } satisfies Command,
    ] : [],
    { id: 'do:previous-month', group: 'Actions', title: 'Previous month', meta: formatMonth(shiftMonth(month, -1)), keys: '[', target: { kind: 'action', action: 'previous-month' } },
    { id: 'do:next-month', group: 'Actions', title: 'Next month', meta: formatMonth(shiftMonth(month, 1)), keys: ']', target: { kind: 'action', action: 'next-month' } },
    { id: 'do:shortcuts', group: 'Actions', title: 'Keyboard shortcuts', keys: '?', target: { kind: 'action', action: 'shortcuts' } },
  ]
  const items: Command[] = resolveBudget(document.budget, month).items.map(item => ({
    id: `item:${item.id}`, group: 'Items', title: item.name,
    meta: `${pounds(item.amountPence)} · ${labels.categoryName(item) ?? 'Uncategorised'} · ${labels.destinationLabel(item)}`,
    target: go({ view: 'plan', month, planDestination: null }, { northPlanItem: item.id }),
  }))
  const pots: Command[] = document.budget.pots.map(pot => ({
    id: `pot:${pot.id}`, group: 'Pots', title: `${pot.name} pot`, meta: accountLabels.get(pot.accountId) ?? 'Account',
    target: go({ view: 'month', month, pot: pot.id, close: false }),
  }))
  const statements: Command[] = statementKeys(tracker).flatMap(key => {
    const summary = statementSummary(document, key, today)
    if (!summary) return []
    return [{ id: `statement:${key}`, group: 'Statements', title: statementName(parseStatementKey(key)?.closeDate ?? summary.closeDate), meta: `${signedPounds(summary.totalPence)} · ${statementStatus(summary).text}`, target: go({ view: 'spending', section: 'statements', statement: key }) } satisfies Command]
  })
  const current = today.slice(0, 7)
  const months: Command[] = Array.from({ length: 9 }, (_, index) => shiftMonth(current, index - 6)).reverse().map(value => ({
    id: `month:${value}`, group: 'Months', title: formatMonth(value), meta: value === current ? 'This month' : value < current ? 'Earlier' : 'Ahead',
    target: go({ view: 'month', month: value, pot: null, close: false }),
  }))
  const transactions: Command[] = allTransactions(tracker).map(row => ({
    id: `transaction:${row.id}`, group: 'Transactions', title: row.description, meta: `${signedPounds(row.amountPence)} · ${dayDate(row.date)}`,
    target: go({ view: 'spending', section: 'transactions' }, { northTransactionSearch: row.description }),
  }))
  return [...screens, ...actions, ...items, ...pots, ...statements, ...months, ...transactions]
}

/** How well `command` matches the query's words: 0 when it doesn't. Word prefixes beat substrings beat initials. */
export function matchScore(command: Command, query: string): number {
  const words = query.trim().toLocaleLowerCase('en-GB').replace(/£/g, '').split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  if (command.group === 'Transactions' && query.trim().length < 3) return 0
  const title = command.title.toLocaleLowerCase('en-GB'), meta = (command.meta ?? '').toLocaleLowerCase('en-GB')
  const titleWords = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const initials = titleWords.map(word => word[0]).join('')
  let score = 0
  for (const word of words) {
    if (titleWords.some(titleWord => titleWord.startsWith(word))) score += title.startsWith(word) ? 4 : 3
    else if (title.includes(word)) score += 2
    else if (meta.includes(word)) score += 1
    else if (words.length === 1 && initials.startsWith(word) && word.length > 1) score += 1.5
    else return 0
  }
  return score / words.length
}

export type CommandSection = { group: CommandGroup; commands: Command[] }

/**
 * The palette's sections for a query: groups ordered by their best match (ties in group order), up to six commands
 * each and thirty in all. An empty query shows Recent (the last commands run, still valid), then Go to and Actions.
 */
export function rankCommands(commands: readonly Command[], query: string, recentIds: readonly string[] = []): CommandSection[] {
  const byId = new Map(commands.map(command => [command.id, command]))
  if (!query.trim()) {
    const recent = recentIds.map(id => byId.get(id)).filter((command): command is Command => !!command).slice(0, 5)
    return [
      ...recent.length ? [{ group: 'Recent' as const, commands: recent }] : [],
      { group: 'Go to' as const, commands: commands.filter(command => command.group === 'Go to' && !recent.includes(command)).slice(0, 7) },
      { group: 'Actions' as const, commands: commands.filter(command => command.group === 'Actions' && !recent.includes(command)).slice(0, 6) },
    ].filter(section => section.commands.length)
  }
  const recency = (command: Command) => { const index = recentIds.indexOf(command.id); return index < 0 ? Infinity : index }
  const scored = commands.map(command => ({ command, score: matchScore(command, query) })).filter(row => row.score > 0)
  const sections = GROUP_ORDER.filter(group => group !== 'Recent').map(group => {
    const rows = scored.filter(row => row.command.group === group).sort((a, b) => b.score - a.score || recency(a.command) - recency(b.command))
    return { group, best: rows[0]?.score ?? 0, commands: rows.slice(0, 6).map(row => row.command) }
  }).filter(section => section.commands.length)
  sections.sort((a, b) => b.best - a.best || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  let room = 30
  return sections.map(section => { const commands = section.commands.slice(0, room); room -= commands.length; return { group: section.group, commands } }).filter(section => section.commands.length)
}

/** Opens ⌘K from a button (the sidebar's Search, the phone's search icon on Home). */
export const OPEN_COMMAND_PALETTE = 'north:command-palette'
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))

const RECENT_KEY = 'north.recentCommands'
export function readRecentCommands(): string[] {
  try { const value: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 5) : [] } catch { return [] }
}
export function rememberCommand(id: string) {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecentCommands().filter(other => other !== id)].slice(0, 5))) } catch { /* A convenience only. */ }
}
