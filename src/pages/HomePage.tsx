import type { Household } from '../domain/models'

export function HomePage({ household }: { household: Household }) {
  return (
    <>
      <h1>Plan your path to financial independence.</h1>
      <p>Explore when Nick and Immy could stop full-time work and sustain their planned lifestyle through retirement.</p>
      <section aria-labelledby="household-heading" className="household-card">
        <h2 id="household-heading">Your household</h2>
        <p role="status">Default household loaded successfully: <strong>{household.name}</strong>.</p>
        <p>Planning basis: real {household.assumptions.moneyBasis.priceYear} {household.assumptions.moneyBasis.currency}.</p>
        <p className="muted">Edit your starting position below. Review the deterministic annual forecast below.</p>
      </section>
    </>
  )
}
