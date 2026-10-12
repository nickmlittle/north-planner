import type { ForecastYear, Ledger } from '../domain/forecast'
import type { Person } from '../domain/models'
import { formatGBPWhole as formatGBP } from '../formatting/money'

function BalanceRow({ name, value }: { name: string; value: Ledger }) {
  return <tr><th scope="row">{name}</th><td>{formatGBP(value.opening)}</td><td>{formatGBP(value.flows)}</td><td>{formatGBP(value.returns)}</td><td>{formatGBP(value.closing)}</td></tr>
}
export function ForecastResults({ result, people, priceYear = 2026 }: { result: { rows: ForecastYear[]; error?: string }; people: Person[]; priceYear?: number }) {
  return <section className="household-card" aria-labelledby="forecast-heading"><h2 id="forecast-heading">Deterministic annual forecast</h2>
    <p>All amounts are real {priceYear} GBP. This projection uses fixed returns and is not a FIRE probability. Year-end balances are shown. Volatility, bond allocation, pension withdrawals and State Pension are not modelled yet.</p>
    <p>Use the income, lifestyle spending and mortgage details from your household picture. Explicit zero earnings and costs are included as entered. Negative cash is a cumulative unfunded plan need, not an assumed loan; mortgage payments remain planned contractual payments.</p>
    {result.error ? <p role="status">Forecast unavailable: {result.error}</p> : <>
      {result.rows.some(row => row.unfundedCash > 0) && <p role="status" className="input-error">This plan has unfunded cash needs. Pension assets are not drawn down in this version; these results do not establish retirement affordability.</p>}
      <div className="table-scroll"><table><caption>Deterministic year-by-year results</caption><thead><tr>
        {['Year', 'Gross income', 'Tax', 'NI', 'Take-home', 'Lifestyle', 'Children', 'Mortgage payments', 'ISA', 'Pension', 'Cash / unfunded need', 'Mortgage', 'House', 'Equity', 'Net worth'].map(label => <th key={label} scope="col">{label}</th>)}
      </tr></thead><tbody>{result.rows.map(row => <tr key={row.year} data-testid={`forecast-${row.year}`}><th scope="row">{row.year}</th>
        {[row.gross, row.tax, row.ni, row.disposable, row.lifestyle, row.childCosts, row.mortgagePayment, row.isa, row.pension, row.cash.closing, row.mortgage.closing, row.house.closing, row.equity, row.netWorth].map((value, i) => <td key={i}>{formatGBP(value)}</td>)}
      </tr>)}</tbody></table></div>
      <h3>Annual detail and reconciliation</h3>
      {result.rows.map(row => <details key={row.year}><summary>{row.year} opening balances, flows and returns</summary>
        <p>{row.moveName ? `${row.moveName}: ` : ''}Sale valuation adjustment: {formatGBP(row.propertyValuationChange)}; property transaction costs: {formatGBP(row.propertyCosts)}; move ISA draw: {formatGBP(row.moveISADraw)}; mortgage interest: {formatGBP(row.mortgageInterest)}.</p>
        {row.people.map(person => <p key={person.personId}>{people.find(p => p.id === person.personId)?.name} (age {person.age}): gross {formatGBP(person.gross)}, tax {formatGBP(person.tax)}, NI {formatGBP(person.ni)}, employee/employer pension {formatGBP(person.employee)} / {formatGBP(person.employer)}, ISA subscription/withdrawal {formatGBP(person.isaContribution)} / {formatGBP(person.isaWithdrawal)}.</p>)}
        <div className="table-scroll"><table><caption>{row.year}: opening + flows + returns = closing</caption><thead><tr>{['Balance', 'Opening', 'Flows', 'Returns / debt inflation adjustment', 'Closing'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
          {row.people.map(person => <BalanceRow key={`${person.personId}-isa`} name={`${people.find(p => p.id === person.personId)?.name} ISA`} value={person.isa} />)}
          {row.people.map(person => <BalanceRow key={`${person.personId}-pension`} name={`${people.find(p => p.id === person.personId)?.name} Pension`} value={person.pension} />)}
          <BalanceRow name="Cash / unfunded need" value={row.cash} /><BalanceRow name="House" value={row.house} /><BalanceRow name="Mortgage liability" value={row.mortgage} />
        </tbody></table></div>
      </details>)}
    </>}
  </section>
}
