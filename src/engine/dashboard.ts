import type { ForecastInput, ForecastYear } from '../domain/forecast'

export function dashboardMetrics(input: ForecastInput, rows: ForecastYear[]) {
  const fireYear = Math.max(input.household.assumptions.startYear, ...input.household.people.map(p => p.birthYear! + (p.targetFireAge ?? input.planning.fireAge)))
  const fire = rows.find(r => r.year === fireYear)
  const lockedPension = fire?.people.reduce((sum, p) => {
    const account = input.household.pensions.find(a => a.ownerIds.includes(p.personId))
    return sum + (p.age < (account?.accessAge ?? input.planning.pensionAccessAge) ? p.pension.closing : 0)
  }, 0) ?? 0
  const accessible = fire ? fire.isa + Math.max(0, fire.cash.closing) + fire.pension - lockedPension : null
  return { fireYear, fireNetWorth: fire?.netWorth ?? null, lockedPension, accessible,
    annualWithdrawal: accessible === null ? null : accessible * input.planning.withdrawalRate,
    firstUnfundedYear: rows.find(r => r.unfundedCash > 0)?.year ?? null }
}

export interface ChartPoint { label: string; year: number; netWorth: number; isa: number; pension: number; cash: number; equity: number }
export function forecastChartPoints(input: ForecastInput, rows: ForecastYear[]): ChartPoint[] {
  const h = input.household
  const sum = (a: { value: number }[]) => a.reduce((n, v) => n + v.value, 0)
  const isa = sum(h.isas), pension = sum(h.pensions), cash = sum(h.cash)
  const equity = sum(h.properties) - h.mortgages.reduce((n, m) => n + m.balance, 0)
  return [{ label: 'Today', year: h.assumptions.startYear, isa, pension, cash, equity, netWorth: isa + pension + cash + equity },
    ...rows.map(r => ({ label: String(r.year), year: r.year, isa: r.isa, pension: r.pension, cash: r.cash.closing, equity: r.equity, netWorth: r.netWorth }))]
}
