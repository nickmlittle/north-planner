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

1. **Persisted inputs and facts** — household/person identities, account classification/ownership, dated balance observations, opening history, dated earnings and pension arrangements, budget templates and monthly overrides, goals/reservations, typed future/planning events, tax rule versions and scenario overrides. These have stable IDs and are saved.
2. **Persisted records of events** — recorded contributions and (if supported) transactions are dated observations, not plans. Opening tax-year history is persisted separately from later contribution records.
3. **Derived outputs** — payday transfer totals/breakdowns, available-to-allocate budget, tax-year progress, net worth and Future opening/projected balances. Recompute these from inputs and events; do not persist a separately editable copy. A cached result, if ever added for performance, is disposable and must be reproducible from the persisted inputs.

Amounts should be stored in integer minor units (GBP pence), with currency explicit. Existing forecasts use real 2026 GBP; a record should state nominal/real basis and price year where projection amounts depend on it. Dates are ISO calendar dates. A `TaxYear` stores explicit UK tax-year start and end dates (for example, 2026-04-06 through 2027-04-05) and a ruleset; callers must not infer it from a calendar-year label. Boundary inclusivity/time-zone handling is still open for implementation.

### Proposed records

| Record | Important fields and relationships | Ownership boundary |
|---|---|---|
| `Household` | `id`, `name`, `baseCurrency`, `createdAt`; contains people and planning records | One shared planning space. An authenticated user may have access to it; access grants should be separate from financial ownership. |
| `Person` | `id`, `householdId`, `name`, `dateOfBirth`, `role` (`adult`, `child`, etc.) | A household member, not automatically an account owner or contributor. |
| `Account` | `id`, `householdId`, `name`, `classification` (`asset` or `liability`), `assetKind?` (`cash`, `cashISA`, `investmentISA`, `pension`, `property`, other), `liabilityKind?` (`mortgage`, loan, other), `propertyId?`, `provider?`, `currency`, `ownerPersonIds[]` (assets), `borrowerPersonIds[]` (liabilities), `asOfBalanceId?`, `accessRules?` | One asset or liability with explicit classification. A mortgage is a liability; `propertyId` links it to the property asset it secures. Joint asset owners and liability borrowers are explicit and distinct. A linked liability is not netted into or duplicated as part of property value. |
| `BalanceObservation` | `id`, `accountId`, `asOfDate`, `amountMinor`, `basis` (`statement`, `estimate`, `user-entered`), `source?` | A dated fact for an account; multiple observations can be retained. Current balance is the latest applicable observation, not a second mutable total. |
| `EarningArrangement` | `id`, `personId`, `kind`, `validFrom`, `validTo?`, salary/day rate/days/working fraction, optional annual gross override, `contributionArrangementIds[]` | A dated work/income plan. One current arrangement can be edited without overwriting past periods. |
| `PensionArrangement` | `id`, `personId`, `pensionAccountId?`, employee/employer rates or amounts, `treatment`, `validFrom`, `validTo?`, `continueAfterWorkOptional` | Separates an account's balance from a future contribution instruction. Actual payments are separate records. |
| `BudgetTemplate` | `id`, `householdId`, `currency`, `cadence: monthly`, `effectiveFrom`, `effectiveTo?` | Reusable default plan, independent of a particular calendar month's actuals. |
| `BudgetItem` | `id`, `templateId`, `name`, `monthlyAmountMinor`, `purpose`, `fundingRule`, `destinationAccountId?`, `destinationPotId?`, `goalId?`, `active` | One instruction for an allocation. Destination does not determine purpose; a pot is not itself a spend. |
| `BudgetMonth` / `BudgetOverride` | `id`, `householdId`, `yearMonth`, `budgetItemId`, optional amount/name/purpose/funding/destination override | A dated exception to the template. Missing override fields inherit from the template. Actual transactions are outside this proposal's agreed scope. |
| `FundingRule` | Inline tagged value on an item: `proportionalTakeHome`, `equal`, `custom`, or `singlePerson`; includes person IDs and custom weights/amounts as needed | Splits an item's obligation among contributors. Does not change account ownership. Normalize generated shares to pennies deterministically. |
| `PaydayRule` | `id`, `householdId`, person/payday schedule or date rule, source account and routing preferences | Persisted routing inputs only. The per-payday amounts and transfer/pot breakdowns are derived from this rule and active budget items; do not persist generated totals as another plan. |
| `ContributionRecord` | `id`, `contributors[]` (`personId`, `amountMinor`), `accountId`, `date`, `amountMinor`, `source` (`payroll`, `transfer`, `manual`), `kind: recorded`, optional `allowancePersonId?`, goal/reference | A recorded contribution names who funded it and the destination account. Where it qualifies against an allowance, `allowancePersonId` is resolved under the destination account's legal holder and applicable tax rules; funding attribution does not determine the allowance user. A planned contribution is a `BudgetItem`/typed plan, not a recorded contribution. Returns and internal routing are not contributions. |
| `OpeningTaxYearHistory` | `id`, `personId`, `taxYearId`, `allowanceType`, `usedMinor`, `asOfDate`, `basis` (`provider-reported`, `user-entered`, `imported`) | Persisted opening usage for the person whose allowance applies, covering qualifying subscriptions before the tracking cutoff. Separate from contribution records after that cutoff. |
| `TaxYear` | Stable ID such as `GB-2026-27`, `startDate`, `endDate`, ruleset/version reference | Persisted/versioned period definition; UK tax-year boundaries and allowance rules are not inferred from calendar-year labels. |
| `TaxYearProgress` | Derived `allowancePersonId`, `taxYearId`, `allowanceType`, `limitMinor`, opening history plus qualifying post-cutoff recorded contributions attributed to that allowance user | Derived per allowance holder. Plans are shown separately and do not consume actual progress. Do not persist the computed total as an independent input. |
| `Goal` | `id`, `householdId`, `name`, `kind`, `targetAmountMinor?`, `targetDate?`, `priority`, `status`, `ownerPersonIds[]`, `reservationPolicy` | A target and optional claim on funds, not another asset/account. Goals can link to contributions and budget items. |
| `GoalReservation` | `id`, `goalId`, `accountId`, `potId?`, `amountMinor`, `asOfDate`, `status` | A designation against an existing asset and its planned goal claim. Eligibility to earmark and accessibility for a particular spending date are separate attributes. It never changes the account balance or net worth and may be backed only once. |
| `Scenario` | `id`, `householdId`, `name`, `baseVersion?`, `overrides[]` | Named what-if branch. Overrides reference a source record and field/value or create scenario-local records; they do not silently mutate baseline facts/plans. |
| Existing typed planning records | Use the existing domain shapes where possible: `PlanningAssumptions`, `IncomePeriod`, `PensionContributions`, `TaxRules`, `MortgagePlan`, `PropertyMove`, `ChildEvent`, `SpendingEvent`, `PurchaseEvent`, and `FinancialEvent`/`LifeEvent`; give persisted records stable IDs and effective dates. A `Scenario` selects baseline values plus explicit typed overrides/events. | Persisted plan inputs with clear meaning and validation. Avoid a catch-all `FutureAssumption` record: work, mortgage, property, child, spending and purchase changes have different fields and should retain typed structures. |

`Pot` should be a sub-ledger/bucket under an `Account`, with `id`, `accountId`, `name` and optional provider identifier. It is not a second cash asset. A pot's displayed balance is a partition of its parent account balance; if provider balances do not reconcile, show the discrepancy rather than adding pot and account values together. A mortgage liability explicitly links to its secured property via `propertyId`; account-level net worth sums assets less liabilities once.

`TaxYearProgress`, payday transfers, available budget, net worth and Future projections are derived outputs, not persisted records. Persist their source inputs/events and separately persist `OpeningTaxYearHistory`.

### Balance and contribution cutoffs

Every balance observation is authoritative for its account **through its `asOfDate` cutoff**. When producing a Future opening balance, start from the latest selected observation and apply only account-affecting planned or recorded events strictly after that cutoff. Do not roll any contribution, transfer, purchase or return already reflected on or before that observation into the opening balance again. If an observation is a statement balance at close of business, the cutoff means end-of-day in its stated timezone; use one consistent timestamp convention. Reconciliation/import should link or mark contribution events reflected by an observation where possible, but the cutoff rule still prevents replay when the event is not linked.

Tax-year progress has its own cutoff. Persist `OpeningTaxYearHistory` with a precise `asOfDate` and used amount that includes qualifying contributions through that date. Add only qualifying recorded contributions after that tax-history cutoff and through the selected tax-year progress date. A contribution before or on the opening-history cutoff is not added again. An account balance observation does not establish tax allowance use; contribution records/opening history do. These two cutoffs can differ because an asset balance and an allowance ledger answer different questions. Reconcile overlapping records by event ID/date/reference, never by adding the whole balance delta as if it were contributions.

### Relationships at a glance

```text
Household ──< Person
    ├──< Account (asset/liability classification)
    │       ├──< BalanceObservation
    │       ├── secures property -> Property Account (for mortgage liabilities)
    │       └──< Pot
    ├──< BudgetTemplate ──< BudgetItem ──< BudgetOverride (month)
    │                         ├── destination Account/Pot
    │                         ├── funding shares -> Person (Contributor)
    │                         └── optional Goal
    ├──< Goal ──< GoalReservation -> existing Account/Pot
    ├──< ContributionRecord -> contributor Person(s) + destination Account + allowance person (when applicable)
    ├──< OpeningTaxYearHistory -> allowance-holder Person + TaxYear
    └──< Scenario ──< typed planning/event overrides

Person ──< EarningArrangement ──< PensionArrangement -> pension Account
Budget items + payday rules ──> payday transfer totals/breakdowns (derived)
OpeningTaxYearHistory + qualifying ContributionRecords ──> TaxYearProgress (derived)
```

## Worked example: Nick funds Imogen's ISA toward a house move

This illustrates how the same records feed Budget, transfers, tax-year progress, Goals and Future. Numbers are examples only. Assume an ISA subscription is attributed to its account holder, Imogen, for her allowance; Nick is recorded as the contributor/funder. Actual eligibility and subscription rules must use the applicable tax rules and remain an implementation decision.

Persisted inputs and events:

```json
{
  "people": [
    {"id":"p-nick","name":"Nick","role":"adult"},
    {"id":"p-imogen","name":"Imogen","role":"adult"}
  ],
  "accounts": [
    {"id":"a-nick-current","classification":"asset","assetKind":"cash","name":"Nick current account","ownerPersonIds":["p-nick"]},
    {"id":"a-imogen-current","classification":"asset","assetKind":"cash","name":"Imogen current account","ownerPersonIds":["p-imogen"]},
    {"id":"a-imogen-isa","classification":"asset","assetKind":"investmentISA","name":"Imogen stocks and shares ISA","ownerPersonIds":["p-imogen"]},
    {"id":"a-home","classification":"asset","assetKind":"property","name":"Current home","ownerPersonIds":["p-nick","p-imogen"]},
    {"id":"a-mortgage","classification":"liability","liabilityKind":"mortgage","propertyId":"a-home","borrowerPersonIds":["p-nick","p-imogen"]}
  ],
  "balanceObservations": [
    {"id":"bo-isa-apr1","accountId":"a-imogen-isa","asOfDate":"2026-04-01","amountMinor":1000000,"basis":"provider-reported"}
  ],
  "openingTaxYearHistory": [
    {"id":"oh-imogen-isa-2627","personId":"p-imogen","taxYearId":"GB-2026-27","allowanceType":"ISA","usedMinor":0,"asOfDate":"2026-04-05","basis":"provider-reported"}
  ],
  "budgetItems": [
    {"id":"bi-isa-gift","name":"Nick funding Imogen ISA","monthlyAmountMinor":30000,"purpose":"saving","fundingRule":{"kind":"singlePerson","personId":"p-nick"},"destinationAccountId":"a-imogen-isa","goalId":"g-house-move"},
    {"id":"bi-holiday-pot","name":"Holiday pot funding","monthlyAmountMinor":20000,"purpose":"saving","fundingRule":{"kind":"singlePerson","personId":"p-imogen"},"destinationAccountId":"a-imogen-current","destinationPotId":"pot-holiday","goalId":"g-holiday"}
  ],
  "taxYear": {"id":"GB-2026-27","startDate":"2026-04-06","endDate":"2027-04-05"},
  "recordedContribution": {"id":"cr-isa-apr","contributors":[{"personId":"p-nick","amountMinor":30000}],"accountId":"a-imogen-isa","allowancePersonId":"p-imogen","date":"2026-04-10","amountMinor":30000,"source":"transfer","kind":"recorded"},
  "goals": [
    {"id":"g-house-move","name":"House move","targetAmountMinor":5000000,"targetDate":"2030-06-01"},
    {"id":"g-holiday","name":"Holiday","targetAmountMinor":120000,"targetDate":"2026-12-01"}
  ],
  "goalReservation": {"id":"gr-house-isa","goalId":"g-house-move","accountId":"a-imogen-isa","amountMinor":1000000,"asOfDate":"2026-04-30","status":"active"},
  "propertyMove": {"id":"move-2030","kind":"property-move","year":2030,"purchasePriceMinor":75000000,"enabled":true}
}
```

For the April payday, Budget derives (it does not save as another input) one £300 planned allocation contributed by Nick. The transfer view derives Nick's £300 external transfer to the ISA destination; if routing first through Nick's current account or a Monzo pot, it shows the legs, identifies internal legs, and counts the allocation only once. No transfer total is itself an additional contribution record.

When the subscription is made on 10 April, the user/import records `cr-isa-apr` once, with Nick as contributor and Imogen's ISA as destination. The applicable ISA progress is for Imogen, the account holder/subscriber whose allowance is used: opening history was £0 through 5 April, plus £300 qualifying recorded contributions after that cutoff, so displayed progress is £300. The planned £300 shown by Budget is not counted again. Nick's role as funder does not transfer the allowance to him. This attribution is the proposed default; gifts funded by another person still follow the applicable tax ruleset.

Suppose a later provider-reported observation on 30 April shows Imogen's ISA at £10,350. The balance includes the 10 April £300 subscription and £50 market movement from the £10,000 opening value. The £300 contribution remains in the contribution ledger for tax-year progress and provenance, but Future must not add it on top of the 30 April balance: that observation becomes the opening balance at its cutoff. Future applies only events strictly after 30 April, then projected returns under the chosen investment assumptions. The £50 movement is not a contribution. For tax progress, the separate 5 April opening-history cutoff remains in force; the April contribution is still counted once even though it is already included in the account's 30 April balance.

The house-move goal may reserve £10,000 of the ISA as an **earmark** if that account type is reservation-eligible. It remains invested, remains part of net worth, and is not £10,000 guaranteed purchase cash. The goal view shows both earmarked value and liquidity/access constraints; the Future house-move scenario applies explicit sale/withdrawal and market-value assumptions at the planned date. The ISA is not treated as cash merely because it is reserved. The linked mortgage liability has `propertyId: a-home`, so Future can project property and debt separately and calculate equity once.

At the 30 April Future cutoff, suppose latest observations are Nick current £2,000, Imogen current £1,500, Imogen ISA £10,350, current home £850,000 and its linked mortgage liability £446,000. Future opening balances use those observations as-is: £10,350 for the ISA (including the April subscription), not £10,650. The £10,000 ISA reservation tags a part of that £10,350 without changing it. Pot balances partition the relevant current-account balances and are not added again. Net worth derives as assets less the linked mortgage liability; the property move later changes scenario balances under typed `PropertyMove` and financing assumptions.

At the same time, holiday funding is represented by the recurring `bi-holiday-pot` saving allocation into `pot-holiday`. A planned holiday purchase/spend is a separate typed purchase/spending event linked to that pot/goal and dated for the trip. The planned event reduces the pot projection once on its spend date; the earlier £200 monthly pot funding is internal saving/earmarking, not spending. Whether actual transactions are captured or reconciled against this plan remains unresolved.

## Transfers, spending, saving and returns

An account-to-account transfer is a movement of existing money: debit source and credit destination by equal amounts, with no income, expense, saving, or net-worth change at household level. A transfer into a pot is an internal partition movement, also with no change to account total. Use transfer events/legs (or a generated transfer plan) to describe routing; don't put them into spending totals.

Spending is an outflow to a merchant/service and reduces cash and net worth. Saving is an allocation toward an owned account/investment: it reduces unallocated cash and increases the destination asset, but is not consumption. Debt repayment is split by principal versus interest: principal reduces cash and liability together; interest is spending. Investment returns are valuation changes on an asset, not contributions, transfers, or budget saving. These distinctions let Budget explain cash flow while Future projects balances without counting the same pound twice.

For payday generation, derive and group funding by contributor and external destination. These totals and per-person/pot breakdowns are outputs from Budget items, funding rules and payday dates, not independently persisted plans. A transfer from Nick's account to a joint account is a funding transfer; distributions from that account into Monzo pots are internal breakdowns. Display both routing levels if useful, but reconcile household inflow/outflow once. A derived transfer should carry source, destination, amount, contributor, purpose and optional goal IDs so downstream views can classify it without guessing from labels.

Planned pot spending has two persisted inputs: a `BudgetItem` with `purpose: saving` that accumulates the monthly amount in the destination pot, and a separately dated typed `PurchaseEvent` or `SpendingEvent` that represents the eventual planned outflow and references the pot/goal. During projection, pot funding increases the pot partition of the existing account; it does not increase total household assets. On the planned spend date, deduct the purchase from the pot/account once and reduce the corresponding goal reservation once. Do not also encode that same purchase as a negative pot contribution or generic transfer. Detailed actual-spending capture/reconciliation remains unresolved.

## Goal reservations, eligibility and access constraints

The source of truth for wealth is the account balance observation. A goal reservation is a claim on a portion of an existing asset, never a new account or asset. **Reservation eligibility** asks whether the product permits earmarking an asset for a goal; **spending accessibility** asks whether and when that asset can fund the goal's cash outflow, under which rules, costs and risks. These are different questions. Calculate:

```text
unreserved(account) = max(0, current eligible balance - active reservations against that account)
unreserved household cash = sum(unreserved(account))
```

Validate that active reservations against one account do not exceed its observed/projected value available for earmarking. A reservation tied to a pot must also be bounded by the pot's share of its parent account, and pot-level plus account-level reservations must be checked in one shared pool. A transfer between pots moves the backing allocation; it does not release and recreate wealth. A spent goal amount releases/reduces its reservation and records the planned/actual spending once. Goal progress may show contributions and reserved value, but those are views over balances and contribution events, not extra additions to net worth.

Investment ISA assets may be earmarked for a future goal while remaining exposed to market value changes and possible sale/settlement timing. Show their market-valued balance and assumptions, not a guaranteed cash amount. Locked pensions have a separate access constraint and normally cannot back a near-term spend reservation; their access age/rules remain explicit on the account/arrangement. Cash accounts can be accessible but may still be jointly owned or otherwise restricted. The eligible asset types, access haircuts/settlement rules and treatment at a future goal date are open decisions.

## Screen read/edit boundaries

| Screen/view | Reads | Edits |
|---|---|---|
| Onboarding: household | Household, People | Household name; people identity, date of birth and role. Create/update stable IDs. |
| Onboarding: income and pensions | People, EarningArrangement, PensionArrangement, related Account/BalanceObservation | Current dated work and pension instructions; account type and current balance observation. Do not overwrite prior dated arrangements when introducing a new effective period. |
| Onboarding: savings/home | Account, Pot, BalanceObservation, property/mortgage accounts, ownership links | Create/update account facts and dated balance. Record owners/borrowers separately from contributors. |
| Onboarding: spending/review | BudgetTemplate, BudgetItem, child-related Person and typed child cost/event records | Initial baseline and known regular allocations, household composition. Onboarding is a first editor for these same records, not a separate snapshot database. |
| Household | Household, Person, Account, latest BalanceObservation, liability/property links | Household details, people, account ownership, account metadata and balance observations. It may add a dated correction rather than mutate history. |
| Budget | BudgetTemplate, BudgetItem, BudgetMonth/Override, funding rules, Accounts/Pots, Goals, payday rules | Monthly planned amounts, purposes, contributors/shares, destinations, optional goal, month override and transfer routing inputs. Payday transfer amounts and breakdowns are derived outputs. Actual-spending data only if separately agreed. |
| Tax-year progress | Person/allowance holder, TaxYear and versioned rules, qualifying recorded ContributionRecords, OpeningTaxYearHistory | Opening usage/history where known, and manual actual contribution records only if product decides to support them. Displayed progress is derived; planned amounts remain separate. |
| Goals | Goals, GoalReservations, qualifying ContributionRecords, accounts/pots and latest balances | Goal target/date/status/priority, reservation allocation and links to budget items/contributions. Editing a reservation cannot edit account balance. |
| Future | People, classified asset/liability accounts and dated balances, earnings/pension arrangements, budget plans, goal events/reservations, tax rules, typed planning/event records | Scenario-local typed assumptions/overrides, work/property/retirement changes. Opening and projected balances are derived outputs. Saving a scenario does not rewrite Household facts or the baseline budget. |

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
| `snapshot.mortgageStatus`, `mortgageBalance`, `rate`, `term`, `borrowers` | Mortgage debt and loan assumptions attached implicitly to current home | Liability-classified mortgage `Account`, balance observation, borrower links and required `propertyId` to the secured property asset; dated mortgage terms in the existing typed mortgage plan. Preserve zero versus unknown. |
| `snapshot.spending`, `spendingFrequency` | One lifestyle spending baseline; annualized by forecast helper; excludes separately modelled child costs, tax, pension and mortgage | Initial `BudgetItem` purpose `spending` with monthly amount, plus category/coverage notes. Annual input converts to annual/12; keep original input in migration audit if non-divisible to pennies. |
| `snapshot.people[].childCost/childFrequency/futureCosts`, child role | Current child cost and future age-band projections embedded on person | Child `Person`; current spending `BudgetItem`; existing typed `ChildEvent`/child cost age-band structure. Avoid making a child a budget contributor/account owner by default. |
| `planning` | Return, horizon, FIRE age and projection assumptions | Existing typed `PlanningAssumptions`, preserving current baseline values and units. |
| `tax` | Tax rates/rules used for estimated take-home, not tax-year actual progress | Versioned tax rules referenced by Future and take-home estimates. Does not itself establish contribution progress. |
| `mortgageExtras` | Overpayment, inflation and refinance plan inputs | Existing typed `MortgagePlan` linked to mortgage liability and secured property. |
| `moves[]` | Dated property move plans and enabled/scenario-like assumptions | Existing typed `PropertyMove` linked to property/liability accounts; `Scenario` can override its fields. Preserve IDs and distinguish baseline accepted plan from unsaved what-if draft. |
| `allowances{personId: amount}` | Per-person annual ISA allowance assumption | Versioned tax-year allowance limit/rule for that person; computed progress is derived and any opening-used history is a separate `OpeningTaxYearHistory` record. Do not migrate a limit as though it were used amount. |
| `childEvents[]` | Future child events, age-band costs and work adjustments | Existing typed `ChildEvent`; link work adjustments to person and effective period. |
| `spendingEvents[]` | Future recurring spending changes | Existing typed `SpendingEvent`, distinct from monthly Budget template and actuals. |
| `purchaseEvents[]` | Future purchases; some purchase costs are converted into spending events by `purchaseSpending` | Existing typed `PurchaseEvent` with explicit purpose/funding reference. Do not classify transfer to a purchase pot as purchase spending. |
| `snapshot` + `incomeTimeline` reconciliation | `withSnapshot` mirrors current pay/contribution inputs into timeline; legacy `null` timeline means derive periods from snapshot, while a populated timeline can disagree | Remove duplicate authority: current arrangement is canonical and the projection reads it. Migration precedence must be decided (see open questions) and conflicts retained for user resolution/audit. |

Current domain types already have useful concepts (`Person`, assets with `ownerIds`, `Mortgage.borrowerIds`, annual `IncomePeriod`, `PensionContributions`, tax rules, planning assumptions and event IDs), but `toForecastInput` reconstructs those from onboarding strings and hard-codes the 2026 start year. The proposal should be adapted to those tested calculations incrementally after review; this document does not prescribe an immediate rewrite of the forecast engine.

## Unresolved decisions

These are intentionally separate from agreed requirements; KAN-53 proposes a data shape but does not claim decisions on these points:

- **Take-home basis and split timing:** whether proportional funding uses current estimated take-home, manually entered take-home, or a choice per household; how to handle variable/irregular pay and changes during a month.
- **Actual tracking:** whether actual transactions/spending are in scope, imported, manually entered, or omitted. Do not imply that planned amounts are actuals.
- **Account/pot detail:** whether to support institution sync, multiple ISA/pension accounts from launch, joint account beneficial shares, balances per pot, and reconciliation/rounding rules.
- **Contribution and tax history:** supported allowance types, treatment of transfers/gifts funded by another person, qualifying date/settlement semantics, and how refunds/corrections affect progress. The proposal keeps opening-used history separate from later records; whether to import detailed prior history or accept an opening figure remains open.
- **Tax year rules:** the requirement is UK tax-year progress; confirm boundary inclusivity/time-zone handling for the explicit 6 April/5 April dates, jurisdiction/rule versions and allowance data ownership before implementation.
- **Budget cadence and paydays:** monthly template is agreed, but confirm calendar-month boundary, split months, payday generation schedule, partial/extra paydays and whether recommendations become user-approved instructions.
- **Goal reservations:** which asset types are eligible; whether reservation is manual, suggested or automatic; priority when reservations exceed funds; how pot transfers and already-recorded goal spending release a reservation.
- **Saving and Future:** when budget saving counts as planned contributions versus recorded deposits; treatment of interest/returns, internal transfers, withdrawals, and long-term destination accessibility.
- **Future model:** pension drawdown, State Pension, retirement tax, house affordability/borrowing constraints, property funding order and future contribution continuation. KAN-52 already marks these open and later tickets should resolve them explicitly.
- **Household access and legal ownership:** whether multiple signed-in users can edit one household and what account roles exist. Authentication/household access must not be mistaken for financial account ownership.
- **Migration conflict resolution:** precedence when `snapshot` and non-null `incomeTimeline` conflict; migration behavior for old records with missing owner IDs, aggregate balances, unavailable values and failed writes. Preserve old data until a validated migrated document is safely saved.

## Review boundary

This proposal meets KAN-53's design outcome and example requirements. It does not change application code, dependencies, the document schema, local storage, Supabase data, or any later KAN-52 stage. Review the record boundaries and the unresolved decisions before implementation tickets rely on them.
