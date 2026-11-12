import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { lastDayOf, localDate, monthOf } from '../domain/cardTracker'
import { monthSpending } from '../domain/cardSpending'
import { closeMonth, closeMonthPlan, moneyArrivesDates, monthStage, type MonthStage } from '../domain/monthStages'
import { budgetDateMarkers, incomeDateMarkers } from '../domain/monthlyBudget'
import { formatMonth } from '../formatting/month'
import { MonthTitle, PageHeader, Section, Sheet, StatusChip, useMobilePresentation } from '../components/ui'
import { BringInSheet } from './BringInSheet'
import { CheckBalancesSheet } from './CheckBalancesSheet'
import { CloseSections } from './CloseMonth'
import { PotDetail } from './SpendingMonth'
import { PotsSection } from './month/PotsSection'
import { destinationNamer } from './cardLabels'
import { closeBlocker, dayOf, pounds, stageLabel } from './spendingFormat'
import { dayDate } from '../formatting/date'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { TransferCalculationNotes } from './TransferCalculationNotes'
import './MonthPage.css'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  onMonthChange: (month: string) => void
  /**
   * The Payday section (PaydaySection), which MonthlyBudget renders so Plan and Month share their state. Month owns
   * whether it shows steps or the Funding by account table, since its ⋯ switches that on phones.
   */
  payday: ((view: { byAccount: boolean; onByAccount: (byAccount: boolean) => void }) => ReactNode) | null
  /** "Plan for this month", from ⋯. */
  onOpenPlan?: () => void
  /** A pot's page, or Close <Month>, in place of the sections. */
  potId?: string | null
  closing?: boolean
  onOpenPot: (potId: string | null) => void
  /** Unused since Close <Month> went inline (audit 3 PR 12); `closing` (close=1) now focuses it. */
  onOpenClose?: (open: boolean) => void
  /** Spending's To sort, from Close <Month> and Pots' empty state. */
  onSort: () => void
  /** Settings › Accounts & pots, from a pot page's ⋯. */
  onOpenPotSettings?: () => void
  /** Today, for pace and the month's stage; tests pass a fixed one. */
  today?: string
}

const chipTone: Record<MonthStage, 'neutral' | 'positive' | 'warning'> = { upcoming: 'neutral', funding: 'neutral', funded: 'positive', 'in-progress': 'positive', closing: 'warning', 'to-settle': 'warning', settled: 'positive' }

/**
 * Month: the month's money in one place, its sections in the order the month's stage needs. In progress: Payday
 * (while steps are left), then Pots. Ended: Close <Month> inline, with its button as the header's primary. A pot's
 * page takes the sections' place.
 */
export function MonthPage({ document, setDocument, month, onMonthChange, payday, onOpenPlan, onOpenPotSettings, potId = null, closing = false, onOpenPot, onSort, today = localDate() }: Props) {
  const [checking, setChecking] = useState(false)
  const [bringingIn, setBringingIn] = useState(false)
  const [message, setMessage] = useState('')
  const [byAccount, setByAccount] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  // A finished payday folds after Pots; opening it keeps it open for this month.
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const mobile = useMobilePresentation()
  // Opening a pot or Close <Month> starts at the top; coming back lands on the pots. The page scrolls the window on
  // phones and its own frame on desktop.
  const frame = useRef<HTMLDivElement>(null), detail = potId ? `pot:${potId}` : null, previous = useRef(detail)
  useLayoutEffect(() => {
    if (previous.current === detail) return
    const wasOpen = previous.current
    previous.current = detail
    if (detail) { window.scrollTo?.({ top: 0 }); frame.current?.scrollTo?.({ top: 0 }) }
    else if (wasOpen) window.document.getElementById('month-pots')?.scrollIntoView?.({ block: 'start' })
  }, [detail])
  // close=1 (Home's "Close October"): bring the Close sections into view and focus them.
  useLayoutEffect(() => {
    if (!closing || potId) return
    const target = window.document.getElementById('month-close')
    target?.scrollIntoView?.({ block: 'start' }); target?.focus({ preventScroll: true })
  }, [closing, potId, month])
  const stage = monthStage(document, month, today)
  const label = formatMonth(month)
  const arrives = moneyArrivesDates(document, month)[0]
  // Before the month starts with nothing ticked, say when its money arrives.
  const chipText = stage.stage === 'upcoming' && arrives ? `Money arrives ${dayDate(arrives)}` : stage.stage === 'closing' ? `Closing · ended ${dayDate(lastDayOf(month))}` : stageLabel(stage, monthSpending(document, month, today))
  // An ended month: Close <Month> is the header's primary, disabled with a reason while anything is waiting.
  const closePlan = stage.stage === 'closing' || stage.closedAt ? closeMonthPlan(document, month, today) : null
  const name = label.split(' ')[0]
  const blocker = closePlan && stage.stage === 'closing' ? closeBlocker(closePlan, month, today) : null
  const close = () => setDocument(current => closeMonth(current, month, today, new Date()))
  const changed = closePlan && stage.closedAt ? closePlan.changedSinceClosed : []
  const destination = destinationNamer(document)
  const header = <PageHeader titleText="Month" monthLabel={label}
    title={<MonthTitle month={month} onChange={onMonthChange} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/>}
    chip={<StatusChip tone={chipTone[stage.stage]} dot={stage.stage === 'in-progress'}>{chipText}</StatusChip>}
    actions={<>
      {!mobile && <button type="button" className="secondary-button" onClick={() => setChecking(true)}>Check balances</button>}
      {changed.length > 0 && <button type="button" className="secondary-button" onClick={close}>Close again</button>}
      <BudgetOptionsMenu label="More Month options" options={[
        // Phones keep the header to the ⋯: Check balances moves into it.
        ...mobile ? [{ label: 'Check balances', onSelect: () => setChecking(true) }] : [],
        ...mobile && payday ? [{ label: byAccount ? 'Payday steps' : 'Funding by account', onSelect: () => setByAccount(value => !value) }] : [],
        { label: 'How funding is worked out', onSelect: () => setNotesOpen(true) },
        ...onOpenPlan ? [{ label: 'Plan for this month', onSelect: onOpenPlan }] : [],
      ]}/>
      {closePlan && stage.stage === 'closing' && <button type="button" className="primary-button" disabled={!!blocker} title={blocker ?? undefined} onClick={close}>Close {name}</button>}
    </>}/>
  // Payday leads while there's money to move (or the month hasn't started); once every step is ticked it folds after Pots.
  const funding = stage.funding
  const ticked = Object.values(document.ticks?.[month] ?? {}).map(tick => tick.at).sort().at(-1)
  const folded = !!payday && funding.total > 0 && funding.done === funding.total && month <= monthOf(today) && expandedMonth !== month
  const paydaySection = payday?.({ byAccount, onByAccount: setByAccount })
  const pots = <PotsSection document={document} month={month} today={today} onOpenPot={onOpenPot} onOpenSpending={onSort}/>
  const paydayFolded = <Section title="Payday" id="month-payday" collapsed={{ summary: `${funding.done} of ${funding.total} done${ticked ? ` · last ticked ${dayOf(ticked)}` : ''}`, onExpand: () => setExpandedMonth(month) }}/>
  const closeSections = closePlan && <CloseSections document={document} setDocument={setDocument} month={month} today={today} onSort={onSort} onBringIn={() => setBringingIn(true)}/>
  if (potId) return <div ref={frame} className="page-frame monthly-budget-page month-page is-pot">
    <PotDetail document={document} setDocument={setDocument} potId={potId} month={month} today={today} onBack={() => onOpenPot(null)} onOpenSettings={onOpenPotSettings}/>
  </div>
  return <div ref={frame} className="page-frame monthly-budget-page budget-view-transfers month-page">
    {header}
    {message && <p className="budget-manage-message month-message" role="status">{message}</p>}
    {blocker && <p className="month-close-blocker">{blocker}</p>}
    {changed.length > 0 && <p className="month-changed">Changed since closed: {changed.map(row => `${destination(row.destination)} ${pounds(row.closedPence)} → ${pounds(row.nowPence)}`).join(', ')}.</p>}
    {closeSections ? <>
        {closeSections}
        {pots}
        {payday && (folded ? paydayFolded : paydaySection)}
      </>
      : folded ? <>
        {pots}
        {paydayFolded}
      </> : <>
        {paydaySection}
        {pots}
      </>}
    {notesOpen && <Sheet title="How funding is worked out" onClose={() => setNotesOpen(false)} footer={<button type="button" className="primary-button" onClick={() => setNotesOpen(false)}>Done</button>}>
      <TransferCalculationNotes/>
    </Sheet>}
    {checking && <CheckBalancesSheet document={document} setDocument={setDocument} onClose={() => setChecking(false)} onSaved={text => { setChecking(false); setMessage(text) }}/>}
    {bringingIn && <BringInSheet document={document} setDocument={setDocument} onClose={() => setBringingIn(false)} onSort={() => { setBringingIn(false); onSort() }}/>}
  </div>
}
