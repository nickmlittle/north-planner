# Planning data model proposal (KAN-53)

**Status:** proposal for review; no application or saved-data changes are included.  
**Scope:** shared records and ownership boundaries for Household, Budget, UK tax-year progress, Goals and Future. This is the first decision task in KAN-52; later stages should wait for review of this proposal.

## Agreed requirements

These come from KAN-52 and KAN-53 and are treated as constraints for the proposal:

- Onboarding and ongoing Household editing reuse the same records.
- People, accounts, pots, dated balances, earnings and pension arrangements, budget items, contributions, goals and scenario overrides need stable IDs.
- Contributor and account owner are distinct concepts. Destination and purpose are also distinct.
- Budget items have a name, monthly amount, purpose (`spending`, `saving` or `debt repayment`), optional destination account/pot, funding rule and optional goal. Joint items default to a take-home-proportional split, with equal, custom and single-person overrides.
- Generate per-person payday transfers with destinations and Monzo pot breakdowns. Account funding and internal pot distributions must not be counted twice.
- Pot funding and eventual spending are distinct. Goal reservations remain inside account balances and cannot be assigned to two goals.
- Planned saving, recorded contributions and investment returns remain distinct; preserve old saves through explicit migrations.
- KAN-53 must define a concrete example and how an edit propagates. This change is a design proposal, not implementation.

The examples below are illustrative records, not additional product commitments.

## Proposed ownership boundaries

Use a household as the planning boundary. A signed-in account is an access credential and an **account owner** is the person legally/accountably named on a financial account; neither means “who paid for it.” The household contains people, institutions/accounts and plans. Records refer to one another by stable IDs, not embedded copies of names or balances.

The canonical data should distinguish:

1. **Facts and dated observations** — who the people are; account ownership; balance observations as of a date; actual income/contribution observations if entered.
2. **Instructions/plans** — recurring budget template and overrides, planned contributions and transfers, goal targets/reservations, future assumptions and scenario overrides.
3. **Derived views** — available-to-allocate budget, tax-year progress, net worth and Future projections. Derived values are calculated from the first two groups and are not separately editable or saved as if they were facts.

Amounts should be stored in integer minor units (GBP pence), with currency explicit. Existing forecasts use real 2026 GBP; a record should state nominal/real basis and price year where projection amounts depend on it. Dates are ISO calendar dates; UK tax year is explicitly dated 6 April through 5 April, rather than inferred from a calendar-year label.

### Proposed records

| Record | Important fields and relationships | Ownership boundary |
|---|---|---|
| `Household` | `id`, `name`, `baseCurrency`, `createdAt`; contains people and planning records | One shared planning space. An authenticated user may have access to it; access grants should be separate from financial ownership. |
| `Person` | `id`, `householdId`, `name`, `dateOfBirth`, `role` (`adult`, `child`, etc.) | A household member, not automatically an account owner or contributor. |
| `Account` | `id`, `householdId`, `name`, `kind` (`current`, `savings`, `cashISA`, `investmentISA`, `pension`, `mortgage`, `property`, other), `provider?`, `currency`, `ownerPersonIds[]`, `asOfBalanceId?`, `accessRules?` | Financial asset/liability and legal owners. Joint ownership is explicit. No balance is copied into person records. |
| `BalanceObservation` | `id`, `accountId`, `asOfDate`, `amountMinor`, `basis` (`statement`, `estimate`, `user-entered`), `source?` | A dated fact for an account; multiple observations can be retained. Current balance is the latest applicable observation, not a second mutable total. |
| `EarningArrangement` | `id`, `personId`, `kind`, `validFrom`, `validTo?`, salary/day rate/days/working fraction, optional annual gross override, `contributionArrangementIds[]` | A dated work/income plan. One current arrangement can be edited without overwriting past periods. |
| `PensionArrangement` | `id`, `personId`, `pensionAccountId?`, employee/employer rates or amounts, `treatment`, `validFrom`, `validTo?`, `continueAfterWorkOptional` | Separates an account's balance from a future contribution instruction. Actual payments are separate records. |
| `BudgetTemplate` | `id`, `householdId`, `currency`, `cadence: monthly`, `effectiveFrom`, `effectiveTo?` | Reusable default plan, independent of a particular calendar month's actuals. |
| `BudgetItem` | `id`, `templateId`, `name`, `monthlyAmountMinor`, `purpose`, `fundingRule`, `destinationAccountId?`, `destinationPotId?`, `goalId?`, `active` | One instruction for an allocation. Destination does not determine purpose; a pot is not itself a spend. |
| `BudgetMonth` / `BudgetOverride` | `id`, `householdId`, `yearMonth`, `budgetItemId`, optional amount/name/purpose/funding/destination override | A dated exception to the template. Missing override fields inherit from the template. Actual transactions are outside this proposal's agreed scope. |
| `FundingRule` | Inline tagged value on an item: `proportionalTakeHome`, `equal`, `custom`, or `singlePerson`; includes person IDs and custom weights/amounts as needed | Splits an item's obligation among contributors. Does not change account ownership. Normalize generated shares to pennies deterministically. |
| `PaydayTransferPlan` | `id`, `householdId`, `paydayRule` or dated paydays, `contributorPersonId`, `sourceAccountId?`, `allocations[]` to account/pot and purpose | A planned external account funding transfer or internal pot distribution. Generated from budget instructions; generation must be idempotent. |
| `ContributionRecord` | `id`, `personId`, `accountId?`, `goalId?`, `date`, `amountMinor`, `kind` (`planned`, `recorded`), `source` (`payroll`, `transfer`, `manual`), optional external/internal reference | A recorded contribution is an observed event. A planned contribution is an instruction. Neither is an investment return. |
| `TaxYear` | Derived ID such as `GB-2026-27`, `startDate`, `endDate`, ruleset/version reference | Defines the period boundary; UK tax-year rules and allowance values belong to versioned tax data, not budget display constants. |
| `TaxYearProgress` | `id`, `personId`, `taxYearId`, allowance type, `limitMinor`, `openingUsedMinor?`, linked qualifying `ContributionRecord` IDs or derived sum | Per-person/per-allowance progress. Derived from opening history plus qualifying recorded contributions; plans are shown separately and do not consume actual progress. |
| `Goal` | `id`, `householdId`, `name`, `kind`, `targetAmountMinor?`, `targetDate?`, `priority`, `status`, `ownerPersonIds[]`, `reservationPolicy` | A target and optional claim on funds, not another asset/account. Goals can link to contributions and budget items. |
| `GoalReservation` | `id`, `goalId`, `accountId`, `potId?`, `amountMinor`, `asOfDate`, `status` | A designation against existing liquid funds. A reservation reduces unallocated availability, never the account balance or net worth. It may be backed by an eligible balance only once. |
| `Scenario` | `id`, `householdId`, `name`, `baseVersion?`, `overrides[]` | Named what-if branch. Overrides reference a source record and field/value or create scenario-local records; they do not silently mutate baseline facts/plans. |
| `FutureAssumption` | `id`, scope (`household` or person/account), `kind`, value, `effectiveFrom`, `effectiveTo?`, `scenarioId?` | Versioned return, inflation, tax, work, property or drawdown assumptions. Scenario assumptions override baseline only within that scenario. |

`Pot` should be a sub-ledger/bucket under an `Account`, with `id`, `accountId`, `name` and optional provider identifier. It is not a second cash asset. A pot's displayed balance is a partition of its parent account balance; if provider balances do not reconcile, show the discrepancy rather than adding pot and account values together.

### Relationships at a glance

```text
Household ──< Person
    ├──< Account ──< BalanceObservation
    │       └──< Pot
    ├──< BudgetTemplate ──< BudgetItem ──< BudgetOverride (month)
    │                         ├── destination Account/Pot
    │                         ├── funding shares -> Person (Contributor)
    │                         └── optional Goal
    ├──< Goal ──< GoalReservation -> existing Account/Pot
    │       └──< ContributionRecord -> Person + optional Account
    ├──< PaydayTransferPlan -> Person + source/destination Account/Pot
    └──< Scenario ──< overrides of FutureAssumption, plans and goals

Person ──< EarningArrangement ──< PensionArrangement -> pension Account
Person + TaxYear + allowance ──> TaxYearProgress (derived + opening fact)
```

## Example data

Illustrative household: Nick and Imogen share a household plan. Nick earns £5,000/month take-home and Imogen £3,000/month take-home. The household monthly spending item is £1,600, funded proportionally to take-home: Nick £1,000, Imogen £600. Nick also contributes £300 monthly to Imogen's ISA. That contribution's **contributor** is Nick, while the ISA's **account owner** is Imogen. An ISA gift/contribution does not grant Nick ownership of Imogen's ISA.

```json
{
  "household": {"id":"hh-1","name":"Nick and Imogen","baseCurrency":"GBP"},
  "people": [
    {"id":"p-nick","householdId":"hh-1","name":"Nick","dateOfBirth":"1994-01-01","role":"adult"},
    {"id":"p-imogen","householdId":"hh-1","name":"Imogen","dateOfBirth":"1995-01-01","role":"adult"}
  ],
  "accounts": [
    {"id":"a-joint","kind":"current","name":"Joint current account","currency":"GBP","ownerPersonIds":["p-nick","p-imogen"]},
    {"id":"a-imogen-isa","kind":"investmentISA","name":"Imogen ISA","currency":"GBP","ownerPersonIds":["p-imogen"]}
  ],
  "budgetTemplate": {"id":"bt-1","cadence":"monthly","effectiveFrom":"2026-01"},
  "budgetItems": [
    {"id":"bi-living","name":"Living costs","monthlyAmountMinor":160000,"purpose":"spending","fundingRule":{"kind":"proportionalTakeHome"},"destinationAccountId":"a-joint"},
    {"id":"bi-imogen-isa","name":"Imogen ISA contribution","monthlyAmountMinor":30000,"purpose":"saving","fundingRule":{"kind":"singlePerson","personId":"p-nick"},"destinationAccountId":"a-imogen-isa","goalId":"g-home-deposit"}
  ],
  "goal": {"id":"g-home-deposit","name":"Future home deposit","targetAmountMinor":3000000,"targetDate":"2030-06-01"}
}
```

The item's owner does not follow its funding source: Nick is the contributor to the ISA allocation, Imogen owns the ISA, and the linked goal describes the purpose. If the £300 is routed to a current account first and then to the ISA, the plan has two legs but only one £300 saving allocation. The internal leg is not a second contribution.

## Transfers, spending, saving and returns

An account-to-account transfer is a movement of existing money: debit source and credit destination by equal amounts, with no income, expense, saving, or net-worth change at household level. A transfer into a pot is an internal partition movement, also with no change to account total. Use transfer events/legs (or a generated transfer plan) to describe routing; don't put them into spending totals.

Spending is an outflow to a merchant/service and reduces cash and net worth. Saving is an allocation toward an owned account/investment: it reduces unallocated cash and increases the destination asset, but is not consumption. Debt repayment is split by principal versus interest: principal reduces cash and liability together; interest is spending. Investment returns are valuation changes on an asset, not contributions, transfers, or budget saving. These distinctions let Budget explain cash flow while Future projects balances without counting the same pound twice.

For payday generation, group funding by contributor and external destination. A transfer from Nick's account to the joint account is a funding transfer; distributions from that account into Monzo pots are internal breakdowns. Display both routing levels if useful, but reconcile household inflow/outflow once. A generated transfer should carry source, destination, amount, contributor, purpose and optional goal IDs so downstream totals can classify it without guessing from labels.

## Goal reservations without double counting assets

The source of truth for wealth is the account balance observation. A goal reservation is a claim on a portion of eligible liquid assets, never a new account or asset. Calculate:

```text
unreserved(account) = max(0, current eligible balance - active reservations against that account)
unreserved household cash = sum(unreserved(account))
```

Validate that active reservations against one account do not exceed its eligible balance. A reservation tied to a pot must also be bounded by the pot's share of its parent account, and pot-level plus account-level reservations must be checked in one shared pool. A transfer between pots moves the backing allocation; it does not release and recreate wealth. A spent goal amount releases/reduces its reservation and records the actual spending once. Goal progress may show contributions and reserved value, but those are views over balances and contribution events, not extra additions to net worth. Investment ISA and pension balances should not be reservable as immediately available cash unless a future rule explicitly makes them accessible.

## Screen read/edit boundaries

| Screen/view | Reads | Edits |
|---|---|---|
| Onboarding: household | Household, People | Household name; people identity, date of birth and role. Create/update stable IDs. |
| Onboarding: income and pensions | People, EarningArrangement, PensionArrangement, related Account/BalanceObservation | Current dated work and pension instructions; account type and current balance observation. Do not overwrite prior dated arrangements when introducing a new effective period. |
| Onboarding: savings/home | Account, Pot, BalanceObservation, property/mortgage accounts, ownership links | Create/update account facts and dated balance. Record owners/borrowers separately from contributors. |
| Onboarding: spending/review | BudgetTemplate, BudgetItem, child-related person/future assumptions | Initial baseline and known regular allocations, household composition. Onboarding is a first editor for these same records, not a separate snapshot database. |
| Household | Household, Person, Account, latest BalanceObservation, liability/property links | Household details, people, account ownership, account metadata and balance observations. It may add a dated correction rather than mutate history. |
| Budget | BudgetTemplate, BudgetItem, BudgetMonth/Override, funding rules, Accounts/Pots, Goals, payday rules | Monthly planned amounts, purposes, contributors/shares, destinations, optional goal, month override and transfer routing. Actual-spending data only if separately agreed. |
| Tax-year progress | Person, TaxYear and versioned rules, qualifying recorded ContributionRecords, opening-used amount | Opening progress/history where known, and manual actual contribution records only if product decides to support them. Planned amounts remain a forecast lane. |
| Goals | Goals, GoalReservations, qualifying ContributionRecords, accounts/pots and latest balances | Goal target/date/status/priority, reservation allocation and links to budget items/contributions. Editing a reservation cannot edit account balance. |
| Future | People, accounts and dated balances, earnings/pension arrangements, budget plans, goal events/reservations, tax rules, baseline FutureAssumptions | Scenario-local assumptions, work/property/retirement changes and scenario overrides. Saving a scenario does not rewrite Household facts or the baseline budget. |

The same stable record IDs are passed between screens. Screen-specific forms can provide a simpler workflow but must write through to the shared record and display its changed value everywhere. Derived summaries should identify their source period/date and update when source records change.

## Onboarding and ongoing editing use one data set

The recommendation is a canonical record set with two entry paths: onboarding creates the minimum known records and can leave optional facts unknown; Household/Budget/Goals settings edit those exact IDs later. Completion state and UI step are workflow metadata, not another copy of financial facts. Do not persist a separate onboarding “snapshot” and then project it into an unrelated planner model.

When a person edits current salary in onboarding or the ongoing Household editor, update the same current `EarningArrangement` (or add a new effective-dated arrangement if the change is prospective). Budget take-home splits and Future then recalculate from that arrangement. When Nick changes his ISA budget allocation, Budget, payday instructions, goal contribution plan and Future read the same `BudgetItem`; Tax-year progress continues to use recorded qualifying contributions only. A current account balance edit creates a new observation, affecting Household net worth, unreserved goal capacity and Future opening balances together.

## Mapping current saved fields

Today one `AppDocument` (version 1) is persisted under local key `north.household.v1` or as one Supabase `households.document`. This proposal does not change that format now. On a future approved migration, preserve source values and IDs, convert deliberately, validate, and only replace the old document after a successful conversion; unknown or ambiguous values must remain recoverable.

| Existing field / shape | Existing meaning and caveat | Proposed destination |
|---|---|---|
| `version`, `step`, `completed` | Document schema version plus onboarding progress mixed into same JSON | Versioned migration envelope; `step`/`completed` become workflow metadata separate from financial domain records. |
| `snapshot.name` | Household display name | `Household.name` |
| `snapshot.people[].id/name/dob/role` | Stable person ID, DOB string, onboarding role | `Person.id/name/dateOfBirth/role`; preserve IDs. Convert DOB to ISO date. |
| `snapshot.people[].incomeKind/pay/frequency/days/payOverride` | Current income input; pay currently string and frequency can be monthly/yearly; `payOverride` is derived annual gross override | Current `EarningArrangement`, normalized numeric amount/cadence and explicit override source. Keep conversion precision and unknown/none distinction. |
| `incomeTimeline[]` | Dated forecast income periods with annual pay/day-rate, working fraction, override and embedded contributions | `EarningArrangement[]` by person and effective dates, with linked `PensionArrangement`; preserve each ID. |
| `snapshot.people[].pensionStatus/pension` | Pension existence plus aggregate starting DC balance, not necessarily one provider account | One or more pension `Account` records and `BalanceObservation`; if only aggregate is known, migrate as one estimated account rather than inventing provider splits. |
| `snapshot.people[].employee/employer/treatment` and timeline `contributions` | Current contribution plan and future timeline plan; not payment history | `PensionArrangement` records; actual payments only become `ContributionRecord(kind=recorded)` when separately captured. |
| `snapshot.people[].isaType/isa` | At most one aggregated ISA per adult, with balance in string form | ISA `Account` and dated `BalanceObservation`; preserve ISA type and owner. Do not invent multiple accounts. |
| `snapshot.cash[] {id,name,balance,ownerIds}`, `noCash` | Cash account-like entries and owners; `noCash` represents explicit zero versus unknown/no entries | `Account` + `BalanceObservation` + owner links. Convert explicit `noCash` to known zero only with a clear zero observation/absence marker; empty/missing stays unknown. Preserve `cash[].id`. |
| `snapshot.housing`, `homeValue`, `homeOwners` | Housing state; one current home; home value | Property `Account`/asset record and balance observation, owner links. Rent/no property is household situation, not a zero-valued asset. |
| `snapshot.mortgageStatus`, `mortgageBalance`, `rate`, `term`, `borrowers` | Mortgage debt and loan assumptions attached implicitly to current home | Mortgage liability `Account` and balance observation; borrower links; dated mortgage terms as an arrangement/assumption. Preserve zero versus unknown. |
| `snapshot.spending`, `spendingFrequency` | One lifestyle spending baseline; annualized by forecast helper; excludes separately modelled child costs, tax, pension and mortgage | Initial `BudgetItem` purpose `spending` with monthly amount, plus category/coverage notes. Annual input converts to annual/12; keep original input in migration audit if non-divisible to pennies. |
| `snapshot.people[].childCost/childFrequency/futureCosts`, child role | Current child cost and future age-band projections embedded on person | Child `Person`; current spending `BudgetItem`; future dated/age-band `FutureAssumption`. Avoid making a child a budget contributor/account owner by default. |
| `planning` | Return, horizon, FIRE age and projection assumptions | `FutureAssumption` records, preserving current baseline values and units. |
| `tax` | Tax rates/rules used for estimated take-home, not tax-year actual progress | Versioned tax rules referenced by Future and take-home estimates. Does not itself establish contribution progress. |
| `mortgageExtras` | Overpayment, inflation and refinance plan inputs | Future assumptions/scenario events linked to mortgage account. |
| `moves[]` | Dated property move plans and enabled/scenario-like assumptions | `Scenario`/future event overrides linked to property/accounts. Preserve IDs and distinguish baseline accepted plan from unsaved what-if draft. |
| `allowances{personId: amount}` | Per-person annual ISA allowance assumption | Versioned tax-year allowance rule/progress keyed by person and tax year; treat value as a rule/limit, not as contributed amount. |
| `childEvents[]` | Future child events, age-band costs and work adjustments | Future event/assumption records; link work adjustments to person and effective period. |
| `spendingEvents[]` | Future recurring spending changes | Future dated planned spending items/events, distinct from monthly Budget template and actuals. |
| `purchaseEvents[]` | Future purchases; some purchase costs are converted into spending events by `purchaseSpending` | Goal or planned purchase event with explicit purpose and funding source. Do not classify transfer to a purchase pot as purchase spending. |
| `snapshot` + `incomeTimeline` reconciliation | `withSnapshot` mirrors current pay/contribution inputs into timeline; legacy `null` timeline means derive periods from snapshot, while a populated timeline can disagree | Remove duplicate authority: current arrangement is canonical and the projection reads it. Migration precedence must be decided (see open questions) and conflicts retained for user resolution/audit. |

Current domain types already have useful concepts (`Person`, assets with `ownerIds`, `Mortgage.borrowerIds`, annual `IncomePeriod`, `PensionContributions`, tax rules, planning assumptions and event IDs), but `toForecastInput` reconstructs those from onboarding strings and hard-codes the 2026 start year. The proposal should be adapted to those tested calculations incrementally after review; this document does not prescribe an immediate rewrite of the forecast engine.

## Unresolved decisions

These are intentionally separate from agreed requirements; KAN-53 proposes a data shape but does not claim decisions on these points:

- **Take-home basis and split timing:** whether proportional funding uses current estimated take-home, manually entered take-home, or a choice per household; how to handle variable/irregular pay and changes during a month.
- **Actual tracking:** whether actual transactions/spending are in scope, imported, manually entered, or omitted. Do not imply that planned amounts are actuals.
- **Account/pot detail:** whether to support institution sync, multiple ISA/pension accounts from launch, joint account beneficial shares, balances per pot, and reconciliation/rounding rules.
- **Contribution and tax history:** opening-used amounts versus dated history, supported allowance types, treatment of transfers/gifts into another person's ISA, qualifying date/settlement semantics, and how refunds/corrections affect progress.
- **Tax year rules:** the requirement is UK tax-year progress; confirm exact 6 April/5 April boundary interpretation, jurisdiction/rule versions and allowance data ownership before implementation.
- **Budget cadence and paydays:** monthly template is agreed, but confirm calendar-month boundary, split months, payday generation schedule, partial/extra paydays and whether recommendations become user-approved instructions.
- **Goal reservations:** which asset types are eligible; whether reservation is manual, suggested or automatic; priority when reservations exceed funds; how pot transfers and already-recorded goal spending release a reservation.
- **Saving and Future:** when budget saving counts as planned contributions versus recorded deposits; treatment of interest/returns, internal transfers, withdrawals, and long-term destination accessibility.
- **Future model:** pension drawdown, State Pension, retirement tax, house affordability/borrowing constraints, property funding order and future contribution continuation. KAN-52 already marks these open and later tickets should resolve them explicitly.
- **Household access and legal ownership:** whether multiple signed-in users can edit one household and what account roles exist. Authentication/household access must not be mistaken for financial account ownership.
- **Migration conflict resolution:** precedence when `snapshot` and non-null `incomeTimeline` conflict; migration behavior for old records with missing owner IDs, aggregate balances, unavailable values and failed writes. Preserve old data until a validated migrated document is safely saved.

## Review boundary

This proposal meets KAN-53's design outcome and example requirements. It does not change application code, dependencies, the document schema, local storage, Supabase data, or any later KAN-52 stage. Review the record boundaries and the unresolved decisions before implementation tickets rely on them.
