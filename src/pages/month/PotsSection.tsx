import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { EmptyState, Meter, Section, useMobilePresentation } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { monthSpending, type DestinationSpending, type MonthSpending } from '../../domain/cardSpending'
import { cardTracker, shiftMonth } from '../../domain/cardTracker'
import { resolveBudget, type BudgetDestination } from '../../domain/monthlyBudget'
import { potBalance, setAsideStatements } from '../../domain/potBalances'
import { dayDate } from '../../formatting/date'
import { formatGBPWhole } from '../../formatting/money'
import { formatMonth } from '../../formatting/month'
import { destinationNamer } from '../cardLabels'
import { dayOf, pounds, signedPounds } from '../spendingFormat'
import './PotsSection.css'
import { useListNavigation } from '../../state/useListNavigation'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const whole = (pence: number) => formatGBPWhole(Math.round(pence / 100))

/** One row of the table: a pot (or an account's one-offs), the set-aside pot, or a pot with nothing spent. */
type PotRow = {
  key: string
  potId?: string
  name: string
  /** "carries over", "set aside", "one-offs". */
  kind?: string
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
  const potName = potId ? document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot' : `${name(row.destination)}`
  const balance = potId ? potBalance(document, potId, figures.today) : undefined
  const inBank = balance?.balancePence !== undefined ? signedPounds(balance.balancePence) : '—'
  const taken = row.takenPence ? ` · ${pounds(row.takenPence)} taken by ${monthName(shiftMonth(figures.month, -1))}` : ''
  // Bills still to come this month: part of Left (recurring-bills-rules › Due).
  const due = row.duePence > 0 ? ` · ${pounds(row.duePence)} of it due` : ''
  const base = { key: row.key, potId, name: potName, spent: signedPounds(row.spentPence), inBank }
  if (row.status === 'one-offs') return { ...base, kind: row.destination.kind === 'account' ? 'one-offs' : undefined, planned: '—', left: '—', status: row.destination.kind === 'account' ? 'Spent straight from the account' : 'Nothing planned', inBank: row.destination.kind === 'account' ? '' : inBank }
  if (row.carriesOver) {
    const free = balance?.freePence
    const dueText = row.duePence > 0 ? `${pounds(row.duePence)} due this month` : ''
    return { ...base, kind: 'carries over', planned: '—', left: free === undefined ? '—' : `${signedPounds(free)} free`, status: free === undefined ? ['Check the balance to see what’s free', dueText].filter(Boolean).join(' · ') : dueText || 'No pace' }
  }
  const paced = row.pace === 'steady' && row.plannedPence > 0
  const meter = paced ? { value: row.spentPence + row.takenPence, max: row.plannedPence, ...figures.when === 'current' && row.expectedPence !== undefined ? { pace: row.expectedPence / row.plannedPence } : {}, tone: row.status === 'over' ? 'critical' as const : row.status === 'ahead' ? 'warning' as const : 'neutral' as const } : undefined
  const status = row.status === 'over' ? `${pounds(-row.leftPence)} over${figures.when === 'current' ? ` · covered when ${monthName(figures.month)} closes` : ''}${taken}${due}`
    : row.status === 'ahead' ? `${whole(row.aheadPence!)} ahead${row.runsOut ? ` · runs out ~${dayDate(row.runsOut)}` : ''}${taken}${due}`
    : row.status === 'on-track' ? `On track${taken}${due}` : paced ? `${figures.when === 'past' ? 'Ended' : 'Not started'}${taken}${due}` : due ? `${due.slice(3)}${taken}` : `No pace${taken}`
  return { ...base, planned: pounds(row.plannedPence), left: row.leftPence < 0 ? `−${pounds(-row.leftPence)}` : pounds(row.leftPence), meter, status, ...row.status === 'over' ? { tone: 'critical' as const } : row.status === 'ahead' ? { tone: 'warning' as const } : {} }
}

/**
 * Month › Pots: planned against spent for each pot, grouped like Plan (Joint, each adult, then accounts' one-offs).
 * Desktop: one table with aligned figures and a pace column. Phones: a card per group, three lines a pot.
 */
export function PotsSection({ document, month, today, onOpenPot, onOpenSpending, title = 'Pots' }: { document: BudgetDocument; month: string; today: string; onOpenPot: (potId: string) => void; onOpenSpending?: () => void; title?: string }) {
  const mobile = useMobilePresentation()
  const potKeys = useListNavigation({ label: 'Pots', keys: { enter: 'Open the pot' } })
  const [showAll, setShowAll] = useState(false)
  const figures = monthSpending(document, month, today)
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
  const quietRow = (potId: string): PotRow => { const planned = plannedFor(potId), balance = potBalance(document, potId, today).balancePence; return { key: `quiet:${potId}`, potId, name: document.budget.pots.find(pot => pot.id === potId)!.name, spent: pounds(0), planned: planned ? pounds(planned) : '—', left: planned ? pounds(planned) : '—', status: 'Nothing spent', inBank: balance === undefined ? '—' : signedPounds(balance) } }
  const setAsideRow = (): PotRow | null => {
    if (!setAsideCard || !setAsidePot) return null
    const statement = setAsideStatements(document, setAsideCard.id).find(row => row.closeDate.slice(0, 7) === month)
    const balance = potBalance(document, setAsidePot.id, today).balancePence
    return { key: `set-aside:${setAsidePot.id}`, potId: setAsidePot.id, name: setAsidePot.name, kind: 'set aside', spent: '—', planned: '—', left: '—', status: statement?.toMovePence ? `${pounds(statement.toMovePence)} still to move for ${monthName(month)}` : statement ? 'All moved in' : 'Nothing to move', inBank: balance === undefined ? '—' : signedPounds(balance) }
  }
  const groups = [
    { key: 'joint', label: 'Joint' },
    ...document.household.adults.map(person => ({ key: person.id, label: person.name })),
    { key: 'accounts', label: 'Accounts' },
  ].map(group => {
    const rows = figures.rows.filter(row => row.group === group.key).map(row => spendingRow(document, row, figures, name))
    const extra = setAsidePot && ownerGroup(setAsidePot.id) === group.key ? setAsideRow() : null
    const hidden = showAll ? quiet.filter(pot => ownerGroup(pot.id) === group.key).map(pot => quietRow(pot.id)) : []
    return { ...group, rows: [...rows, ...extra ? [extra] : [], ...hidden] }
  }).filter(group => group.rows.length)
  const checks = document.budget.pots.map(pot => tracker.pots[pot.id]?.checkedBalance?.at).filter((at): at is string => !!at).sort()
  const bank = document.budget.pots[0] ? bankOf(document, document.budget.pots[0].id) : 'the bank'
  const aside = checks.length ? `Checked against ${bank} ${dayOf(checks[0]!)}` : 'Not checked yet'
  const count = figures.plannedPence ? `${pounds(figures.spentPence)} spent of ${pounds(figures.plannedPence)}` : figures.spentPence ? `${pounds(figures.spentPence)} spent · nothing planned` : undefined
  const open = (row: PotRow) => { if (row.potId) onOpenPot(row.potId) }
  const label = (row: PotRow) => `${row.name}${row.kind ? ` · ${row.kind}` : ''}`
  const pace = (row: PotRow) => <>{row.meter && <Meter label={`${row.name}: ${row.spent} of ${row.planned}`} value={row.meter.value} max={row.meter.max} pace={row.meter.pace} tone={row.meter.tone}/>}<span className={`pots-status${row.tone ? ` is-${row.tone}` : ''}`}>{row.status}</span></>
  const more = !showAll && quiet.length > 0 && <button type="button" className="text-button pots-more" onClick={() => setShowAll(true)}>{quiet.length} more {quiet.length === 1 ? 'pot' : 'pots'} with nothing spent<ChevronRight aria-hidden="true"/></button>

  return <Section title={title} id="month-pots" count={count} aside={!mobile ? aside : undefined}>
    {!groups.length && !quiet.length ? <EmptyState title="No pot spending yet" action={onOpenSpending && <button type="button" className="secondary-button" onClick={onOpenSpending}>Open Spending</button>}>Bring in Amex transactions to see each pot against the plan.</EmptyState>
      : mobile ? <div className="pots-cards" {...potKeys.listProps}>{potKeys.hint}
        {groups.map(group => <section key={group.key} className="pots-card" aria-label={group.label}>
          <h3 className="pots-card-title">{group.label}</h3>
          <ul>{group.rows.map(row => <li key={row.key}>{row.potId
            ? <button type="button" className="pots-card-row" data-list-row onClick={() => open(row)} aria-label={`${label(row)}: ${cardFigure(row)}. ${row.status}`}>{cardBody(row, pace)}</button>
            : <div className="pots-card-row">{cardBody(row, pace)}</div>}</li>)}</ul>
        </section>)}
        {more}
      </div>
      : <div className="pots-table-wrap" {...potKeys.listProps}>{potKeys.hint}<table className="pots-table">
        <caption className="visually-hidden">Pots in {formatMonth(month)}: spent, planned, left, pace and balance</caption>
        <thead><tr><th scope="col">Pot</th><th scope="col" className="is-num">Spent</th><th scope="col" className="is-num">Planned</th><th scope="col" className="is-num">Left</th><th scope="col" className="pots-pace">Pace</th><th scope="col" className="is-num">In {bank}</th></tr></thead>
        {groups.map(group => <tbody key={group.key}>
          <tr className="pots-band"><th scope="rowgroup" colSpan={6}>{group.label}</th></tr>
          {/* The name is the row's button (Tab, Enter); a click anywhere on the row opens it too. */}
          {group.rows.map(row => <tr key={row.key} className={row.potId ? 'is-link' : undefined} {...row.potId ? { 'data-list-row': '' } : {}} onClick={event => { if (!(event.target as HTMLElement).closest('button')) open(row) }}>
            <th scope="row">{row.potId ? <button type="button" className="pots-name" data-list-open onClick={() => open(row)} aria-label={`${label(row)}: ${row.spent} spent${row.planned && row.planned !== '—' ? ` of ${row.planned}` : ''}. ${row.status}`}>{row.name}</button> : <span className="pots-name">{row.name}</span>}{row.kind && <span className="pots-kind"> · {row.kind}</span>}</th>
            <td className="is-num">{row.spent}</td><td className="is-num">{row.planned}</td><td className="is-num">{row.left}</td>
            <td className="pots-pace">{pace(row)}</td><td className="is-num">{row.inBank}</td>
          </tr>)}
        </tbody>)}
      </table>{more}</div>}
  </Section>
}

/** A phone row's figure: "£143.57 left", "£1,134.01 free", "£112.81 spent" or the balance. */
const cardFigure = (row: PotRow) => row.left?.startsWith('−') ? `${row.left.slice(1)} over` : row.left && row.left !== '—' ? `${row.left}${row.left.endsWith('free') ? '' : ' left'}` : row.spent && row.spent !== '—' ? `${row.spent} spent` : row.inBank && row.inBank !== '—' ? `${row.inBank} in the pot` : ''

/** A phone row: name and what's left, the meter, then the status in words. */
function cardBody(row: PotRow, pace: (row: PotRow) => ReactNode) {
  return <>
    <span className="pots-card-top"><span className="pots-name">{row.name}{row.kind && <span className="pots-kind"> · {row.kind}</span>}</span><span className="pots-card-figure">{cardFigure(row)}</span></span>
    <span className="pots-card-pace">{pace(row)}</span>
  </>
}
