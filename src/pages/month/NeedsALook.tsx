import { Meter } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import type { LookRow, MonthSpending } from '../../domain/cardSpending'
import { formatGBP } from '../../formatting/money'
import { capitalise, paceDetail, paceHeadline, reasonText } from '../../formatting/paceLabels'
import './NeedsALook.css'

/** "Joint", or the owner's name, for a pot. */
function ownerOf(document: BudgetDocument, potId: string): string {
  const pot = document.budget.pots.find(row => row.id === potId)
  const owners = document.budget.accounts.find(account => account.id === pot?.accountId)?.ownerPersonIds ?? []
  return owners.length === 1 ? document.household.adults.find(person => person.id === owners[0])?.name ?? 'Pot' : 'Joint'
}

/**
 * Needs a look (Spending ↔ Month link F3, boards D2 and M3): the pots over or ahead of pace lead Month, each with
 * its reason ("Mostly Tesco £303.38") and when it runs out. Desktop: a strip of cards above the table, which stays
 * whole. Phones: a section above the groups, and those pots leave their groups (decision L5).
 */
export function NeedsALook({ document, items, figures, mobile, onOpenPot }: { document: BudgetDocument; items: LookRow[]; figures: MonthSpending; mobile: boolean; onOpenPot: (potId: string) => void }) {
  if (!items.length) return null
  return <section className={`needs-look${mobile ? ' is-phone' : ''}`} aria-label="Needs a look">
    <h3 className="needs-look-title">Needs a look <span className="needs-look-count">{items.length}</span></h3>
    <ul className="needs-look-list">{items.map(({ row, reason }) => {
      const potId = row.destination.kind === 'pot' ? row.destination.potId : ''
      const name = document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
      const owner = ownerOf(document, potId)
      const headline = paceHeadline(row)
      // Bills still to come stay in view, as on the pot's own row: "£30.00 of it due".
      const detail = capitalise([paceDetail(row, figures), row.duePence > 0 ? `${formatGBP(row.duePence / 100)} of it due` : ''].filter(Boolean).join(' · '))
      const why = reason ? reasonText(reason) : ''
      const tone = row.status === 'over' ? 'critical' as const : 'warning' as const
      const paced = row.plannedPence > 0
      return <li key={row.key}><button type="button" className="needs-look-card" data-list-row onClick={() => onOpenPot(potId)}
        aria-label={[`${name} · ${owner}: ${headline}`, why, detail].filter(Boolean).join('. ')}>
        <span className="needs-look-top"><span className="needs-look-name">{name}<span className="needs-look-owner"> · {owner}</span></span><span className={`needs-look-status is-${tone}`}>{headline}</span></span>
        {paced && <Meter label={`${name}: ${headline}`} value={row.spentPence + row.takenPence} max={row.plannedPence} {...figures.when === 'current' && row.expectedPence !== undefined ? { pace: row.expectedPence / row.plannedPence } : {}} tone={tone}/>}
        {(why || detail) && <span className="needs-look-why">{why && <span className="needs-look-reason">{why}</span>}{detail && <span className="needs-look-detail">{detail}</span>}</span>}
      </button></li>
    })}</ul>
  </section>
}
