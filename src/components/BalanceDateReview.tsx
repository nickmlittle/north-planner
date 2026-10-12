import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'

export function BalanceDateReview({ document, setDocument, onReview }: { document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; onReview: () => void }) {
  if (document.balanceDatesReviewed) return null
  return <aside className="storage-warning" role="status">
    <p>Your saved balances were kept, but their observation dates were not saved. They are excluded from date-dependent projections until dated.</p>
    <div className="button-row"><button type="button" className="secondary-button" onClick={onReview}>Review balance dates</button>
      <button type="button" className="text-button" onClick={() => setDocument(d => ({ ...d, balanceDatesReviewed: true }))}>Finish date review</button></div>
  </aside>
}
