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
- `src/state`: persisted household document and legacy configuration helpers.
- `src/formatting`: reusable GBP display formatting.
- `src/engine`: pure deterministic financial engines and annual composition.
- `src/simulation`: extension point for seeded Monte Carlo orchestration.
- `src/components`: reusable layout and presentation components.
- `src/pages`: household setup, current overview, dashboard and plan settings screens.
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

First load starts with an empty household. The setup journey collects people and
full dates of birth, current earnings, defined-contribution pensions, ISAs, cash,
housing and regular spending. Review, overview and dashboard screens keep unknown amounts
separate from explicit zero; incomplete balances do not produce complete net worth.
Adult ownership is explicit for cash, property and mortgages. Children are tracked
separately from adult accounts, with later age-band costs required for forecasts.

Progress and planner edits are stored in localStorage under `north.household.v1`
when Supabase is not configured. For account-backed persistence, set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`, apply
`supabase/migrations/202610110001_households.sql`, and configure the Supabase
Google and email providers plus the app's deployed URL as an allowed redirect
URL. Users sign in with a passkey, or use Google to create/sign in to an account
before adding a passkey. Email sign-in links remain available as a recovery path
for accounts without a usable passkey. Their versioned household document is
stored in a row protected by Postgres row-level security. Existing browser data
is imported when the account has no household. When both versions exist, the
user chooses which to keep. Concurrent edits are detected by revision and
require an explicit choice. Cloud saves are automatic; a failed save keeps the
draft in this browser and displays an error. No offline write queue is provided.

### Supabase passkey and Google setup

In Supabase **Authentication → Providers → Google**, enable Google and enter the
OAuth client ID and secret. Create a Web application OAuth client in Google
Cloud Console and set its authorized redirect URI to
`https://<project-ref>.supabase.co/auth/v1/callback` (copy the exact callback
shown in the Supabase provider settings). In Supabase **Authentication → URL
Configuration**, set the Site URL to `https://north.nicklittle.co` and allow
that URL as a redirect. Also allow your local development URL if you use OAuth
locally.

In Supabase **Authentication → Passkeys**, enable passkey authentication and
configure the relying party display name as `North Planner`, relying party ID
as `north.nicklittle.co`, and allowed origin as
`https://north.nicklittle.co`. The relying party ID is bound into enrolled
credentials; choose the final production domain before users add passkeys and
keep it stable. If the site is served from another hostname, update both the
origin and relying party ID before enrollment. Passkeys use Supabase's
experimental `supabase-js` API, which is enabled in the client configuration.

## Preview on GitHub Pages

The repository includes a GitHub Actions workflow that builds and publishes
`main` to GitHub Pages. In repository **Settings → Pages**, choose **GitHub
Actions** as the deployment source and optionally set a custom domain such as
`north.nicklittle.co`. Add the repository Actions variables `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY`; these are public browser configuration values,
and database access is restricted by row-level security. In Supabase
**Authentication → URL Configuration**, set the site URL to the deployed URL
and add it to the allowed redirect URLs. The workflow builds for the root of the
custom domain; local development also uses `/` and reads configuration from
`.env.local`.

For passkey sign-in, point the custom domain to GitHub Pages and configure
`north.nicklittle.co` as the relying party ID and `https://north.nicklittle.co`
as the allowed origin in Supabase **Authentication → Passkeys**.

The planner uses annual calendar-year ages derived from DOB and real 2026 GBP.
Current earnings initially continue until FIRE; the income timeline supports later
changes. Starting-picture edits reconcile current earnings while preserving future
periods. Pension income, defined-benefit pensions, pension withdrawals,
self-employment and outside-IR35 earnings are not supported in this version.
The legacy Nick/Immy configuration remains a test fixture, not first-load user data.

KAN-7 adds editable planning assumptions, separate from the starting household.
Illustrative defaults: equity 4% real / 15% volatility, bonds 1% / 5%, house 0%,
cash fixed 0%, FIRE 50, pension access 58, horizon 95, withdrawal rate 3.5%.
These are editable modelling inputs, not financial recommendations. Forecast
recalculation is integrated by KAN-16; scenario toggles arrive in later tickets.

KAN-8 uses inclusive start/exclusive end calendar-year income periods. Multiple
sequential jobs are supported per person, with an optional working fraction and
gross override. Overlapping jobs or linked work adjustments are rejected rather
than silently stacked. Current earnings come from setup and can be edited in the UI.
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
and children updates immediately. Explicit zero spending is accepted.

KAN-12 adds individually toggleable children, one-off birth costs, editable
annual age bands 0–2/3–4/5–11/12–18 and linked parental work changes. No child
costs are invented. Disabling a child removes its costs and linked changes;
conflicting parental work schedules are flagged, not multiplied together.
Calendar-year approximation includes a full cost year at birth and age 18.

KAN-13 implements nominal monthly repayment amortisation, capped overpayments
and year-boundary remortgages. Overpayments retain the contractual monthly
payment and shorten payoff; refinancing recalculates it using remaining principal.
Mortgage interest and term come from household setup. Inflation for nominal
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
events are reported, not silently ignored. Inputs are saved in browser-local storage.

## Dashboard and life events

Completing setup opens the dashboard. Main navigation separates the dashboard,
current household picture and detailed plan settings. The dashboard shows current
net worth, projected net worth at household FIRE, an indicative annual withdrawal
estimate and the first unfunded year. FIRE is anchored to the year the last adult
reaches their configured FIRE age (or the base year if already retired). Estimates
use year-end balances. Withdrawal estimates apply the chosen rate to ISAs, positive
cash and pensions accessible by each owner's age; locked pensions and home equity
are excluded. This does not introduce pension drawdown or retirement tax modelling.

SVG charts show opening balances today and annual closing net worth, with FIRE
and event markers, plus stacked bars for ISAs, pensions, cash and home equity.
Negative balances appear below zero. A keyboard-accessible year picker exposes
exact values; annual results and reconciliation remain available below the charts.

The shared goal/life-event dialog supports existing-home moves, future children
with parental work changes, purchases with optional recurring costs, and lifestyle
spending changes. It previews the candidate against the saved plan before saving.
Cancel discards the draft; saved events can be edited, toggled or deleted. Incomplete
households can save valid events with an unavailable preview. Move/refinance and
parental work conflicts are rejected. Final years for purchase running costs and
spending changes are inclusive in the dialog and converted to exclusive model ends.

Purchases are cost-only: car resale value, rental property assets, rental income
and additional property financing are not modelled. Purchase costs are stored as
grouped events and translated into spending only when forecasting, avoiding double
counting. Existing version-1 saved documents default missing purchases to an empty
list; original event collections remain the source of truth.
