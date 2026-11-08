# Plan and Transfers baseline audit (item 1.3)

**Date:** 8 November 2026. **State:** local app after roadmap items 1.1 and 1.2. This is an agent-operated baseline, not a human usability study. The two tasks and local synthetic data were agreed with Nick before the audit.

## Reproducible data and method

`scripts/baseline-fixture.mjs` generates `docs/fixtures/plan-transfers-baseline.json`: two fictional adults (Ada and Ben), 40 items, six categories, four accounts, five pots, five funding methods, two employment incomes and complete snapshots in October 2026 and March 2027. November 2026 inherits October and edits apply through February 2027. Groceries starts at £325.47. Planned funding totals £7,641.87, including £3,767.72 to the joint current account and £1,291.05 to its Bills pot. No personal financial data is in the fixture.

To recreate the isolated audit origin:

```sh
node scripts/baseline-fixture.mjs
cp scripts/baseline-seed.html audit-seed.html
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --host 127.0.0.1 --port 5188
```

Open `http://127.0.0.1:5188/audit-seed.html` on desktop, or `http://localhost:5188/audit-seed.html` in Device Hub. The seed page writes only that origin's `north.budget.v3` key, then opens the November Plan view. Reloading the seed page resets edits. Remove the temporary root `audit-seed.html` after the run. The running audit used empty Supabase environment variables and a separate origin from the existing app; no existing budget or cloud row was edited.

The scripted tasks start on November Plan. One interaction is a tap/click, a whole-field entry, or a save. Screen count is the number of distinct app views or sheets opened. Timings were taken around UI actions and state observations in one computer-use call, repeated three times. They include automation and UI observation overhead and should only be compared with the same protocol. Scroll distance means the total absolute change in CSS-pixel scroll offsets; this run could count manual scroll gestures but could not read offset values from Device Hub, so unmeasured distances are marked rather than estimated.

| Task | Steps / screens | Three runs | Median | Scroll observation |
| --- | --- | --- | --- | --- |
| Desktop Chrome: search Groceries, open editor, change £325.47 to £330.47, save and check balance/scope | 4 interactions; Plan + editor | 3.832, 3.833, 3.849 s | **3.833 s** | No manual scroll gesture; automatic focus scroll distance unmeasured. |
| iPhone 17 Safari: from Plan, open Transfers, find Ada's joint current-account funding and Bills movement in account breakdown | 2 taps; Plan, Transfers, account detail | 2.009, 2.101, 2.025 s | **2.025 s** | No manual scroll gesture on this route; content visible in first detail viewport. |

The desktop edit visibly changed the budget total to £7,646.87, the balance to £1,146.87 over budget, and Ada/Ben's contributions by £2.50 each. It created a November snapshot; March's saved boundary remains independent. The iPhone detail displayed Ada £2,215.45 and Ben £1,552.27 funding the joint current account, with Ada £682.36 and Ben £608.69 moving to Bills after funding. The £1,291.05 Bills allocation is included in the £3,767.72 account total.

## Current behavior and reuse

| Area | Observed capability | Gap or known issue |
| --- | --- | --- |
| Search and filtering | Search matches item, category, owner and destination text; a matching Groceries row and matching total appear with owner/category context. Owner filter and group expansion are implemented. | Mobile search sits below the balance card. Browsing initially shows owner headers rather than an item; the search-results layout remains within the grouped table. |
| Quick edit | Monthly proportional item amounts have an inline decimal input; Enter/blur saves, Escape cancels. Unchanged input creates no new snapshot. | Other funding rules, including fixture Groceries (equal), open the full editor. Existing mobile long-value clipping is documented in the recurring-budget review. |
| Full edit and saving | Full editor exposes category, destination, amount, frequency and funding; affected months are stated before save. A successful save updates totals and shows “Budget item updated.” | Destination and funding controls occupy substantial editor space. The category picker can open on sheet entry in iOS; physical-device behavior remains unverified. |
| Month navigation | Previous/next and month picker use calendar months. Saved/inherited status and inclusive edit scope reflect snapshot boundaries. | No one-month exception or payday lock, by agreed rule. |
| Allocation calculation | Exact pennies reconcile in the fixture: Ada £4,429.66 + Ben £3,212.21 = £7,641.87. Joint current account direct £890.31 + Bills £1,291.05 + Holidays £1,586.36 = £3,767.72. | Funding source, account balances and automation are unknown; an account requirement is not proof a bank transfer must occur. |
| Account view | Mobile grouped account rows show total and contributor shares; one tap opens direct and pot breakdowns. Matrix preview offers household comparison. Desktop shows Plan and account comparison together. | Primary mobile Transfers is account-focused, not a personal checklist; account view stops at allocation/pot detail and does not list all underlying items. |
| Completion | No payment completion or partial-progress data is persisted. | Checklist and progress states are planned for Phase 3; there is no live state to audit yet. |

The existing resolver, `budgetTransfers`, transfer-instruction projection, grouped table, URL month/account navigation, and local/cloud save hooks can be reused. The prior [recurring-budget audit](recurring-monthly-budget-rules.md#current-state-audit-and-changes), [calculation contract](transfer-calculation-rules.md), and focused [matrix visual review](mobile-transfers-matrix-visual-review.md) supply the detailed edge-case and migration evidence. No product behavior or persistence API changed for this audit.

## Visual coverage and remaining validation

- **Verified:** Device Hub iPhone 17 / iOS 27.2 Safari on the isolated fixture, including November Plan, Transfers overview and joint-account breakdown. At its native viewport, Plan shows balance, search and owner headers without scrolling; no actual item row is visible initially. The selected transfer route needs no manual scroll. Desktop Chrome was used for repeatable edit measurements; desktop Safari loaded the same fixture and showed the same £7,641.87 total and £1,141.87 initial deficit.
- **Existing focused evidence:** Safari responsive checks at 375, 390 and 430 CSS px exist for the older matrix prototype, and item 1.2 checked 375/390 matrix precision. Those reviews are linked above; they do not establish a full current-state audit of Plan and account detail at each width.
- **Still unverified in this baseline:** exact scroll-offset distance, three-run timing of the Plan task on mobile and the Transfers task on desktop, current-state visual sweeps at all 375/390/430 px widths in both desktop browsers, physical iPhone Safari, Chrome responsive layout, on-screen keyboard behavior, VoiceOver and zoom. These are evidence gaps, not confirmed defects. Repeat the same fixture and tasks for later comparisons; do not compare the automation medians to human task times.

## Findings for later roadmap items

Known issues: the mobile long-value inline amount field can clip; iOS may open the category picker on editor entry; the initial mobile Plan viewport contains no item row; the account view is not a person-focused action list. Proposed features: compact Plan summary and direct search results (Phase 2), personal transfer checklist and completion tracking (Phase 3). Current calculations, status messages and month-scope explanations should be retained when those views change.

## Verification

`npm run check` passed on 8 November 2026: lint, 177 tests across 20 files, TypeScript and production build. The new fixture test decodes the stored JSON and checks complete funding and the joint-account total. jsdom's existing `window.scrollTo` notices are non-failing and do not establish browser scroll behavior.
