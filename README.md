# North Planner

A client-side household financial planning and FIRE forecasting app. KAN-5 sets
up the application shell only; financial inputs and forecasting arrive in later
tickets.

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

The default household contains Nick and Immy, stable person IDs, empty asset,
liability, and event collections. Unknown birth years, FIRE ages and returns are
`null`, not fabricated inputs. The 2026–2100 planning horizon is a provisional
configuration default. Each load deep-clones the fixture so editing one household
cannot affect another load. Asset ownership and mortgage/property relationships
use IDs; future input validation must validate those references and numeric
ranges. Financial events currently represent one-off signed cash flows; life
events carry descriptive context. Their effects are not implemented.

There is no forecast, tax model, simulation, persistence, backend or authentication
in this shell. The UI confirms configuration loading and does not imply that a
financial forecast has been calculated.
