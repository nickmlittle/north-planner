# Deterministic forecasting

`forecast.ts` composes pure annual income, pension/tax, spending, child, mortgage,
property and surplus engines. It accepts `ForecastInput` and never imports React.
The household is never mutated; callers can recalculate from the same starting
position when inputs change. Each year contains per-account opening, flow, return
and closing ledgers plus separate costs and per-person employment data.

Annual convention: opening-year property moves, returns on remaining opening
assets, then year-end contributions/cash flows/ISA sweeps or withdrawals. Nominal
mortgage amortisation uses monthly payments and explicit inflation conversion.
Negative projected cash denotes cumulative unfunded need, not an approved loan.
Pensions are accumulated but never withdrawn in this version. Generic household
events are rejected in favour of the explicit event models, rather than ignored.
