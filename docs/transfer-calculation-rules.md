# Transfer calculation and money-movement rules

**Status:** Agreed with Nick on 7 November 2026; implementation of [roadmap item 1.2](https://github.com/nickmlittle/north-planner/blob/0f2d2b6/docs/plan-transfers-ux-implementation-plan.md#12-define-how-transfer-instructions-are-calculated).

## Meaning of the amounts

| Term | Meaning |
| --- | --- |
| Budget allocation | What an item is planned to cost each month, with its destination and funding rule. |
| Contribution | The portion of that allocation a household member is responsible for funding. Funding is independent of account ownership. |
| Account funding requirement | One person's contributions to an account, including its pots. It states how much funding is needed there, not necessarily a bank transfer from somewhere else. |
| Pot movement | A subsequent movement from a parent account into one of its pots. It is already included in account funding, not a second contribution. |
| Breakdown | The budget items and original contributors that explain an amount. |

Periods and inheritance follow the [recurring monthly budget contract](recurring-monthly-budget-rules.md). Instructions are derived from the selected month's resolved items, income and shared destinations. They are not stored payments or frozen historical records.

## Contribution calculations

Amounts remain integer GBP pence. Each item's stored monthly amount is allocated independently:

- **Income ratio:** use positive employment income for each adult. Additional income increases budget availability but does not alter these proportions. With no positive employment income, a positive proportional item remains unresolved.
- **Equal:** use equal weights across household adults.
- **Custom:** use the item's non-negative relative weights. Positive amounts without a usable positive weight are unallocated.
- **Fixed:** preserve the saved penny amounts for each contributor; valid fixed contributions sum to the item's monthly amount.
- **One person:** assign the amount to the specified member. A missing member selection leaves it unallocated; unknown references invalidate the document.

For weighted rules, calculate each exact share, floor to whole pennies, then distribute remaining pennies in descending order of fractional remainder. Household order breaks ties. Do this once per item; derive account, pot, person and household totals by summation, not by reallocating those totals.

An annual entry retains the existing `Math.round(entryAmountPence / 12)` monthly conversion. For example, £100.01 annually becomes £8.33 per month. This is a monthly planning amount, not a schedule that promises to collect exactly the annual entry over twelve months. No new annual balancing adjustment is introduced.

Zero allocations create no actionable steps. Existing income-policy fields remain compatible; this item does not add surplus routing, savings withdrawals, balance-based netting, credit-card settlement or other money movements inferred from allocation purpose.

## Routing and responsibility

1. **Fund accounts:** group contributions by person and destination account, including both direct allocations and its pot allocations. The source is unknown (`null`). Do not assume that salaries arrive in a particular account, that funding an owned account requires an external transfer, or that money already present should be moved again.
2. **Distribute pots:** after funding, derive movements from the parent account to each pot. For a joint account, each contributor handles their own shares, including a contributor who is not one of the joint owners. For a sole-owned account, its owner moves the combined pot allocation, retaining every original contributor in the breakdown. An account without an owner has unresolved pot responsibility.

Source accounts, automation and account operating permissions have not been verified. A complete calculated instruction does not mean a bank payment is required, manual, authorised or completed. The app does not execute payments.

Funding dependencies link each joint pot step to that person's account-funding requirement. A sole-owner pot step depends on all contributions to its account. These links describe planning order, not tracked payment completion.

## Totals, precision and incomplete data

Show exact pounds and pence in transfer summaries, account details, personal contribution figures, matrix cells and sticky subtotals. Do not independently round displayed contributions or abbreviate large transfer amounts. Plan's adjacent monetary figures also use exact amounts so users can compare them directly.

An account's funding total equals its direct allocation plus its pot allocations. Household funding equals the sum of account funding totals, or equivalently the sum of personal contributions. Pot-movement totals are reported separately; never add them to funding and call the result the budget total. Direct allocations remain in the account and do not generate an extra movement step.

Keep the following distinct:

- Planned amount: all budget items, including unresolved items.
- Allocated funding: the contributions successfully calculated, including partial comparison figures for accounts needing review.
- Actionable funding: funding requirements only from accounts with complete calculations and resolved pot responsibility.
- Pot allocation: amounts successfully allocated to pots, already included in allocated funding.
- Actionable pot movements: the second-stage movements for complete accounts.

Any unresolved item or missing pot owner puts its entire account into `needs-review`. Keep its calculated breakdown visible, but withhold every step for that account from the actionable list. Unaffected accounts remain available. Existing comparison views label affected accounts and show review guidance; their funding total is a comparison of calculated contributions, not a claim that every instruction is ready.

Invalid document references or an invalid calendar-month argument fail explicitly rather than silently producing an empty instruction set. The UI marks unavailable instructions and keeps the existing comparison fallback. A valid empty budget returns no steps and no issues.

## Agreed worked examples

### One person: £100 funding, £60 pot movement

An item allocates £40 directly to an account and another allocates £60 to its Bills pot. The person has one £100 account-funding requirement, followed by one £60 pot movement. Total funding is **£100**, not £160.

### Joint account with two pots: £300 split 2:1

Employment incomes of £2,000 and £1,000 give Nick and Immy these allocations:

| Allocation | Nick | Immy | Total |
| --- | ---: | ---: | ---: |
| Direct to account | £40.00 | £20.00 | £60.00 |
| Bills pot | £100.00 | £50.00 | £150.00 |
| Savings pot | £60.00 | £30.00 | £90.00 |
| Account funding | **£200.00** | **£100.00** | **£300.00** |

After funding, Nick moves £100 and £60 into the pots; Immy moves £50 and £30. Pot movements total £240, included within the £300 account funding.

### Personal pot funded by another member

Immy owns an account. Its pot needs £100.01: Nick contributes £70.01 and Immy £30.00 using fixed funding. Account-funding requirements preserve those two contributions. Immy handles one £100.01 pot movement, whose breakdown still attributes £70.01 to Nick and £30.00 to Immy.

### Spare penny and incomplete funding

An equal split of £1.01 gives the first household adult £0.51 and the second £0.50. The displayed amounts sum to £1.01. If another item in that account cannot be allocated, these known shares remain in the comparison, but the account has no actionable steps until the unresolved funding is corrected.

## Implementation, compatibility and validation

`buildTransferInstructions(document, month)` is a pure projection in `src/domain/transferInstructions.ts`. It reuses the validated transfer matrix projection and existing `budgetTransfers` calculations. It returns per-account funding requirements, pot movements, issues, separate totals and an actionable `steps` list with funding before pot movements. Each step includes its month, kind, actor, source/destination, amount, item/contributor breakdown, dependencies and readiness status.

IDs encode kind, month, account, contributor/actor and, for pot movements, pot. They remain stable when amounts change, but do not imply continuity of completion state. Amounts, names and statuses are recomputed from current inputs. Withheld unresolved-owner pot steps can have a null actor; actionable steps always have an actor.

No schema version, database, local storage, migration or saved budget is changed. Existing matrix row identities and Plan navigation are preserved. The personal checklist, automation flags/exclusion, partial payments, completion history and changed-payment handling remain deferred to later roadmap items.

Automated scenarios cover the examples above, all funding rules, annual conversion, zero values, missing ownership, invalid references, unresolved contributions, independent account readiness, non-owner joint contributors, inherited months, income changes, deterministic IDs, immutable inputs, exact matrix sums and personal-account movement wording. Run `npm run check` for lint, tests, type checking and production build. Visual inspection covers the running app in Device Hub and narrow/mobile and desktop Safari previews; exact amounts must remain readable with all columns reachable.

### Verification results

`npm run check` passed: 176 tests across 19 files, lint, type checking and production build. Inspected the live local app on iPhone 17 in Device Hub (iOS 27.2), desktop Safari, and Safari responsive previews at 390 × 932 and 375 × 932. Verified exact overview shares, account/direct/pot reconciliation, joint pot-handler notes and matrix total-column access. The matrix now uses 60-pixel keyboard steps so an intermediate contributor amount can be revealed beside the frozen destination column; other grouped tables retain their default step. No budget edits or deletions were submitted during inspection.
