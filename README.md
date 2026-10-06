# North Planner

A client-side household financial planning and FIRE forecasting app. KAN-5
established the shell; KAN-6 adds editable household starting-position inputs.
Forecasting arrives in later tickets.

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
- `src/engine`: extension point for pure deterministic forecast functions.
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

There is no forecast, tax model, simulation, persistence, backend or authentication
in this shell. The UI confirms configuration loading and does not imply that a
financial forecast has been calculated.

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
