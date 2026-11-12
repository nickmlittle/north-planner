import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { localDate } from '../domain/cardTracker'
import { monthSpending } from '../domain/cardSpending'
import { monthStage, type MonthStage } from '../domain/monthStages'
import { budgetDateMarkers, incomeDateMarkers } from '../domain/monthlyBudget'
import { formatMonth } from '../formatting/month'
import { MonthTitle, PageHeader, Section, StatusChip } from '../components/ui'
import { BringInSheet } from './BringInSheet'
import { CheckBalancesSheet } from './CheckBalancesSheet'
import { CloseMonth } from './CloseMonth'
import { PotDetail, ThisMonthPanel } from './SpendingMonth'
import { stageLabel } from './spendingFormat'
import './MonthPage.css'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  onMonthChange: (month: string) => void
  /** The payday steps (PaydayPage), which MonthlyBudget renders so Plan and Month share their state. */
  payday: ReactNode
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

const chipTone: Record<MonthStage, 'neutral' | 'positive' | 'warning'> = { upcoming: 'neutral', funding: 'neutral', funded: 'positive', 'in-progress': 'neutral', closing: 'warning', 'to-settle': 'warning', settled: 'positive' }

/**
 * Month: the month's money in one place. Payday (the steps, was Transfers), then Pots (was Spending › This month),
 * with a pot's page and Close <Month> in their place. An interim composition of today's panels (audit 3 PR 06);
 * PRs 11 and 12 redesign it.
 */
export function MonthPage({ document, setDocument, month, onMonthChange, payday, potId = null, closing = false, onOpenPot, onOpenClose, onSort, today = localDate() }: Props) {
  const [checking, setChecking] = useState(false)
  const [bringingIn, setBringingIn] = useState(false)
  const [message, setMessage] = useState('')
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
  const header = <PageHeader titleText="Month" monthLabel={label}
    title={<MonthTitle month={month} onChange={onMonthChange} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/>}
    chip={<StatusChip tone={chipTone[stage.stage]}>{stageLabel(stage, monthSpending(document, month, today))}</StatusChip>}
    actions={<button type="button" className="secondary-button" onClick={() => setChecking(true)}>Check balances</button>}/>
  return <div ref={frame} className="page-frame monthly-budget-page budget-view-transfers month-page">
    {header}
    {message && <p className="budget-manage-message month-message" role="status">{message}</p>}
    {closing ? <CloseMonth document={document} setDocument={setDocument} month={month} today={today} onBack={() => onOpenClose(false)} onSort={onSort} onBringIn={() => setBringingIn(true)}/>
      : potId ? <PotDetail document={document} setDocument={setDocument} potId={potId} month={month} today={today} onBack={() => onOpenPot(null)}/>
      : <>
        <Section title="Payday" id="month-payday">{payday}</Section>
        <Section title="Pots" id="month-pots"><ThisMonthPanel document={document} month={month} today={today} onOpenPot={onOpenPot} onOpenClose={() => onOpenClose(true)}/></Section>
      </>}
    {checking && <CheckBalancesSheet document={document} setDocument={setDocument} onClose={() => setChecking(false)} onSaved={text => { setChecking(false); setMessage(text) }}/>}
    {bringingIn && <BringInSheet document={document} setDocument={setDocument} onClose={() => setBringingIn(false)} onSort={() => { setBringingIn(false); onSort() }}/>}
  </div>
}
