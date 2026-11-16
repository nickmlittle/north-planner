import { useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate, type CardTransaction } from '../domain/cardTracker'
import { linkedOrder, linkRefund, ordersWithReturns, type HeldPurchase } from '../domain/expectingBack'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { pounds } from './spendingFormat'

/** "asos.com · 3 Nov". */
const orderName = (purchase: CardTransaction) => `${purchase.description} · ${shortDate(purchase.date)}`

/**
 * Is this a return? (health 9b): a refund's sort sheet lists the orders with returns still out, the same shop first.
 * Choosing one shows what was expected against what came back, then **That's everything back** (the order is settled,
 * any difference is spending) or **More to come** (the rest stays expecting back). A linked refund says which order
 * it's for, with Change.
 */
export function ReturnLink({ document, setDocument, refund, today = localDate(), now = () => new Date(), onLinked }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; refund: CardTransaction; today?: string; now?: () => Date; onLinked: (message: string) => void }) {
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const orders = refund.kind === 'refund' ? ordersWithReturns(tracker, refund, today) : []
  const linked = linkedOrder(tracker, refund)
  const [changing, setChanging] = useState(false)
  const [chosen, setChosen] = useState<HeldPurchase | null>(null)
  if (refund.kind !== 'refund' || !orders.length && !linked) return null
  const back = -refund.amountPence

  const link = (order: HeldPurchase, everything: boolean) => {
    const at = now()
    const gap = order.outPence - back
    setDocument(latest => linkRefund(latest, refund.id, order.purchase.id, everything, at))
    onLinked(`Linked to ${orderName(order.purchase)}.${gap > 0 ? everything ? ` That’s everything back: ${pounds(gap)} counts as spending.` : ` ${pounds(gap)} still expecting back.` : ''}`)
  }
  const pots = (order: HeldPurchase) => order.byDestination.filter(part => part.outPence > 0).map(part => name(part.destination)).join(' and ')

  if (linked && !changing) return <section className="sort-return" aria-label="Return for an order">
    <p><strong>The return for {orderName(linked)}</strong>{refund.sort?.lines.some(line => line.item) ? `: ${refund.sort.lines.filter(line => line.expectingBack).map(line => line.item).filter(Boolean).join(', ')}` : ''}.</p>
    {orders.length > 0 && <button type="button" className="text-button" onClick={() => setChanging(true)}>Change</button>}
  </section>

  return <section className="sort-return" aria-labelledby="sort-return-heading">
    <h3 id="sort-return-heading">Is this a return?</h3>
    <p>Link it to the order it’s for. How much came back doesn’t have to match.</p>
    <ul className="sort-options" aria-label="Orders with returns out">{orders.map(order => <li key={order.purchase.id}>
      <button type="button" className="sort-option" aria-pressed={chosen?.purchase.id === order.purchase.id} onClick={() => setChosen(order)}>
        <span className="sort-option-text"><span className="sort-option-name">{order.purchase.description}</span><span className="sort-option-sub">{pounds(order.outPence)} expected back · bought {dayDate(order.purchase.date)}</span></span>
        <span className="sort-option-amount">{pounds(order.purchase.amountPence)}</span>
      </button>
    </li>)}</ul>
    {chosen && (() => {
      const gap = chosen.outPence - back
      return <div className="sort-return-link" aria-live="polite">
        <p>{pounds(chosen.outPence)} expected · {pounds(back)} came back</p>
        {gap > 0 ? <>
          <button type="button" className="primary-button" onClick={() => link(chosen, true)}>That’s everything back</button>
          <p className="sort-return-hint">{pounds(gap)} counts as spending in {pots(chosen)}, and the order is done.</p>
          <button type="button" className="secondary-button" onClick={() => link(chosen, false)}>More to come</button>
          <p className="sort-return-hint">{pounds(gap)} stays expecting back.</p>
        </> : <>
          <button type="button" className="primary-button" onClick={() => link(chosen, true)}>Link it</button>
          {gap < 0 && <p className="sort-return-hint">{pounds(-gap)} more than expected goes back as an ordinary refund.</p>}
        </>}
      </div>
    })()}
  </section>
}
