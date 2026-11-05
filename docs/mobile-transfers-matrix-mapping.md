# Mobile Transfers matrix — Phase 1 mapping contract

Status: implemented foundation, ready for review. This is the Phase 1 deliverable for [the implementation plan](mobile-transfers-matrix-plan.md). It does not approve the mapping, start Phase 2, or approve a visual design.

## Scope and entry point

`buildTransferMatrixModel(document, month)` in `src/domain/transferMatrix.ts` is a pure, read-only projection. It accepts the current `BudgetDocument` and selected `YYYY-MM` month. It returns contributor metadata, receiving-account rows, their allocations and item detail, household totals, and effective-budget context. The Phase 2 opt-in preview consumes this model.

The adapter reuses `decodeBudgetDocument` as its input boundary. Unsupported documents throw `Transfer matrix requires a valid budget document` before calculation. In particular, missing accounts, pots or categories, unknown household contributors, duplicate source IDs and invalid fixed contributions must not produce a plausible partial matrix. This is an explicit rejection, not a repair or migration. The adapter does not add document validation rules. A later caller must handle this failure and preserve access to the existing view.

The output interfaces expose readonly properties and arrays, and the adapter copies row metadata and contributions. They are not runtime-frozen objects. Input documents, snapshots, income sources and calculated amounts are not mutated.

## Trace from the selected month

1. Resolve items with `resolveBudget(budget, month)`, just as `MonthlyBudget.tsx` does. Use its latest snapshot at or before the month, or the imported baseline before the first snapshot. An explicit empty snapshot stays empty.
2. Call `budgetTransfers(budget, household.adults.map(person => person.id), month, resolved.items)`. Income is resolved for the selected month even when budget items are inherited from an earlier snapshot. Contributor order is household adult order, which also determines equal-fraction penny tie breaks in the existing calculation.
3. Join each calculated account to `budget.accounts` by `accountId`. Join each calculated item to the resolved item by `id` to recover its destination, funding and category. Join pot destinations to `budget.pots`, then to their actual parent account.
4. Preserve the calculation's account, direct-account, pot and per-person amounts. Item allocated amounts are sums of the calculated item's contributor cells; the validated input boundary ensures contributions belong to the supplied household. Do not calculate funding shares again.
5. Return `month`, `sourceMonth`, `nextBudgetMonth`, `hasExplicitBudget` and `importedBaseline`. `hasExplicitBudget` follows the resolver: it means a snapshot exists at or before the month, not necessarily in that exact month. `sourceMonth === month` identifies that case.

## Row contract and identity

| Row kind | Source and identity | Meaning | Children |
| --- | --- | --- | --- |
| `account` | Actual `BudgetAccount.id`, also exposed as `accountId` | Total planned contributions arriving at this receiving account | Direct allocation, if present, followed by pots |
| `direct-allocation` | Account ID, also exposed as `accountId` | Items going directly to that account, outside its pots | Items whose destination is that account |
| `pot` | Actual `BudgetPot.id`, also exposed as `potId` and parent `accountId` | Allocation within a receiving account; not an additional external transfer | Items whose destination is that pot |
| `item` | Resolved `BudgetItem.id`, also exposed as `itemId` | One budget purpose and its calculated contributor split | None |

Row IDs encode the tuple `[row kind, source ID]` with `JSON.stringify`. They do not depend on labels, amounts, position, selected month or contributor names. Distinct kinds cannot collide when they share a source ID. An item's row ID survives a destination change; a pot keeps its ID if its parent account changes. These are current-view identities, not historical versions of the source records.

Account metadata includes name, provider, account type and owner IDs. Ownership describes the receiver; it does not restrict who contributes. Use existing `budgetLabels.ts` helpers for future display labels and duplicate-label disambiguation. The adapter does not create labels by matching names.

The adapter retains calculation account order (first occurrence in resolved items), direct-before-pots order, pot order from `budget.pots`, and resolved item order within each allocation. Presentation sorting remains a later view concern and must keep rows attached to their account IDs.

## Destination, category and purpose

- **Destination** is exactly one account or pot per item. A pot resolves to exactly one actual receiving account. Every mapped item therefore appears once under a single allocation.
- **Category** classifies an item independently. An allocation can contain several categories; one category can span several receiving accounts. Each item retains its category ID and name. Categories do not create additional monetary rows in this contract.
- **Purpose** is not a separate persisted field. Item names are the most precise existing purpose descriptions. Pot names can label aggregate purposes, but a pot may contain several purposes or categories. “Direct to account” describes a destination mode, not a user-defined purpose. Do not manufacture an item, pot or category correspondence from similar names.
- **Cross-account groups** such as “Personal Monzo” or “ISAs” have no explicit source mapping. This phase introduces no such subtotal. Shared provider, account type or owner is insufficient evidence that accounts form a spreadsheet group. The household total is the only cross-account financial aggregate. Owner headings can be added later as navigation without pretending to be receiving accounts.

The source spreadsheet and a confirmed spreadsheet-to-account mapping are not supplied with this plan. The example below is synthetic test data, not a claim about the household's real spreadsheet.

## Amounts, completeness and reconciliation

Every row and `totals` carry these fields:

| Field | Meaning |
| --- | --- |
| `plannedPence` | Sum of the resolved monthly item amounts under this row |
| `allocatedPence` | Existing calculated contribution total under this row |
| `byPerson` | Exact allocated pence for every household adult, including zero cells |
| `unallocatedPence` | `plannedPence - allocatedPence`; never redistributed to force reconciliation |
| `incomplete` | At least one incomplete child/item, or planned and allocated amounts differ |

All amounts remain integer pence. Account, direct and pot allocated totals come from their corresponding `budgetTransfers` fields. Item planned pence come from `BudgetItem.amountPence`, which is already normalised to a monthly contribution. Never divide an annual entry by 12 again in this model. Household allocated pence sum account totals; household contributor totals use `transfers.people[].plannedPence` (that existing field means allocated contributions, despite its name). Household planned pence match `transfers.plannedPence`.

For each supported row:

```text
allocatedPence = sum(byPerson.amountPence)
plannedPence = allocatedPence + unallocatedPence
account totals = direct allocation + pots
allocation totals = items in that allocation
household totals = accounts
```

Each equality applies to exact pence and contributor columns as appropriate. In complete cases planned and allocated totals are equal. In incomplete cases contributor columns still reconcile to allocated totals, while the separate planned total retains the unfunded amounts.

**Do not sum a flattened list of parent and child rows.** Account, allocation and item rows are alternate levels of the same money. Adding an account total to its pot or item totals double-counts it. Disclosure changes visibility, never totals. The household footer uses accounts exactly once, regardless of expanded detail.

`allocationIssue` on item rows distinguishes:

- `null`: calculated allocations equal the planned item amount, including an intentional zero.
- `unresolved-proportional`: the authoritative calculation flags a positive proportional item with no employment-income weight. Additional income alone does not resolve this case.
- `unallocated`: planned and calculated amounts differ without that flag. The current decoder permits, for example, a single-funded item with no funder, a positive custom-funded item with no positive weights, and a positive equal-funded item in an empty household. These receive no calculated allocation. The adapter identifies the gap without changing `budgetTransfers.unresolvedItemIds` or claiming a new cause in the calculation layer.

Incomplete status propagates from items to direct/pot rows, accounts and household totals. Partially allocated parents preserve their known amounts; they must not be presented as complete totals or as zero obligations. Fixed amounts remain exact. Unknown funder IDs and fixed contributions whose sum differs from the item amount are unsupported input, not a supported partial-allocation mode.

Income availability, household remaining income, person shortfalls and affordability are separate concepts already provided by `budgetTransfers`; they are not matrix destination totals. This adapter does not reinterpret them. None of its amounts or completeness fields records payments made or payment status.

## Empty and zero states

- No resolved items produces no receiving-account rows, and complete zero household totals. Contributor metadata and zero contributor totals are retained for any adults.
- An account or pot without resolved items is omitted, rather than implying an obligation. This includes unused setup accounts and unused pots.
- A resolved zero item remains visible in the model, together with its direct or pot parent and actual account. Its zero is a known planned amount, not an unresolved allocation. A zero proportional item without income is complete.
- A positive item with no allocation stays in the model with its planned amount, zero allocated amount, full unallocated amount and incomplete status.
- One adult and more than two adults use the same model. No contributors or values are hidden to fit a viewport. Visual treatment of wider households remains a review question.

## Rounding policy

Reconcile and copy only exact calculated integer pence. Use `formatGBP(pence / 100)` when an exact pounds-and-pence string is needed; do not derive it from the currently rounded summary string. The adapter returns no formatted or rounded values.

For the first prototype, exact two-decimal values are the proposed default pending density review. If whole-pound or abbreviated summaries are chosen for compactness, label them as rounded and explain that displayed cells may not sum to displayed totals. Totals must be independently formatted from exact pence, never recalculated from rounded cells. For example, three equal contributors to £1.50 each allocate £0.50: whole-pound cells display £1 each while the independently rounded household total displays £2. This is display rounding, not an allocation discrepancy. Never adjust exact contributions to make rounded strings add up.

## Representative hierarchy

The `mixedHousehold` fixture in `src/domain/transferMatrix.test.ts` uses Ada and Ben with employment income weighted 2:1 and additional income excluded from proportional weights. Both actual accounts use the same provider; they stay separate. Ada owns the personal account but Ben funds its saving item.

| Row (indentation denotes parentage) | Ada | Ben | Household allocated |
| --- | ---: | ---: | ---: |
| **Household account** | **£67.26** | **£36.88** | **£104.14** |
| ↳ Direct allocation | £66.74 | £36.34 | £103.08 |
| ↳ ↳ Rent — proportional | £66.67 | £33.34 | £100.01 |
| ↳ ↳ Fixed — fixed amounts | £0.07 | £3.00 | £3.07 |
| ↳ Bills pot | £0.52 | £0.54 | £1.06 |
| ↳ ↳ Power — equal | £0.51 | £0.50 | £1.01 |
| ↳ ↳ Reserve — custom 1:3 | £0.01 | £0.04 | £0.05 |
| **Personal account** | **£0.00** | **£0.99** | **£0.99** |
| ↳ Direct allocation | £0.00 | £0.99 | £0.99 |
| ↳ ↳ Personal saving — single funder | £0.00 | £0.99 | £0.99 |
| **Household allocated total** | **£67.26** | **£37.87** | **£105.13** |

Planned total is £105.13; unallocated total is £0.00. Bills and Saving categories coexist in the Bills pot, and Saving also appears under the personal account. There is no category subtotal to add to these totals.

In the partial fixture, employment income is removed and a further £0.11 proportional pot item is added. Planned total becomes £105.24, allocated total remains £5.12, and unallocated total is £100.12. Both joint-account allocation branches are incomplete; the personal account remains complete. The known £5.12 must not masquerade as the full plan.

Other test fixtures cover one/three/no adults, empty and explicit zero plans, missing funding configuration, imported baselines, annual normalisation, inherited budgets with changed income, an explicit later empty snapshot, stable row identities and rejected references.

## Decisions and review questions

Phase 1 proposes these defaults: actual accounts as top-level financial rows; direct/pot allocations as breakdowns; items as the precise purpose detail; categories as item metadata; household adults as contributor columns; planned and allocated totals kept separate; no inferred spreadsheet groups; exact pence throughout the model.

Before Phase 2, review these choices:

1. Accept this hierarchy and the meaning of incomplete totals, including the additional allocation gaps permitted by current document validation?
2. Is direct/pot naming sufficient for the initial purpose overview, with item names available as detail, or does the spreadsheet require a different explicit mapping? Any cross-account subtotal requires a confirmed rule and a clearly non-destination label before implementation.
3. Accept exact two-decimal values as the starting display policy, or prefer visibly approximate whole-pound summaries? Density and additional-contributor layouts still require rendered review in later phases.

There is no UI, schema, persistence, calculation, navigation or editing change in this phase. No deviation from the Phase 1 scope is intended. Phase 2 remains unstarted pending review.

## Verification

Executed successfully:

- `npm test -- src/domain/transferMatrix.test.ts src/domain/budgetTransfers.test.ts src/domain/monthlyBudget.test.ts src/domain/budgetDocument.test.ts` — 4 files, 26 tests passed, including 15 mapping cases.
- `npm run typecheck`
- `npm run lint`

The mapping tests compare exact output to the authoritative calculation, verify parent/child and contributor reconciliation, and verify that source documents remain unchanged. No rendered browser check was performed: this phase adds no visible UI. Spreadsheet equivalence and real-device layout/accessibility remain unverified and belong to the later review phases.
