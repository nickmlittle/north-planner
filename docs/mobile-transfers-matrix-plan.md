# Mobile Transfers matrix implementation plan

## Goal and decision

Redesign the mobile Transfers experience as a compact financial matrix, using the household's existing spreadsheet as the functional benchmark. The matrix should make it easy to see what each person contributes, the actual receiving accounts, what allocations fund, and how contributor amounts reconcile to household totals.

Preserve North Planner's forest-green palette, typography and restrained aesthetic. Preserve financial calculations, data structures, existing business functionality and the desktop layout wherever possible. The matrix represents planned contributions; it does not record payments made.

## Execution rules

- Work on one phase at a time and stop at each phase boundary for review. Phase 4 may be delivered as smaller separately reviewed slices.
- Test changes before presenting them. Summarise what changed, the checks performed, any limitations and deviations from the agreed design.
- Do not automatically proceed to a subsequent phase or introduce unrelated refactoring.
- Preserve calculations and existing functionality. Present any necessary change to those boundaries for review before proceeding.
- **Visual design approval is a formal checkpoint.** A working prototype is not an approved design; do not start Phase 4 until the user explicitly approves the visual direction.
- Retain the original mobile implementation as the default and an accessible fallback during the prototype and evaluation. Remove it only after the replacement has been reviewed and validated, in a separately reviewed change.

## Existing implementation

- `src/pages/MonthlyBudget.tsx` resolves the selected month, invokes the transfer calculation, renders the desktop transfer table, and coordinates mobile and budget-editing interactions. The desktop table has dynamic contributor columns, account totals, expandable direct and pot rows, and a total footer.
- `src/pages/MobileBudgetViews.tsx` contains the mobile summary, owner-grouped destination overview and full-screen account detail. `src/styles.css` provides their presentation, breakpoint, overlay and safe-area handling. The mobile presentation includes a short landscape touchscreen case as well as widths up to 767px.
- `src/domain/monthlyBudget.ts` defines accounts, pots, categories, budget items, income and monthly snapshots. An item has one destination—an account or a pot—and a separate category. `resolveBudget` selects the items effective for the month, including inherited snapshots.
- `src/domain/budgetTransfers.ts` calculates in integer pence and returns account, direct-account, pot, item and person amounts, plus unresolved proportional allocations. This is the authoritative calculation layer and should not change for the redesign.
- Account items in the transfer result have IDs and calculated contributions; join them to the resolved budget items to recover destination and category when mapping item rows.
- `src/pages/budgetLabels.ts` supplies account and owner labels; `src/formatting/money.ts` supplies currency formatting. The existing summary formatter rounds to whole pounds and abbreviates sufficiently large values; exact-pence display needs an explicit policy.
- `src/App.tsx` and `src/state/navigation.ts` encode the selected month and transfer account in the URL. The existing detail flow supports browser history, direct links, focus restoration and dismissal if the destination becomes unavailable.
- Editing and removal belong to the Plan workflow, using `src/pages/BudgetItemEditor.tsx` and selected-month update paths. The Transfers detail is currently read-only.
- `src/state/useBudgetDocument.ts` and `src/state/useCloudBudget.ts` handle persistence. A derived presentation model should require no schema migration or persistence changes.
- Relevant existing coverage includes `src/domain/budgetTransfers.test.ts`, `src/pages/MonthlyBudget.test.tsx` and `src/App.test.tsx`.

## Data and architectural risks

1. **Groups versus receiving accounts.** Spreadsheet groups such as “Personal Monzo” and “ISAs” are not first-class transfer groups. Provider, name and account type may help describe accounts, but grouping by them without a validated rule could create misleading subtotals. An actual receiving account must remain identifiable.
2. **Pot, category and purpose are distinct.** A pot is a destination within an account; a category classifies an item. A spreadsheet purpose may map to a pot, direct allocation or several items. Do not silently equate them or double-count parents and children.
3. **Planned and allocated totals can differ.** Planned budget includes items with unresolved contributions; account and person totals include calculated contributions. Partial totals must not appear complete or be presented as reconciling to the full planned budget.
4. **Rounding affects visible reconciliation.** Independently rounded amounts can differ from sums of displayed values even when exact pence reconcile. Test exact pence separately from display and explain rounding. Fixed contributions and unresolved items require coverage.
5. **Households are not hard-coded to two people.** Contributor columns come from household adults. Handle one and more than two without losing values; the visual treatment for wider households needs design review.
6. **Navigation and editing need deliberate integration.** The account detail has existing deep-link, history and focus semantics. A destination-specific handoff into item editing is not a ready-made interaction.
7. **Visual checks need real rendering.** jsdom tests do not establish layout, mobile Safari viewport behaviour, touch usability or screen-reader table comprehension.

## Phase 1 — Foundation and data mapping

**Objective:** Agree on a faithful hierarchy and numerical meaning before changing the interface.

**Tasks:** Trace resolved items through `budgetTransfers`. Define a read-only presentation model with stable IDs and explicit actual-account, direct-allocation, pot and potential item row types. Identify any justified cross-account subtotal separately from real destinations. Document category, destination and purpose mappings, data gaps, planned versus allocated totals, incomplete and zero states, rounding and exact-pence reconciliation. Produce representative fixtures and, if useful, a small pure adapter with meaningful tests. Do not change persistence, calculations or visible UI.

**Files:** `src/domain/budgetTransfers.ts`, `src/domain/monthlyBudget.ts`, `src/pages/budgetLabels.ts`, `src/pages/MonthlyBudget.tsx`; a new mapping module and tests only if warranted.

**Deliverable:** A mapping contract, example row hierarchy, decisions and open questions; optionally a tested pure adapter.

**Acceptance criteria:** Every receiving account is traceable to a real account. Parent and child semantics prevent double-counting. Complete allocations reconcile in pence to existing calculation output. Incomplete and unsupported mappings are identified. Calculation, schema, persistence and UI behaviour are unchanged.

**Testing:** Targeted mapping tests for direct and pot allocations, multiple items, cross-owner contributions, fixed and proportional funding, unresolved allocation, pennies and inherited months. If code is added, run relevant existing domain tests and typecheck.

**Dependencies and risks:** None. Grouping and purpose ambiguities may require a product decision before Phase 2.

**Review gate:** Present the mapping and unresolved choices; stop.

## Phase 2 — Mobile matrix prototype

**Objective:** Build a presentation-first matrix using the agreed mapping and existing transfer data.

**Tasks:** Create a mobile-specific semantic table with contributor and household columns, account and purpose hierarchy, compact formatting and contributor totals. Use resolved live data and dynamic household members. Add a small, documented, explicit opt-in preview mechanism that leaves the existing mobile page as the default and fallback, does not modify persisted data and does not interfere with existing account URLs. Keep the prototype read-only and retain access to the existing editing and navigation paths.

**Files:** New matrix component and scoped styles; minimal integration in `MonthlyBudget.tsx`; Phase 1 mapping.

**Deliverable:** An accessible opt-in prototype in the running app.

**Acceptance criteria:** Real accounts, mapped purposes, contributor amounts and totals come from existing calculations. Incomplete data is identified. The matrix does not suggest payments have been made. Semantic row and column headers are present, with no hidden or duplicated financial values. The current mobile view remains the default and recoverable; desktop is unchanged. No editing, financial calculation or persistence behaviour changes.

**Testing:** Focused component tests for mapping, totals, empty and incomplete states, and dynamic people; typecheck and relevant tests. Perform a rendered mobile and desktop smoke check before handoff.

**Dependencies and risks:** Phase 1 mapping accepted. All columns may not fit at 375px with long labels; expose this trade-off rather than using illegibly small text.

**Review gate:** Present the working preview and stop. A working preview is not visual approval.

## Phase 3 — Visual review and iteration

**Objective:** Evaluate the rendered matrix against the spreadsheet and the real transfer workflow.

**Tasks:** Inspect prototype and current mobile page at 375px, 390px and 430px with comparable data. Compare legibility, visible row count, column alignment, receiving-account and purpose hierarchy, contributor totals and reconciliation against the spreadsheet. Inspect long labels, large amounts, zero values, empty and incomplete states, and enlarged text. Make scoped visual iterations and record trade-offs or deviations.

**Files:** Prototype component and scoped styles; representative fixtures if needed.

**Deliverable:** A side-by-side visual review with screenshots or equivalent evidence, findings and a design ready for approval.

**Acceptance criteria:** Contributor columns and their relationship to household totals are understandable. Actual accounts, purposes and subtotals are visibly distinct. No clipped data or unexplained horizontal overflow at target widths; any intentional scrolling is visible and usable. The review explains what is visible without disclosure and where density is compromised. **The user explicitly approves the visual direction before Phase 4.**

**Testing:** Rendered inspection at all three widths, plus keyboard and basic semantic-table checks. Responsive emulation does not establish physical iPhone Safari behaviour.

**Dependencies and risks:** Phase 2 complete. A narrow viewport may require a reviewed compromise on columns, wrapping or scrolling.

**Review gate:** Formal visual approval; stop even if the prototype works.

## Phase 4 — Interaction and functionality

**Objective:** Add the minimum interactions needed to use and explain the approved matrix.

**Tasks:** Deliver in small reviewable slices as needed:

- **4a — Disclosure:** Expand and collapse purpose and item detail with clear row semantics. Join items to their existing destinations and categories.
- **4b — Navigation and editing:** Provide a contextual route into the existing selected-month budget workflow. Preserve existing account-detail deep links, history and focus, or define and review an equivalent compatibility path.
- **4c — Exact amounts and feedback:** Provide exact pence and explicit copy actions where useful, with success and failure feedback. Preserve calculation and rounding rules.
- **4d — Status and exceptions:** Surface incomplete allocations and relevant household or person shortfalls, clearly distinguishing these from payment status.

**Files:** Matrix and adapter; `MonthlyBudget.tsx`, `App.tsx`, `navigation.ts`, `BudgetItemEditor.tsx` and relevant tests as needed by the approved design.

**Deliverable:** A functional opt-in matrix with agreed interactions and a working fallback.

**Acceptance criteria:** Actions unambiguously identify account, person, month and amount. Detail does not double-count or change calculations. Editing uses the existing selected-month budget workflow and retains cancel, save and remove behaviour. Existing account URLs and browser Back work, or a reviewed compatibility path is provided. Copy uses exact calculated pence and reports success or failure. Warnings distinguish incomplete allocations, affordability and planned versus completed payments.

**Testing:** Interaction tests for disclosure, focus, month preservation, navigation and history, editing handoff, copy success/failure and warnings. Compare displayed pence amounts against `budgetTransfers`.

**Dependencies and risks:** Explicit Phase 3 visual approval. Navigation handoff and existing deep links are the largest integration risks.

**Review gate:** Present each completed slice; stop before the next agreed slice or phase.

## Phase 5 — Final responsive refinement

**Objective:** Make the approved functional matrix robust on mobile devices.

**Tasks:** Refine 375/390/430px and short landscape layouts, long labels, large values, additional contributors and enlarged text. Check Safari browser controls, dynamic viewport units, safe areas, bottom navigation and matrix scrolling. Verify touch targets, keyboard focus, zoom and screen-reader row and column announcements. Keep desktop styles and scrolling isolated.

**Files:** Scoped matrix styles and component; shared shell styles only where a demonstrated issue requires it.

**Deliverable:** Responsive implementation with documented device and accessibility checks.

**Acceptance criteria:** Financial values remain accessible and unambiguous at target widths and supported zoom or text sizes. Controls remain reachable above browser chrome and bottom navigation. Headers and values are understandable with assistive technology. Check physical iPhone Safari if available; otherwise record unverified device cases explicitly.

**Testing:** Rendered browser and available physical-device checks; keyboard and screen-reader testing; targeted responsive regressions.

**Dependencies and risks:** Phase 4 accepted. Device or screen-reader availability may limit verification and must be reported.

**Review gate:** Present evidence and limitations; stop.

## Phase 6 — Regression and release readiness

**Objective:** Establish parity and obtain approval before replacing the current mobile view.

**Tasks:** Run full project checks and representative journeys. Verify exact financial parity across funding modes, pennies, incomplete allocations and effective months. Compare desktop before and after; validate Plan editing, month changes, account links, history, focus and persistence. Retain the fallback until replacement and results are reviewed. Remove it only in a separately reviewed final change after validation.

**Files:** Existing domain, page and app tests; matrix tests; release configuration only if needed.

**Deliverable:** Regression report, known limitations and a release-ready change.

**Acceptance criteria:** Representative exact-pence and incomplete-state results match the existing calculation layer. Desktop, Plan editing, navigation and persistence behave as before. Approved mobile design and interactions pass agreed checks. Passing tests alone do not approve fallback removal or release.

**Testing:** Run `npm run check`, targeted financial and navigation regressions, rendered desktop/mobile checks and available real-device checks. Report any checks that cannot be run.

**Dependencies and risks:** Phases 1–5 accepted. Switching the default and cleanup remove the recovery path and need separate review.

**Review gate:** Present the regression report and request the decision to switch and remove the fallback. No release is implied.

## Suggested model and reasoning effort

These are starting points, not guarantees of quality, availability or usage cost. Use medium for narrow, well-specified work and increase effort when ambiguity or failures warrant it. Compare actual outcomes and available options.

| Phase | Suggested model | Effort | Reason |
| --- | --- | --- | --- |
| 1 — Mapping | GPT-6.1 Sol | High | Financial semantics and cross-file edge cases. |
| 2 — Prototype | GPT-6.1 Terra | High | Scoped React/CSS implementation and verification. |
| 3 — Visual review | GPT-6.1 Terra | High | Rendered-screen inspection and iteration. |
| 4 — Interaction | GPT-6.1 Sol | High | Navigation, focus, editor handoff and financial context. |
| 5 — Responsive | GPT-6.1 Terra | High | Visual and browser interaction work. |
| 6 — Regression | GPT-6.1 Sol | High | Broad calculation and user-journey parity review. |

See [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection) and [reasoning-effort guidance](https://developers.openai.com/api/docs/guides/deployment-checklist) for current guidance; available models and limits vary by product.
