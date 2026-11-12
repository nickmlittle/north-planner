import type { Dispatch, SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker } from '../domain/cardTracker'
import { refreshSettled } from '../domain/cardStatements'
import { moveSteps, potPhrase, recordMove, type ToMoveRow } from '../domain/setAside'
import { pounds } from './spendingFormat'

/**
 * Record a set-aside move ("Moved £140.59"): the chosen transactions are now in the pot, and any statement they
 * settle refreshes. Returns the message and the move's id, for Undo. Shared by Spending's Set aside block and the sheet.
 */
export function markSetAsideMoved(document: BudgetDocument, setDocument: Dispatch<SetStateAction<BudgetDocument>>, cardId: string, rows: readonly ToMoveRow[], at: Date): { text: string; id: string } {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  const total = moveSteps(document, cardId, rows)?.totalPence ?? 0
  const phrase = potPhrase(pot?.name ?? card?.name ?? 'the pot')
  const id = crypto.randomUUID()
  const keys = [...new Set(rows.map(row => row.transaction.statementKey))]
  setDocument(current => keys.reduce((next, key) => refreshSettled(next, key, at), recordMove(current, cardId, rows.map(row => row.transaction.id), at, id)))
  return { text: total > 0 ? `Moved ${pounds(total)} to ${phrase}.` : total < 0 ? `Moved ${pounds(-total)} back out of ${phrase}.` : 'Moved between pots.', id }
}
