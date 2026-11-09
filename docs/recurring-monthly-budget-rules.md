# Recurring plans and monthly budgets

**Status:** Agreed with Nick on 7 November 2026; implementation of [item 1.1](https://github.com/nickmlittle/north-planner/blob/0f2d2b6/docs/plan-transfers-ux-implementation-plan.md#11-define-the-recurring-plan-and-monthly-budget-model).

## Product contract

A budget is a sequence of complete, effective-dated versions, rather than a separate copy created every time a month is viewed. Periods are calendar months (`YYYY-MM`). Opening a month does not save or freeze it. Payday has no effect on these rules; the app does not record payday or transfer completion.

An item addition, edit or removal creates or updates the complete budget snapshot for the selected month. The snapshot supplies that month and subsequent months until the next saved budget starts. The next snapshot is independent, including items that were unchanged when it was saved. Earlier months are unchanged by a later edit. Deliberate corrections to earlier months are allowed and can change later inherited months. There is no automatic historical lock.

Explicit “this month only” edits are deferred. A range that happens to contain just one month is still a recurring change bounded by the next saved budget, not a protected exception.

Before saving, show an inclusive affected range: “December 2026–February 2027”, “December 2026” when January has the next snapshot, or “December 2026 onward” when there is no later snapshot. Show this in the full item editor and beside the active inline amount control, and use it in removal confirmations. Leaving an inline amount unchanged must not create a new boundary.

Plan and Transfers resolve the same items for the same selected month. Transfers are derived again from those items, that month's income and the shared destination records; they are instructions for planned contributions, not records of money already moved.

### Income, funding and destinations

Income sources have their own effective dates. Editing one source applies from the selected month until that source's next recorded change. A new source starts in the selected month and continues onward. Entering zero stops that source for the affected range; an existing later change can restart it. Show the range separately for each source. Do not create a budget snapshot when income changes.

Employment income determines income-ratio contributions; additional income increases available money without changing those proportions. Income edits can therefore change contributions even when the item snapshot stays the same. Other funding rules remain attached to the saved item.

Changing an item's destination or funding rule follows the budget snapshot range. Changing shared account ownership, a pot's parent account, a name or a category is different: those records are shared across every month, including the past. Ownership is destination context, distinct from who funds an item. The management screen must disclose the all-month scope. Historic views are not immutable copies of account details or previously calculated contributions.

### Missing, empty and incomplete budgets

| State | Behaviour |
| --- | --- |
| No snapshot on or before the month, no imported baseline | No budget is set; offer item creation. Future snapshots do not supply earlier months. |
| Snapshot in the selected month | Identify it as a saved budget; allow removal of this budget date. |
| Inherited snapshot | Identify its source month; do not offer removal of a nonexistent budget date. |
| Intentional empty snapshot | Keep it as a real boundary. Inherited months remain intentionally empty rather than falling back to an older populated budget. |
| Imported baseline | Continue using it before the first saved boundary and identify its legacy origin. |
| Items with unresolved income-ratio funding | Preserve the planned items, show incomplete allocations and offer income correction. Do not imply that every contribution was calculated. |

Removing a budget date affects the same range as editing it. Explain what replaces it: the previous snapshot, imported baseline, or no budget. Preserve every later saved snapshot.

## Worked examples

1. **Recurring edit:** November has £100 rent and March has an independently saved £100 rent plus a holiday item. Set December rent to £120. November remains £100; December–February become £120; March remains £100 plus its holiday item.
2. **Past correction:** Revisit December in April and change rent again. The same December–February range changes. Being in the past does not freeze it.
3. **Income boundary:** Salary is £2,000 with £3,000 recorded from February. Edit December to £2,300: December–January use £2,300, February still uses £3,000. A gift with its next change in January is affected only in December. Neither edit creates a budget snapshot.
4. **Empty month:** Save an empty December budget before a March budget. December–February have no items. Remove December's date and they inherit November again.
5. **Destination correction:** Change December rent from account A to B; only December–February change. Move the shared destination pot to another parent account in management; transfer routing changes in every month referencing that pot.
6. **After payday:** Editing December after making a bank transfer still updates the plan under the same range rules. The app cannot infer what was paid or calculate an outstanding payment from completion history.

## Current-state audit and changes

The audit covered the resolver, item and income save paths, destination management, local/cloud persistence, transfer calculation and the running local app. The older KAN-53/KAN-57 notes are historical; this contract describes the current budget-only app.

| Area | Finding and outcome |
| --- | --- |
| Budget inheritance | Existing complete-snapshot behaviour matches the agreed contract; retained. |
| Month status | Inherited snapshots were incorrectly marked explicit. Corrected to require a snapshot in the selected month; this also removes invalid date-removal actions. |
| Scope wording | Desktop wording included the next boundary month. Replaced with inclusive ranges and matching month-options text. Added scope to full/inline editing, source-specific income fields and removal confirmations. |
| Income drafts | Cancelled drafts could survive reopening and later be saved against another month. Reset existing-source drafts on opening the editor. |
| Shared references | Account/pot/category management already explains all-month effects, including pot parent-account changes; retained. |
| Transfer consistency | Plan and Transfers share the budget resolver and selected-month income. Regression tests cover inherited matrix output and both views' month status. |
| Saving and history | Local saves and account-private cloud revision checks remain unchanged; no history lock, completion ledger or bank verification exists. |

### Visual review

Inspected the running local app in Device Hub on the iPhone 17 simulator (iOS 27.2), and Safari responsive preview at 390 × 932 and 1280 × 932. Checked the mobile account breakdown, Plan, full editor, inline amount context, desktop saved/inherited month navigation and the income form. No changed amounts or deletions were submitted during inspection.

The inline note initially wrapped into a narrow amount column; it now sits with the item context. Full-editor scope and desktop source-specific notes are visible and readable. January inherited December's budget and correctly omitted date removal.

Existing issues deferred to later roadmap items: the mobile amount input can clip a long value; focusing the editor's category select can open its native picker immediately; desktop combines planning and household transfer comparison. This was a focused item-1.1 review, not a full device/accessibility audit or the task-time baseline required by item 1.3.

## Compatibility and validation

No document schema, database migration, stored ID or currency representation changes. Version 3 snapshots retain their existing meaning, including intentional empty and imported snapshots. Version 2 documents continue through the existing migration, which preserves legacy baselines and month-override restoration boundaries. Local keys, pending drafts, cloud revision checks and source-preservation recovery paths remain unchanged. Do not reset the database or modify the legacy household forecast table.

`ResolvedBudget.hasExplicitBudget` now means a snapshot exists in the selected month. `sourceMonth` continues to identify an inherited snapshot; matrix metadata follows the corrected meaning. New shared helpers return inclusive edit ranges for budgets and individual income sources, with a null end for an open-ended range; formatting is independent of timezone and payday.

Automated coverage includes saved/inherited/missing/imported states, empty snapshots, historical item amount/destination/funding corrections, preserved future budgets, income start dates and independent boundaries, January/year transitions, removal confirmations, source-specific form descriptions, cancelled income drafts, unchanged inline edits, both views and existing migration/save tests. Run `npm run check` for lint, all tests, type checking and production build.

## Shared household access: agreed design for later delivery

Separate signed-in household members should eventually access one budget. Both may edit all items, income and past months. The owner controls access; financial account ownership must not grant or restrict login access.

Current `public.budgets` rows are private to `user_id`; the older `public.households` table is also private per user and is not a reusable membership system. A later implementation needs a shared budget identity, authenticated membership/owner permissions and database access policies. Invitation and membership UI, access changes, data migration and shared saving are outside this implementation.

On a stale save, stop the write, preserve the member's draft and require review of the latest shared budget before reapplying changes. Do not automatically merge or replace the entire shared budget with a stale document. Reapplication must use the latest revision and recalculate the affected range, including any intervening budget or income boundaries. If another save intervenes, repeat review. Membership changes must also be checked at write time.

Keep the current whole-version chooser only for today's account-private storage. The future sharing migration must map existing budgets to their owners, preserve their content and pending drafts, and avoid automatically combining different users' private budgets. Detailed invitation lifecycle and migration implementation belong to that separate delivery.
