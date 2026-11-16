import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { EmptyState, Meter, Section, useMobilePresentation } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { monthSpending, needsALook, type DestinationSpending, type MonthSpending } from '../../domain/cardSpending'
import { cardTracker, closeDateFor, destinationKey, shiftMonth, statementKey, type PotKind } from '../../domain/cardTracker'
import { billSum, type BillSum } from '../../domain/billSum'
import { resolveBudget, type BudgetDestination } from '../../domain/monthlyBudget'
import { potBalance } from '../../domain/potBalances'
import { POT_KIND_LABELS, potKind } from '../../domain/potKinds'
import { setAsideCheck } from '../../domain/setAsideCheck'
import { formatMonth } from '../../formatting/month'
import { destinationNamer } from '../cardLabels'
import { billName, dayOf, pounds, signedPounds } from '../spendingFormat'
import { FreshnessLine } from '../Freshness'
import type { OpenTransactions } from '../SpendingMonth'
import { paceStatus } from '../../formatting/paceLabels'
import { NeedsALook } from './NeedsALook'
import './PotsSection.css'
import { useListNavigation } from '../../state/useListNavigation'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** One row of the table: a pot (or an account's one-offs), the set-aside pot, or a pot with nothing spent. */
type PotRow = {
  key: string
  potId?: string
  /** An account's one-offs: opens Spending › Transactions filtered to it (F1). */
  accountKey?: string
  name: string
  /** "one-offs": a pot's kind is its group's heading. */
  kind?: string
  /** The phone row's figure when it isn't Left: "£1,135.42 moved in". */
  figure?: string
  spent?: string
  planned?: string
  left?: string
  /** The pace cell: a meter (paced monthly pots) and a status line. */
  meter?: { value: number; max: number; pace?: number; tone: 'neutral' | 'warning' | 'critical' }
  status: string
  tone?: 'warning' | 'critical'
  inBank?: string
}

/** "Monzo", from the pot's account. */
function bankOf(document: BudgetDocument, potId: string) {
  const pot = document.budget.pots.find(row => row.id === potId)
  return document.budget.accounts.find(account => account.id === pot?.accountId)?.provider?.trim() || 'the bank'
}

/** A spending row in words and figures. */
function spendingRow(document: BudgetDocument, row: DestinationSpending, figures: MonthSpending, name: (destination: BudgetDestination) => string): PotRow {
  const potId = row.destination.kind === 'pot' ? row.destination.potId : undefined
  // A person's own pots are named with their account, since Ada's and Ben's Spending sit in one group.
  const potName = potId ? row.group === 'joint' ? document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot' : name(row.destination) : `${name(row.destination)}`
  const balance = potId ? potBalance(document, potId, figures.today) : undefined
  const inBank = balance?.balancePence !== undefined ? signedPounds(balance.balancePence) : '—'
  const taken = row.takenPence ? ` · ${pounds(row.takenPence)} taken by ${monthName(shiftMonth(figures.month, -1))}` : ''
  // Bills still to come this month: part of Left (recurring-bills-rules › Due).
  const due = row.duePence > 0 ? ` · ${pounds(row.duePence)} of it due` : ''
  const base = { key: row.key, potId, name: potName, spent: signedPounds(row.spentPence), inBank }
  if (row.status === 'one-offs') return { ...base, ...row.destination.kind === 'account' ? { accountKey: destinationKey(row.destination) } : {}, kind: row.destination.kind === 'account' ? 'one-offs' : undefined, planned: '—', left: '—', status: row.destination.kind === 'account' ? 'Spent straight from the account' : 'Nothing planned', inBank: row.destination.kind === 'account' ? '' : inBank }
  // Funded only (D3): what was moved in, then what went on the Amex. No Left, no pace.
  if (row.kind === 'funded-only') return { ...base, planned: pounds(row.plannedPence), left: '—', figure: `${pounds(row.plannedPence)} moved in`, status: row.spentPence ? `${pounds(row.spentPence)} on the Amex` : 'Nothing on the Amex' }
  if (row.kind === 'saving') return { ...base, planned: row.plannedPence ? pounds(row.plannedPence) : '—', left: '—', ...row.plannedPence ? { figure: `${pounds(row.plannedPence)} put by` } : {}, status: row.spentPence ? `${pounds(row.spentPence)} spent from it` : 'Nothing spent' }
  if (row.carriesOver) {
    const spare = balance?.freePence
    const dueText = row.duePence > 0 ? `${pounds(row.duePence)} due this month` : ''
    return { ...base, planned: '—', left: spare === undefined ? '—' : `${signedPounds(spare)} spare`, status: spare === undefined ? ['Check the balance to see what’s spare', dueText].filter(Boolean).join(' · ') : dueText || 'No pace' }
  }
  const paced = row.pace === 'steady' && row.plannedPence > 0
  const meter = paced ? { value: row.spentPence + row.takenPence, max: row.plannedPence, ...figures.when === 'current' && row.expectedPence !== undefined ? { pace: row.expectedPence / row.plannedPence } : {}, tone: row.status === 'over' ? 'critical' as const : row.status === 'ahead' ? 'warning' as const : 'neutral' as const } : undefined
  const status = row.status === 'over' || row.status === 'ahead' || row.status === 'on-track' ? `${paceStatus(row, figures)}${taken}${due}` : paced ? `${figures.when === 'past' ? 'Ended' : 'Not started'}${taken}${due}` : due ? `${due.slice(3)}${taken}` : `No pace${taken}`
  return { ...base, planned: pounds(row.plannedPence), left: row.leftPence < 0 ? `−${pounds(-row.leftPence)}` : pounds(row.leftPence), meter, status, ...row.status === 'over' ? { tone: 'critical' as const } : row.status === 'ahead' ? { tone: 'warning' as const } : {} }
}

/**
 * Month › Pots: planned against spent for each pot, grouped by kind (Tracked, Funded only, Saving, Carries over), then the Amex pot and accounts' one-offs.
 * Desktop: one table with aligned figures and a pace column. Phones: a card per group, three lines a pot.
 */
export function PotsSection({ document, month, today, onOpenPot, onOpenSpending, onOpenTransactions, title = 'Pots' }: { document: BudgetDocument; month: string; today: string; onOpenPot: (potId: string) => void; onOpenSpending?: () => void; onOpenTransactions?: OpenTransactions; title?: string }) {
  const mobile = useMobilePresentation()
  const potKeys = useListNavigation({ label: 'Pots', keys: { enter: 'Open the pot' } })
  const [showAll, setShowAll] = useState(false)
  const figures = monthSpending(document, month, today)
  // Pots over or ahead of pace lead (F3). On phones they leave their groups; desktop's table keeps every pot.
  const look = needsALook(document, figures)
  const lookPots = new Set(mobile ? look.flatMap(({ row }) => row.destination.kind === 'pot' ? [row.destination.potId] : []) : [])
  const name = destinationNamer(document)
  const tracker = cardTracker(document)
  const setAsideCard = tracker.cards.find(card => card.setAside)
  const setAsidePot = document.budget.pots.find(pot => pot.id === setAsideCard?.setAside?.potId)
  const ownerGroup = (potId: string) => { const owners = document.budget.accounts.find(account => account.id === document.budget.pots.find(pot => pot.id === potId)?.accountId)?.ownerPersonIds ?? []; return owners.length === 1 ? owners[0]! : 'joint' }
  const shownPots = new Set(figures.rows.flatMap(row => row.destination.kind === 'pot' ? [row.destination.potId] : []))
  // Pots with nothing spent and no pace stay out until asked for.
  const items = resolveBudget(document.budget, month).items
  const plannedFor = (potId: string) => items.filter(item => item.destination.kind === 'pot' && item.destination.potId === potId).reduce((sum, item) => sum + item.amountPence, 0)
  const quiet = document.budget.pots.filter(pot => !shownPots.has(pot.id) && pot.id !== setAsidePot?.id)
  const quietRow = (potId: string): PotRow => {
    const planned = plannedFor(potId), balance = potBalance(document, potId, today).balancePence, kind = potKind(document, potId) ?? 'tracked'
    const noLeft = kind === 'funded-only' || kind === 'saving'
    return { key: `quiet:${potId}`, potId, name: ownerGroup(potId) === 'joint' ? document.budget.pots.find(pot => pot.id === potId)!.name : name({ kind: 'pot', potId }), spent: pounds(0), planned: planned ? pounds(planned) : '—', left: planned && !noLeft ? pounds(planned) : '—', status: 'Nothing spent', inBank: balance === undefined ? '—' : signedPounds(balance) }
  }
  const setAsideRow = (): PotRow | null => {
    if (!setAsideCard || !setAsidePot) return null
    // The bill closing this month (D1): what's still to move or sort for it, by name.
    const bill = billSum(document, statementKey(setAsideCard.id, closeDateFor(`${month}-01`, setAsideCard.closeDay)), today)
    const balance = potBalance(document, setAsidePot.id, today).balancePence
    // Checking the Amex pot: extra or short takes over the status, since it's what needs doing.
    const check = setAsideCheck(document, setAsideCard.id, today)
    const gap = check?.state === 'extra' ? `${pounds(check.gapPence!)} extra` : check?.state === 'short' ? `${pounds(-check.gapPence!)} short` : ''
    return { key: `set-aside:${setAsidePot.id}`, potId: setAsidePot.id, name: setAsidePot.name, spent: '—', planned: '—', left: '—', ...check ? { figure: `${signedPounds(check.holdsPence ?? check.shouldHoldPence)} in the pot` } : {}, status: gap || (bill ? billStatus(bill) : 'Nothing to move'), inBank: balance === undefined ? '—' : signedPounds(balance), ...gap ? { tone: 'warning' as const } : {} }
  }
  // One group per kind (D3), each ordered Joint first, then each person's pots. The Amex pot and an account's one-offs sit apart.
  const kindOf = (potId: string): PotKind => potKind(document, potId) ?? 'tracked'
  const groupKeyOf = (row: DestinationSpending) => row.destination.kind === 'account' ? 'accounts' : row.kind ?? 'tracked'
  const groups = [
    ...(['tracked', 'funded-only', 'saving', 'carries-over'] as const).map(kind => ({ key: kind as string, label: POT_KIND_LABELS[kind] })),
    { key: 'set-aside', label: 'Amex pot' },
    { key: 'accounts', label: 'Accounts' },
  ].map(group => {
    const rows = figures.rows.filter(row => groupKeyOf(row) === group.key && !(row.destination.kind === 'pot' && lookPots.has(row.destination.potId))).map(row => spendingRow(document, row, figures, name))
    const extra = setAsidePot && group.key === 'set-aside' ? setAsideRow() : null
    const hidden = showAll ? quiet.filter(pot => kindOf(pot.id) === group.key).map(pot => quietRow(pot.id)) : []
    return { ...group, rows: [...rows, ...extra ? [extra] : [], ...hidden] }
  }).filter(group => group.rows.length)
  const checks = document.budget.pots.map(pot => tracker.pots[pot.id]?.checkedBalance?.at).filter((at): at is string => !!at).sort()
  const bank = document.budget.pots[0] ? bankOf(document, document.budget.pots[0].id) : 'the bank'
  const checked = checks.length ? `Checked against ${bank} ${dayOf(checks[0]!)}` : 'Not checked yet'
  // How far pace can see (F2), before the balance check; not for a month that hasn't started.
  const aside = figures.when === 'future' ? checked : <><FreshnessLine document={document} onSort={onOpenSpending}/>{tracker.cards.length > 0 && ' · '}{checked}</>
  const count = figures.plannedPence ? `${pounds(figures.spentPence)} spent of ${pounds(figures.plannedPence)}` : figures.spentPence ? `${pounds(figures.spentPence)} spent · nothing planned` : undefined
  const opens = (row: PotRow) => !!row.potId || !!(row.accountKey && onOpenTransactions)
  const open = (row: PotRow) => { if (row.potId) onOpenPot(row.potId); else if (row.accountKey) onOpenTransactions?.({ destinationKey: row.accountKey }) }
  const label = (row: PotRow) => `${row.name}${row.kind ? ` · ${row.kind}` : ''}`
  /** A row's button name: the pot and its figures, or where an account's one-offs open. */
  const rowLabel = (row: PotRow, figure: string) => row.potId ? `${label(row)}: ${figure}. ${row.status}` : `See ${row.name} one-offs in Spending`
  const pace = (row: PotRow) => <>{row.meter && <Meter label={`${row.name}: ${row.spent} of ${row.planned}`} value={row.meter.value} max={row.meter.max} pace={row.meter.pace} tone={row.meter.tone}/>}<span className={`pots-status${row.tone ? ` is-${row.tone}` : ''}`}>{row.status}</span></>
  const more = !showAll && quiet.length > 0 && <button type="button" className="text-button pots-more" onClick={() => setShowAll(true)}>{quiet.length} more {quiet.length === 1 ? 'pot' : 'pots'} with nothing spent<ChevronRight aria-hidden="true"/></button>

  return <Section title={title} id="month-pots" count={count} aside={!mobile ? aside : undefined}>
    {!groups.length && !quiet.length && !look.length ? <EmptyState title="No pot spending yet" action={onOpenSpending && <button type="button" className="secondary-button" onClick={onOpenSpending}>Open Spending</button>}>Bring in Amex transactions to see each pot against the plan.</EmptyState>
      : mobile ? <div className="pots-cards" {...potKeys.listProps}>{potKeys.hint}
        <NeedsALook document={document} items={look} figures={figures} mobile onOpenPot={onOpenPot}/>
        {groups.map(group => <section key={group.key} className="pots-card" aria-label={group.label}>
          <h3 className="pots-card-title">{group.label}</h3>
          <ul>{group.rows.map(row => <li key={row.key}>{opens(row)
            ? <button type="button" className="pots-card-row" data-list-row onClick={() => open(row)} aria-label={rowLabel(row, cardFigure(row))}>{cardBody(row, pace)}</button>
            : <div className="pots-card-row">{cardBody(row, pace)}</div>}</li>)}</ul>
        </section>)}
        {more}
      </div>
      : <><NeedsALook document={document} items={look} figures={figures} mobile={false} onOpenPot={onOpenPot}/><div className="pots-table-wrap" {...potKeys.listProps}>{potKeys.hint}<table className="pots-table">
        <caption className="visually-hidden">Pots in {formatMonth(month)}: spent, planned, left, pace and balance</caption>
        <thead><tr><th scope="col">Pot</th><th scope="col" className="is-num">Spent</th><th scope="col" className="is-num">Planned</th><th scope="col" className="is-num">Left</th><th scope="col" className="pots-pace">Pace</th><th scope="col" className="is-num">In {bank}</th></tr></thead>
        {groups.map(group => <tbody key={group.key}>
          <tr className="pots-band"><th scope="rowgroup" colSpan={6}>{group.label}</th></tr>
          {/* The name is the row's button (Tab, Enter); a click anywhere on the row opens it too. */}
          {group.rows.map(row => <tr key={row.key} className={opens(row) ? 'is-link' : undefined} {...opens(row) ? { 'data-list-row': '' } : {}} onClick={event => { if (!(event.target as HTMLElement).closest('button')) open(row) }}>
            <th scope="row">{opens(row) ? <button type="button" className="pots-name" data-list-open onClick={() => open(row)} aria-label={rowLabel(row, `${row.spent} spent${row.planned && row.planned !== '—' ? ` of ${row.planned}` : ''}`)}>{row.name}</button> : <span className="pots-name">{row.name}</span>}{row.kind && <span className="pots-kind"> · {row.kind}</span>}</th>
            <td className="is-num">{row.spent}</td><td className="is-num">{row.planned}</td><td className="is-num">{row.left}</td>
            <td className="pots-pace">{pace(row)}</td><td className="is-num">{row.inBank}</td>
          </tr>)}
        </tbody>)}
      </table>{more}</div></>}
  </Section>
}

/** The Amex row's status (D1, D11): "November bill · £402.00 to move · £24.00 to sort · £79.00 expecting back", "… · covered" or "… · all in the pot". */
function billStatus(bill: BillSum): string {
  const name = billName(bill.closeDate, bill.open)
  if (bill.paid) return `${name} · paid`
  if (bill.covered) return `${name} · covered`
  const parts = [bill.toMovePence ? `${pounds(bill.toMovePence)} to move` : '', bill.toSort ? `${pounds(bill.toSortPence)} to sort` : '', bill.expectingBackPence ? `${pounds(bill.expectingBackPence)} expecting back` : ''].filter(Boolean)
  return `${name} · ${parts.length ? parts.join(' · ') : 'all in the pot'}`
}

/** A phone row's figure: "£143.57 left", "£1,134.01 spare", "£112.81 spent" or the balance. */
const cardFigure = (row: PotRow) => row.figure ?? (row.left?.startsWith('−') ? `${row.left.slice(1)} over` : row.left && row.left !== '—' ? `${row.left}${row.left.endsWith('spare') ? '' : ' left'}` : row.spent && row.spent !== '—' ? `${row.spent} spent` : row.inBank && row.inBank !== '—' ? `${row.inBank} in the pot` : '')

/** A phone row: name and what's left, the meter, then the status in words. */
function cardBody(row: PotRow, pace: (row: PotRow) => ReactNode) {
  return <>
    <span className="pots-card-top"><span className="pots-name">{row.name}{row.kind && <span className="pots-kind"> · {row.kind}</span>}</span><span className="pots-card-figure">{cardFigure(row)}</span></span>
    <span className="pots-card-pace">{pace(row)}</span>
  </>
}
