import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate } from '../domain/cardTracker'
import { goThroughCounts, goThroughStep, handleRow, type GoThrough } from '../domain/goThrough'
import { SortSheet } from './SortSheet'
import { SplitEditor } from './SplitEditor'
import { goThroughEnded } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  /** The queue, fixed when it opened (WP8). */
  start: GoThrough
  today?: string
  onOpenMonth?: (potId: string | null, month: string) => void
  /** Each row dealt with: "Sorted to Groceries · Monzo Joint." Spending shows it in its status line. */
  onStep?: (text: string) => void
  /** Closed, or nothing left: "Gone through 4 with Ada: 3 sorted, 1 still waiting.", or empty when nothing was gone through. */
  onEnd: (text: string) => void
  returnFocusTo?: () => HTMLElement | null
}

/**
 * Go through them (W9): a queue of waiting rows, one at a time, in ONE sort sheet (remounting would replay the phone
 * sheet's slide-up). Split hands over to the split editor and back, and saving the split carries on with the next row.
 * Spending, Home and Close <Month> open it over their own page, so the household ends where it started.
 */
export function GoThroughSheet({ document, setDocument, start, today = localDate(), onOpenMonth, onStep, onEnd, returnFocusTo }: Props) {
  const [going, setGoing] = useState(start)
  const [splitting, setSplitting] = useState<string | null>(null)
  const ended = useRef(false)
  const step = goThroughStep(document, going)
  const end = (state: GoThrough) => {
    if (ended.current) return
    ended.current = true
    onEnd(goThroughEnded(document, state.scope, state.ids.length, goThroughCounts(document, state)))
  }
  // The last row dealt with, or sorted elsewhere: the go-through ends, with what happened to its rows.
  useEffect(() => { if (!step) end(going) })
  const goOn = (id: string, text: string) => { setGoing(state => handleRow(state, id)); onStep?.(text) }
  if (!step) return null
  const current = step.current
  const splittingTransaction = splitting ? cardTracker(document).transactions.find(row => row.id === splitting) : undefined
  // A pot it tips gets no toast here: the impact line says so before Place, and a toast would sit behind the sheet.
  return <>
    {!splittingTransaction && <SortSheet document={document} setDocument={setDocument} transaction={current} today={today} onOpenMonth={onOpenMonth}
      goThrough={{ state: going, step, onSkip: () => goOn(current.id, `${current.description} is still waiting.`) }}
      returnFocusTo={returnFocusTo} onClose={() => end(going)} onSorted={text => goOn(current.id, text)} onSplit={() => setSplitting(current.id)}/>}
    {splittingTransaction && <SplitEditor document={document} setDocument={setDocument} transaction={splittingTransaction} onClose={() => setSplitting(null)}
      onSaved={text => { setSplitting(null); goOn(splittingTransaction.id, text) }}/>}
  </>
}
