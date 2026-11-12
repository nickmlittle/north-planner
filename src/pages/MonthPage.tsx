import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { lastDayOf, localDate, monthOf } from '../domain/cardTracker'
import { monthSpending } from '../domain/cardSpending'
import { moneyArrivesDates, monthStage, type MonthStage } from '../domain/monthStages'
import { budgetDateMarkers, incomeDateMarkers } from '../domain/monthlyBudget'
import { formatMonth } from '../formatting/month'
import { MonthTitle, PageHeader, Section, Sheet, StatusChip, useMobilePresentation } from '../components/ui'
import { BringInSheet } from './BringInSheet'
import { CheckBalancesSheet } from './CheckBalancesSheet'
import { CloseMonth } from './CloseMonth'
import { PotDetail, ThisMonthPanel } from './SpendingMonth'
import { dayOf, stageLabel } from './spendingFormat'
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
  onOpenClose: (open: boolean) => void
  /** Spending's To sort, from Close <Month>. */
  onSort: () => void
  /** Today, for pace and the month's stage; tests pass a fixed one. */
  today?: string
}

const chipTone: Record<MonthStage, 'neutral' | 'positive' | 'warning'> = { upcoming: 'neutral', funding: 'neutral', funded: 'positive', 'in-progress': 'positive', closing: 'warning', 'to-settle': 'warning', settled: 'positive' }

/**
 * Month: the month's money in one place. Payday (the steps, was Transfers), then Pots (was Spending › This month),
 * with a pot's page and Close <Month> in their place. An interim composition of today's panels (audit 3 PR 06);
 * PRs 11 and 12 redesign it.
 */
export function MonthPage({ document, setDocument, month, onMonthChange, payday, onOpenPlan, potId = null, closing = false, onOpenPot, onOpenClose, onSort, today = localDate() }: Props) {
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
  const frame = useRef<HTMLDivElement>(null), detail = potId ? `pot:${potId}` : closing ? 'close' : null, previous = useRef(detail)
  useLayoutEffect(() => {
    if (previous.current === detail) return
    const wasOpen = previous.current
    previous.current = detail
    if (detail) { window.scrollTo?.({ top: 0 }); frame.current?.scrollTo?.({ top: 0 }) }
    else if (wasOpen) window.document.getElementById('month-pots')?.scrollIntoView?.({ block: 'start' })
  }, [detail])
  const stage = monthStage(document, month, today)
  const label = formatMonth(month)
  const arrives = moneyArrivesDates(document, month)[0]
  // Before the month starts with nothing ticked, say when its money arrives.
  const chipText = stage.stage === 'upcoming' && arrives ? `Money arrives ${dayDate(arrives)}` : stage.stage === 'closing' ? `Closing · ended ${dayDate(lastDayOf(month))}` : stageLabel(stage, monthSpending(document, month, today))
  const header = <PageHeader titleText="Month" monthLabel={label}
    title={<MonthTitle month={month} onChange={onMonthChange} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/>}
    chip={<StatusChip tone={chipTone[stage.stage]} dot={stage.stage === 'in-progress'}>{chipText}</StatusChip>}
    actions={<>
      {!mobile && <button type="button" className="secondary-button" onClick={() => setChecking(true)}>Check balances</button>}
      <BudgetOptionsMenu label="More Month options" options={[
        // Phones keep the header to the ⋯: Check balances moves into it.
        ...mobile ? [{ label: 'Check balances', onSelect: () => setChecking(true) }] : [],
        ...mobile && payday ? [{ label: byAccount ? 'Payday steps' : 'Funding by account', onSelect: () => setByAccount(value => !value) }] : [],
        { label: 'How funding is worked out', onSelect: () => setNotesOpen(true) },
        ...onOpenPlan ? [{ label: 'Plan for this month', onSelect: onOpenPlan }] : [],
      ]}/>
    </>}/>
  // Payday leads while there's money to move (or the month hasn't started); once every step is ticked it folds after Pots.
  const funding = stage.funding
  const ticked = Object.values(document.ticks?.[month] ?? {}).map(tick => tick.at).sort().at(-1)
  const folded = !!payday && funding.total > 0 && funding.done === funding.total && month <= monthOf(today) && expandedMonth !== month
  const paydaySection = payday?.({ byAccount, onByAccount: setByAccount })
  const pots = <Section title="Pots" id="month-pots"><ThisMonthPanel document={document} month={month} today={today} onOpenPot={onOpenPot} onOpenClose={() => onOpenClose(true)}/></Section>
  return <div ref={frame} className="page-frame monthly-budget-page budget-view-transfers month-page">
    {header}
    {message && <p className="budget-manage-message month-message" role="status">{message}</p>}
    {closing ? <CloseMonth document={document} setDocument={setDocument} month={month} today={today} onBack={() => onOpenClose(false)} onSort={onSort} onBringIn={() => setBringingIn(true)}/>
      : potId ? <PotDetail document={document} setDocument={setDocument} potId={potId} month={month} today={today} onBack={() => onOpenPot(null)}/>
      : folded ? <>
        {pots}
        <Section title="Payday" id="month-payday" collapsed={{ summary: `${funding.done} of ${funding.total} done${ticked ? ` · last ticked ${dayOf(ticked)}` : ''}`, onExpand: () => setExpandedMonth(month) }}/>
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
