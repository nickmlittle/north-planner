# KAN-57: Monthly income and budget timing rules

**Status:** Approved by Nick on 2026-10-25
**Purpose:** Define the income and timing contract for KAN-58's monthly budget template and overrides.
**Scope:** Decision specification only. No application behavior or saved data changes are authorized by this document.

## Decisions

| Area | Rule |
| --- | --- |
| Employment income | Estimate monthly take-home from gross PAYE or inside-IR35 income using the existing tax and pension assumptions. Estimates are indicative, not payroll calculations. |
| Take-home override | A person may enter a manual monthly take-home amount. It replaces the estimate for monthly budget funding only; gross income and pension rates remain the inputs to the long-term projection. |
| Variable pay and bonuses | Represent these as expected monthly gross employment income with an effective month. A one-off bonus is entered only for its payout month, using that month's override. Use the existing employment estimate; do not promise exact payroll withholding. |
| Other income | For income outside PAYE and inside-IR35 employment, enter an expected monthly net amount. Add it to budget-available take-home without applying the employment tax estimator. |
| Pensions | Record salary-sacrifice, net-pay or relief-at-source treatment, plus employee and employer contribution rates. Apply the treatment rules below so employee pension saving is not deducted twice from budget cash. |
| Calendar timing | Budget periods are calendar months. An income change effective on any day applies to the whole effective month. |
| Past months and overrides | A later income change does not rewrite earlier months. Explicit month overrides remain in place when the base income changes. |
| Joint funding | Proportional funding is shared among people with positive budget-available take-home. If everyone has zero take-home, the item must use an explicit equal, custom or single-person rule. |
| Actual spending | Actual-spending capture and reconciliation are out of scope. This contract describes planned income and funding only. |

## Pension and take-home accounting

For an employment month, let **G** be estimated gross pay, **E** the employee contribution (gross pay multiplied by the employee rate), **R** the employer contribution, and **T** and **N** the income-tax and NI estimates under the current configured rules. Monthly values derived from the existing annual model are indicative; the employment tax estimator remains the source of the estimate.

| Treatment | Tax and NI basis | Employee cash deduction | Pension credited |
| --- | --- | --- | --- |
| Salary sacrifice | Tax and NI use gross pay after the sacrificed employee amount: `G − E`. | `E` | `E + R` |
| Net pay | Tax uses `G − E`; NI uses `G`. | `E` | `E + R` |
| Relief at source | Tax and NI use `G`; the employee's gross contribution is funded from net pay. | `80% × E` after the standard 20% relief-at-source top-up | `E + R`, including the top-up represented by the gross employee contribution |

In every case, estimated employment take-home is gross pay less the applicable employee cash deduction, tax and NI. Employer contributions increase pension saving but are not available for monthly budget funding. A manual take-home override supersedes this estimated cash figure for the budget only; it does not change the pension contribution or projection inputs.

## Worked examples

1. **One-off bonus:** A person has £4,000 expected monthly gross pay and a £1,000 gross bonus in October only. October's employment estimate uses £5,000 gross; other months remain based on £4,000. The bonus is not copied into later months. A take-home override for October, if supplied, controls the October budget amount.
2. **Mid-month change:** Gross pay changes from £4,000 to £5,000 effective 15 October. The October budget uses £5,000 for the whole month; the 15th does not cause a daily proration.
3. **Past month and explicit override:** January is already recorded at £4,000 and February has an explicit £4,500 month override. A new £5,000 base amount effective March leaves January unchanged, preserves February's override, and supplies the base amount for March onward unless another override applies.
4. **Pension treatments:** With £5,000 gross monthly pay, a 5% employee rate gives **E = £250** and a 3% employer rate gives **R = £150**. Salary sacrifice applies tax and NI estimates to £4,750, deducts £250 from cash and credits £400 to the pension. Net pay applies tax to £4,750 and NI to £5,000, deducts £250 from cash and credits £400. Relief at source applies tax and NI to £5,000, deducts £200 from cash after the 20% top-up, and credits £400. The resulting estimated take-home differs by treatment and configured tax rules; these figures are not payroll promises.
5. **Joint funding:** If monthly budget-available take-home is £3,000 and £2,000, proportional funding assigns 60% and 40%. If it is £3,000 and £0, the earner funds 100%. If both are £0, proportional funding is undefined, so the item requires an explicit equal, custom or single-person rule.

## Review and handoff

Nick approved this contract on 2026-10-25. KAN-58 may implement the agreed monthly budget and override behavior; it must not broaden this task into actual-spending tracking or new tax/payroll calculations.

## Existing model alignment

The current forecast stores employment as annual income periods and models the three pension treatments in `src/engine/employment.ts`. Other income as net monthly cash, calendar-month budget inputs and month-specific overrides are decisions for the later monthly budget work; this document does not prescribe a storage schema or API.
