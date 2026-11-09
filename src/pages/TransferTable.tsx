import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { accountPeople, isNotCalculated, type PersonAmount, type TransferAccount } from '../domain/personTransfers'
import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

type Props = {
  /** Already in reading order (`orderTransferAccounts`). */
  accounts: TransferAccount[]
  /** One column per person, with their planned total for the footer. */
  people: { personId: string; plannedPence: number }[]
  adults: BudgetDocument['household']['adults']
  labels: ReadonlyMap<string, string>
  potName: (potId: string) => string
  affectedAccounts?: readonly string[]
  /** The instructions flag at least one account for review; totals get an asterisk. */
  incomplete?: boolean
}

/** Desktop comparison: what each person sends to each destination account, with its pots and direct items beneath. */
export function TransferTable({ accounts, people, adults, labels, potName, affectedAccounts, incomplete }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const personIds = people.map(person => person.personId)
  const amountCell = (notCalculated: boolean, pence: number) => notCalculated ? '—' : pounds(pence)
  const byPersonCells = (rows: PersonAmount[], notCalculated: boolean) => rows.map(row => <td key={row.personId}>{amountCell(notCalculated, row.amountPence)}</td>)
  return <div className="budget-v3-transfer-table-wrap"><table className="budget-v3-transfer-table">
    <caption className="visually-hidden">Monthly transfer amounts by destination and person</caption>
    <thead><tr><th scope="col">Destination</th>{people.map(person => <th scope="col" key={person.personId}>{adults.find(row => row.id === person.personId)?.name ?? 'Person'}</th>)}<th scope="col">Total</th></tr></thead>
    <tbody>{accounts.map(account => {
      const label = labels.get(account.accountId) ?? 'Account'
      const isCollapsed = collapsed[account.accountId] ?? false
      const notCalculated = isNotCalculated(account)
      const affected = affectedAccounts?.includes(account.accountId)
      return <Fragment key={account.accountId}>
        <tr className={`budget-v3-transfer-account${account.incomplete ? ' is-incomplete' : ''}${affected ? ' is-affected' : ''}`}>
          <th scope="row">{account.hasPots
            ? <button type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed(current => ({ ...current, [account.accountId]: !isCollapsed }))}>{isCollapsed ? <ChevronRight aria-hidden="true"/> : <ChevronDown aria-hidden="true"/>}<span>{label}</span></button>
            : <span>{label}</span>}{affected && <small className="budget-affected-label">Changed by recent edit</small>}</th>
          {byPersonCells(accountPeople(account, personIds), notCalculated)}
          <td>{notCalculated ? <span className="budget-not-calculated">Not calculated</span> : <>{pounds(account.amountPence)}{account.incomplete ? ' *' : ''}</>}</td>
        </tr>
        {account.hasPots && !isCollapsed && <>
          {account.hasDirect && <tr className="budget-v3-transfer-child"><th scope="row">Direct to account</th>{byPersonCells(personIds.map(personId => ({ personId, amountPence: account.directByPerson.find(row => row.personId === personId)?.amountPence ?? 0 })), notCalculated)}<td>{amountCell(notCalculated, account.directAmountPence)}</td></tr>}
          {account.pots.map(pot => <tr key={pot.potId} className="budget-v3-transfer-child"><th scope="row">{potName(pot.potId)}</th>{byPersonCells(pot.byPerson, notCalculated)}<td>{amountCell(notCalculated, pot.amountPence)}</td></tr>)}
        </>}
      </Fragment>
    })}</tbody>
    <tfoot><tr className={incomplete ? 'is-incomplete' : undefined}><th scope="row">Funding total</th>{people.map(person => <td key={person.personId}>{pounds(person.plannedPence)}</td>)}<td>{pounds(accounts.reduce((sum, account) => sum + account.amountPence, 0))}{incomplete ? ' *' : ''}</td></tr></tfoot>
  </table></div>
}
