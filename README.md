# North Planner

A client-side household financial planning app. KAN-5 through KAN-16 provide
editable starting inputs, assumptions and events with a deterministic annual
forecast in real 2026 GBP.

## Local development

Use Node.js 22.22.2+, 24.15+, or 26+ and npm (supported major versions).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

```sh
npm test          # automated tests, one run
npm run lint     # ESLint, zero warnings
npm run typecheck
npm run build    # TypeScript check and production bundle in dist/
npm run preview  # serve the production bundle locally
npm run check    # lint, tests, and production build
```

## Architecture

- `src/domain`: shared TypeScript models; no framework dependencies.
- `src/config`: default household fixture and independent configuration loader.
- `src/state`: React application state, initialized from configuration.
- `src/formatting`: reusable GBP display formatting.
- `src/engine`: pure deterministic financial engines and annual composition.
- `src/simulation`: extension point for seeded Monte Carlo orchestration.
- `src/components`: reusable layout and presentation components.
- `src/pages`: page-level presentation; the single home page needs no router yet.
- `src/test`: shared test setup; tests sit beside the behavior they verify.

UI consumes domain data; financial calculations belong in the engine, never in
React components. Engine and simulation modules must stay independent of UI and
application state. ESLint prevents framework/UI imports into domain, config,
engine, and simulation TypeScript modules. GitHub Actions runs `npm run check`
for PRs into main and pushes to main.

## Modelling convention and bootstrap assumptions

All model monetary amounts are **real 2026 GBP**, represented as numbers in
pounds, not pence. `PlanningAssumptions.moneyBasis` fixes currency, price year,
and real terms at the type level. Annual real asset returns use decimal rates
(e.g. 0.03 for 3% above inflation). Mortgage contractual interest is explicitly
nominal and must be handled separately by future mortgage logic.

The default household uses the supplied starting values: Nick age 32, Immy age
31, ISAs £88,000 / £1,000, pensions £117,000 / £25,000, house £850,000,
mortgage £446,000, and cash £0, at base year 2026. ISAs provisionally use the
stocks-and-shares type and property/cash use joint owner IDs. These classifications
have no calculated effects yet. Unknown FIRE ages, pension access ages, returns,
and mortgage interest/term remain `null`. The 2026–2100 horizon is provisional.

Ages are whole years at the base year, represented by approximate birth years
(1994 / 1995 initially); no birthday precision is implied. Changing the base year
preserves birth years and therefore changes displayed ages. The base year must
not exceed the planning horizon or put a person's age outside 1–120. Changing it
does not change the real 2026 GBP price basis or inflate balances.

Starting-position parsing and immutable updates live in `src/domain`, independent
of React. Valid edits immediately update the household. Invalid text stays in the
input with an accessible error while the last valid numeric domain value is
retained. Money inputs show formatted GBP when idle and plain decimal pounds when
focused; enter without currency symbols or separators, with up to two decimals.
Negative, blank, malformed, non-finite, and out-of-range numbers are rejected.
Zero balances are valid. Changes stay in memory and reset to defaults on reload.

Each load deep-clones the fixture. Asset ownership and mortgage/property
relationships use stable IDs. Financial events represent one-off signed cash
flows; life events carry descriptive context. Their effects are not implemented.

There is no simulation, persistence, backend or authentication. Annual forecasts
and tax outputs are planning estimates, with explicit limitations below.

KAN-7 adds session-owned planning assumptions, separate from the starting household.
Illustrative defaults: equity 4% real / 15% volatility, bonds 1% / 5%, house 0%,
cash fixed 0%, FIRE 50, pension access 58, horizon 95, withdrawal rate 3.5%.
These are editable modelling inputs, not financial recommendations. Forecast
recalculation is integrated by KAN-16; scenario toggles arrive in later tickets.

KAN-8 uses inclusive start/exclusive end calendar-year income periods. Multiple
sequential jobs are supported per person, with an optional working fraction and
gross override. Overlapping jobs or linked work adjustments are rejected rather
than silently stacked. No earnings are invented; configure income in the UI.
Inside-IR35 day rates are assumed to be taxable worker gross pay, not umbrella
assignment rates inclusive of employer NI/fees. Partial-year payroll is excluded.

KAN-9 estimates per-person income tax and employee NI using editable 2026/27
England/Wales/Northern Ireland rules and annualised category A NI. Allowance
taper is explicit. Thresholds are constant in real 2026 GBP for future years
unless edited (no implicit forecast of fiscal drag). Estimates exclude Scottish
bands, student loans, benefits, employer NI and payroll timing.
Sources: [HMRC income tax](https://www.gov.uk/income-tax-rates) and
[2026/27 employer thresholds](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027).

KAN-10 adds employee/employer pension percentages per income period. Salary
sacrifice reduces taxable and NI earnings; net-pay reduces taxable earnings only.
Relief-at-source uses gross contribution percentages, 20% provider relief, band
extension and adjusted-net-income taper, assuming further relief claimed in-year.
Employer contributions go only to pensions. Work/contributions end at FIRE unless
explicitly continued, and always end with the income period. Rates start at zero
until configured. Annual/tapered allowances, carry-forward, minimum wage and
employer NI recycling are excluded. See [HMRC pension relief](https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief).

KAN-11 adds baseline lifestyle spending and stacking annual spending-change
periods, with start inclusive/end exclusive. Combined spending cannot be negative.
Mortgage, child costs and tax remain separate. Base-year surplus before mortgage
and children updates immediately. Baseline zero is explicitly unconfigured.

KAN-12 adds individually toggleable children, one-off birth costs, editable
annual age bands 0–2/3–4/5–11/12–18 and linked parental work changes. No child
costs are invented. Disabling a child removes its costs and linked changes;
conflicting parental work schedules are flagged, not multiplied together.
Calendar-year approximation includes a full cost year at birth and age 18.

KAN-13 implements nominal monthly repayment amortisation, capped overpayments
and year-boundary remortgages. Overpayments retain the contractual monthly
payment and shorten payoff; refinancing recalculates it using remaining principal.
Personal interest/term start blank and must be entered. Inflation for nominal
mortgage conversion is explicit, initially 0% (nominal equals real). Nominal debt
is carried between years; payments use each year's opening price index and
closing debt the next year's index. No lender fees, ERCs or interest-only loans.

KAN-14 executes property moves at the opening of the selected year. Equity after
sale, old debt and selling fees funds purchase/costs, then proportional ISA draws,
then a new mortgage. Excess equity becomes cash; existing cash is not a purchase
funding source under the specified order. Optional sale overrides are explicit
valuation changes. Renovations are expensed, not automatically added to value.
Stamp duty is a user-entered amount, not an automatic tax estimate. Borrowing is
the residual funding need, with no lender affordability/LTV constraint. Multiple
moves are supported in different years; conflicting same-year moves are flagged.

KAN-15 uses deterministic water-filling toward equal projected FIRE ISA values,
with each owner's allowance cap. Surplus after tax/pensions/lifestyle/children/
mortgage plus available existing cash is eligible; excess remains 0%-real cash.
Allowance defaults are £20,000 per adult ([HMRC](https://www.gov.uk/individual-savings-accounts)),
held constant in real 2026 GBP and reset each annual calendar-year bucket.
No flexible-ISA replacement, external subscriptions or UK-residency checks.

## Deterministic annual results (KAN-16)

The results view recalculates on valid edits and shows per-year income, tax/NI,
lifestyle, child costs, mortgage payments/balance, ISA, pensions, cash, house/equity
and net worth. Expand a year for per-person pension contributions, ISA flows,
property costs and opening + flows + returns = closing ledgers.

The forecast includes the base year through the year the **youngest adult**
reaches the horizon age, so both adults reach at least that age. This age-based
horizon supersedes the provisional calendar end year used by starting-position
validation. The base date is a whole calendar year; no partial-year proration.
Opening-year moves precede annual asset returns; contributions/withdrawals/sweeps
occur at year end. ISA and pension equities use the fixed equity real return;
cash ISAs and household cash use 0%. Bond allocation, volatility, withdrawal-rate
rules, pension access/withdrawals, State Pension and retirement tax optimisation
are deferred. No probability or retirement success claim is made.

A negative projected cash ledger is a **cumulative unfunded plan need**, not an
assumed overdraft. Deficits use cash then proportional ISA withdrawals; pension
assets remain untouched. Planned mortgage amortisation continues, with any
unfunded payment included in that ledger. Net worth includes signed cash so
unfunded expenses are not hidden. Post-deficit results describe an unfunded plan,
not a funded asset path. Missing personal mortgage terms prevent calculation and
show an actionable message. Earnings/spending start at zero/unconfigured.

V1 supports one home/mortgage and one individually owned ISA/pension per adult;
inconsistent ownership, conflicting move/refinance years and unsupported generic
events are reported, not silently ignored. Inputs stay in memory until reload.
