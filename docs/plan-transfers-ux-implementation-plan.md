The implementation should start by agreeing how an ongoing budget becomes a particular month’s transfer instructions. That decision governs editing, rounding, completion tracking and what happens when a plan changes after payday.

The plan below is organised into delivery phases. Each item includes the intended behaviour, implementation work, acceptance criteria and questions to resolve before building it. The questions are grouped where one answer affects several items.

This is a product and UX implementation plan based on the visual review. It does not assume a particular code structure, bank integration or existing data model; the first phase includes checking those before estimating or designing technical changes.

## Target experience

A returning user should be able to complete either task without first interpreting the whole household budget:

**Edit a budget**

1. Open Plan and find an item by search, owner or category.
2. Change its amount or details.
3. Understand which months and contributions will change.
4. Save and see the updated balance.
5. Optionally open the affected transfer instructions.

**Make payday transfers**

1. Open Transfers and see the relevant month and their own instructions.
2. Understand the total and each distinct action, including any warnings.
3. Reveal the calculation behind an amount when needed.
4. Optionally record progress and return later without losing their place.

The experience should work for a recurring plan that changes infrequently, while making any month-specific exceptions explicit.

---

## Phase 1: Define the product rules and audit the current experience

### 1.1 Define the recurring plan and monthly budget model

**Agreed implementation:** See [recurring and monthly budget rules](recurring-monthly-budget-rules.md) for the decisions, current-state audit, compatibility path and shared-access follow-up.

**Implement**

Document the relationship between the ongoing plan and each monthly view. Establish how a month is created, whether it inherits future plan changes, and whether past months are preserved as historical records.

Define how the following appear to users:

- A recurring change that affects the current and future months.
- A one-month exception, if supported.
- A change made before versus after payday.
- A month with no budget or an incomplete budget.
- An adjustment to income, destination, ownership or funding split.

Audit the live app and existing behaviour against those rules before changing the interface. Include existing data and migration implications in the technical design.

**Acceptance criteria**

- A user can tell which months an edit affects before saving.
- The same rules apply consistently in Plan and Transfers.
- Past and future month behaviour is documented and covered by tests.
- Existing budgets have a defined migration or compatibility path.

**Questions before implementation**

1. Should the default edit change the recurring budget from the selected month onward, or only the selected month?
2. Are one-month exceptions required? If so, should later recurring changes overwrite or preserve those exceptions?
3. Should past months remain fixed once created, or reflect later plan changes?
4. Is a “month” based on calendar dates, payday, or a user-selected budget period?
5. Can both household members edit the same plan, and what should happen if they edit it at the same time?

### 1.2 Define how transfer instructions are calculated

**Agreed implementation:** See [transfer calculation and money-movement rules](transfer-calculation-rules.md) for the calculation contract, worked examples, instruction model and deferred features.

**Implement**

Write a calculation specification covering the source salary or account, destination account, pots, household contributions, totals, rounding and any existing adjustments.

Distinguish:

- A **budget allocation**: what an item is planned to cost.
- A **contribution**: what a person is responsible for funding.
- A **transfer instruction**: an action the person needs to take.
- A **breakdown**: the items and calculations explaining an instruction.

Model transfer steps so that an account-level total and its component pot allocations cannot be mistaken for duplicate payments. Define how calculations handle pennies and ensure displayed totals reconcile.

**Acceptance criteria**

- Each instruction has an unambiguous person, amount and destination; it includes a source where the product knows it.
- Users can see how an instruction relates to underlying plan items.
- Displayed totals and rounding reconcile according to documented rules.
- Calculation examples are approved for single-person, joint and multi-pot cases.

**Questions before implementation**

1. What are the real-world steps after payday? For example, does each person transfer to a joint account and then one person distribute money into pots?
2. Does the app know which account salaries are paid into, or only where money should end up?
3. Which movements are external bank transfers, which are pot movements, and which are informational allocations?
4. Are all figures intentionally rounded to whole pounds? How should rounding differences be assigned?
5. Are there standing orders or automatic pot movements that should be excluded from the manual checklist?
6. Can a transfer be partially completed, or is each instruction treated as a single action?

### 1.3 Audit existing functionality and establish a baseline

**Baseline audit:** See [Plan and Transfers baseline audit](plan-transfers-baseline-audit.md) for the agreed synthetic fixture, measured task runs, current capabilities, gaps and remaining validation.

**Implement**

Walk through the existing app on representative mobile and desktop sizes. Record current behaviour for searching, inline editing, item editing, month navigation, saving, allocation calculation, account view and any completion tracking.

Capture baseline measures for the two scenarios: steps, screens, scroll distance and time taken to find a typical item or transfer. Identify existing capabilities to reuse and avoid duplicating functionality.

**Acceptance criteria**

- The current behaviours and gaps are recorded.
- Known issues are separated from proposed features.
- The team has agreed baseline tasks and representative budget data for later comparison.

**Questions before implementation**

1. Are there existing product requirements, designs or known technical constraints that should govern this work?
2. Is there a safe test account and disposable dataset for saving edits and testing progress states?
3. Which mobile screen sizes and browsers are required for launch?

---

## Phase 2: Redesign the Plan experience

### 2.1 Make the screen easier to scan

**Implementation review:** See [mobile Plan scan review](plan-scan-phase-2-1-review.md) for the compact balance, grouped list, filter behavior and visual verification.

**Implement**

Replace the tall month/status/balance area with a compact summary that keeps the selected month and the most important balance state visible. Preserve access to income and planned-budget details through an expandable summary or detail view.

Move search and item discovery higher on the screen. Retain owner and category grouping, but reduce the number of vertical layers needed to reach an item. Evaluate a compact list with filters against the current accordion design using realistic household data.

**Acceptance criteria**

- On a typical mobile viewport, users can see the budget status, search and at least the beginning of the item list without scrolling.
- Over-budget, balanced and unallocated states are visually distinct and explained in text.
- Grouping remains usable for a large budget and does not depend on colour alone.

**Questions before implementation**

1. Which balance states matter most: over budget, money left to allocate, or both?
2. Should the current month always be the default, or should Plan remember the last viewed month?
3. Should owner/category groups start expanded, collapsed, or remember the user’s last state?

### 2.2 Improve search, filtering and item discovery

**Implementation review:** See [Plan search review](plan-search-phase-2-2-review.md) for search scope, results, reset and state behavior.

**Implement**

Make search return direct, clearly labelled item matches without requiring the user to manually expand each matching owner and category. Show the item’s owner and category as supporting context. Provide a clear search reset and a useful no-results state.

Keep filters compact on mobile. Preserve the query, filter and scroll position when a user opens an item and returns.

**Acceptance criteria**

- A user can search for and open an item directly from the results.
- Matching counts and totals are clearly labelled and do not imply they represent the entire budget.
- Clearing the search restores the prior browsing context.
- Search works with keyboard and assistive technology.

**Questions before implementation**

1. Should search match item names only, or also categories, accounts, pots and owners?
2. Should filters be remembered between visits or reset when the user leaves Plan?

### 2.3 Clarify quick edit versus full edit

**Implement**

Give each item a consistent interaction model:

- A clearly identifiable amount control for a quick amount edit.
- A row or labelled action for the full item editor.
- An overflow menu for less frequent actions.

For inline editing, show the entire value and currency, use an appropriate mobile keyboard, and provide an explicit save/cancel mechanism or a clearly communicated automatic-save pattern. Handle invalid values and interrupted edits.

**Acceptance criteria**

- Users can distinguish the quick amount edit from the full editor.
- The full current amount is visible when editing.
- Validation explains how to correct an error.
- Cancelling an edit leaves the stored amount unchanged.
- Save success and failure are communicated.

**Questions before implementation**

1. Should quick edits save immediately, or require an explicit confirmation?
2. Which item fields are common enough to edit directly from the list?
3. Are zero amounts, negative amounts or decimal values allowed?

### 2.4 Restructure the full item editor

**Implement**

Prioritise the fields users most commonly change: item name and amount, followed by destination and funding. Present category and advanced allocation controls progressively where appropriate. Replace the large destination block with a compact summary and an obvious **Change** action.

Ensure the sheet has a usable scrolling area, that focused fields stay visible above the keyboard, and that the fixed footer does not obscure content. Support a clear close/cancel path and a warning for unsaved changes where needed.

**Acceptance criteria**

- Common edits can be completed without navigating through unrelated settings.
- The selected destination and funding method are understandable before opening advanced controls.
- All fields and actions remain reachable with the mobile keyboard open.
- Cancelling and saving have predictable outcomes.

**Questions before implementation**

1. Which fields are edited most often in practice?
2. Should the editor support multiple items at once, or should editing an existing item always focus on one?
3. Are there fields whose changes should require additional explanation because they affect other household members?

### 2.5 Preview impact and connect Plan to Transfers

**Implement**

Before saving a change, show the relevant consequences: effective months, updated budget balance and affected contributions or destinations. Keep the preview concise; provide detail on demand.

After a successful save, show confirmation and a **View affected transfers** action. Carry the selected month and, where applicable, person or destination to the transfer view. The transfer view should identify the changed figures.

**Acceptance criteria**

- The preview uses the same calculation rules as Transfers.
- A user can see whether the edit creates or resolves a budget shortfall.
- The post-save link opens the correct month and context.
- If recalculation fails, the user receives a clear status and recovery path.

**Questions before implementation**

1. Is an impact preview required for every edit, or only changes affecting amounts, destinations or contributions?
2. Should changes become effective immediately on save, or is a separate review/publish step needed?
3. Should the other household member be notified when their contribution changes?

---

## Phase 3: Build the payday Transfers experience

### 3.1 Introduce a person-focused checklist

**Implement**

Make the primary mobile view a list of the selected person’s transfer instructions for the selected month. For each actionable step, show:

- Destination and amount.
- Source, if known and useful.
- A concise action label that reflects the real-world movement.
- A status if progress tracking is enabled.
- Access to the calculation breakdown.

Group and order steps according to the agreed money movement. Keep household comparison available separately.

**Acceptance criteria**

- A user can identify their own next action without horizontal scrolling.
- Every displayed action is distinct; totals and component amounts do not appear as duplicate instructions.
- The selected person and month remain visible or easily accessible.
- The list works for one-person and multi-person households.

**Questions before implementation**

1. How is the current user identified, and can they switch to another household member’s view?
2. What ordering best matches the real workflow: source account, destination account, priority, or a defined sequence?
3. Should the app show the total to move, and if so, how should it avoid double-counting multi-step movements?

### 3.2 Retain and reposition account and matrix views

**Implement**

Adapt the existing account view into an optional destination-oriented overview or use its components in the checklist. Retain the contribution matrix as a comparison view, labelled so users understand its purpose.

On mobile, avoid making horizontal scrolling necessary for the primary task. On desktop, allow the matrix to use the available width and provide an account or instruction detail panel where useful.

**Acceptance criteria**

- The primary mobile payday flow requires no horizontal table scrolling.
- Users can still compare contributions across household members.
- Account totals, individual shares and underlying pot allocations are consistently labelled across views.
- Switching views preserves the selected month and person.

**Questions before implementation**

1. How frequently do users need to compare the whole household rather than view their own actions?
2. Should account view remain a separate screen, or become an alternate grouping of the checklist?

### 3.3 Explain totals and provide drill-down

**Implement**

Allow a user to expand an instruction to see the relevant pot allocations, plan items, contribution split and rounding explanation. Link to the relevant Plan item when an amount needs changing.

Use an inline expansion or sheet on mobile so the user can return to the same point in the checklist. Provide equivalent detail alongside the list on wider screens.

**Acceptance criteria**

- A user can trace a displayed amount to the items and contribution rules that produced it.
- Returning from detail preserves list position and context.
- Breakdown totals reconcile with the displayed instruction under the agreed rounding rules.
- A Plan link opens the correct item and month.

**Questions before implementation**

1. How much calculation detail do users need by default: pot totals, individual budget items, or both?
2. Should users be able to edit plan items directly from a breakdown, or navigate to Plan?

### 3.4 Show warnings and readiness

**Implement**

Carry relevant plan conditions into Transfers. For example, distinguish “all items allocated” from “plan exceeds available income.” Give each warning a plain-language explanation and a route to resolve it.

Define how Transfers behaves when an item lacks a destination, income is missing, or a calculation cannot be completed. Avoid presenting incomplete figures as a complete set of instructions.

**Acceptance criteria**

- A user can tell whether instructions are complete and whether the budget has a shortfall.
- Each actionable warning links to the relevant place to fix it.
- Incomplete calculations are identified without implying that transfers have been verified.
- Warnings update after the underlying plan is corrected.

**Questions before implementation**

1. Should an over-budget plan block the checklist, or allow users to proceed with a warning?
2. Which conditions make an instruction unreliable enough that it should be withheld?
3. Should warnings be shown per person, household-wide, or both?

### 3.5 Add progress tracking, if approved

**Implement**

Let users mark instructions as complete and undo that mark. Show remaining actions and an appropriately defined remaining amount. Persist progress by month and person.

Explicitly describe completion as **marked done by the user** unless the app has an integration that verifies a transaction. Define what happens when a plan edit changes an instruction that was already marked done: flag the change, retain an audit of the previous amount if needed, and help the user decide what remains.

**Acceptance criteria**

- Progress survives leaving and reopening the app.
- Users can undo an accidental completion.
- Completion is not represented as bank-verified unless it is verified.
- An affected completed instruction is visibly flagged after a relevant plan change.
- Two household members’ progress is represented according to agreed permissions and visibility.

**Questions before implementation**

1. Is progress tracking wanted for the initial release?
2. Is completion personal, shared with the household, or both?
3. If a £100 instruction marked done changes to £120, should the app suggest £20 remaining, or require the user to review the full instruction?
4. Is partial completion needed?
5. Should progress reset automatically each month, and should previous months remain viewable?

---

## Phase 4: Responsive design and production polish

### 4.1 Establish mobile and desktop layouts

**Implement**

Create a shared set of components for summaries, list rows, warnings, editors, breakdowns and status indicators. Design mobile first around touch and limited vertical space.

At desktop widths, use the additional space for a list and detail panel, richer comparison tables and visible filters. Preserve the same names, calculations and task order across layouts.

**Acceptance criteria**

- Both scenarios are usable at agreed mobile, tablet and desktop sizes.
- Controls do not overlap, clip or disappear at intermediate widths.
- Desktop adds useful context without creating a separate set of product rules.
- Navigation state and selected month remain consistent across layouts.

**Questions before implementation**

1. Is desktop part of the first release or a follow-on? Which browsers and viewport sizes must be supported?
2. Should desktop expose the matrix by default, or retain the personal checklist as the default?

### 4.2 Accessibility and interaction quality

**Implement**

Review the complete flows for accessible names, heading structure, focus order, keyboard use, visible focus, touch target size, text resizing, contrast and screen-reader announcements. Pay particular attention to icon-only controls, accordions, inline edits, validation, sheets and completion changes.

Test with the mobile browser’s keyboard and browser chrome, including small screens and zoomed text.

**Acceptance criteria**

- Both tasks can be completed with a keyboard and with a screen reader.
- Focus moves into and returns from sheets predictably.
- Status, errors and saved changes are announced appropriately.
- Content remains available when text is enlarged and when the keyboard is open.
- Colour is not the only way to communicate warnings or completion.

**Questions before implementation**

1. Is there a required accessibility standard or formal audit process for launch?
2. Are there known user accessibility needs or assistive technologies to prioritise?

### 4.3 Empty, loading, error and edge states

**Implement**

Design and test states for no budget, no income, no destinations, no matching search results, unallocated items, no transfers required, failed saves, unavailable calculations and interrupted sessions.

Provide an explanation, preserve user input where possible, and offer a direct recovery action.

**Acceptance criteria**

- No state leaves the user with a blank screen or misleading success message.
- Failed edits can be retried without re-entering all information.
- “No transfers required” is distinct from “transfers could not be calculated.”

**Questions before implementation**

1. What offline or unreliable-network behaviour is expected?
2. Does the app need to support multiple currencies or income frequencies at launch?

---

## Phase 5: Validation and rollout

### 5.1 Test the calculations and workflows

**Implement**

Create meaningful automated coverage for the agreed calculation rules and month behaviour, including rounding, recurring changes, exceptions, destination changes and edits after completion. Add end-to-end checks for the two main journeys and critical failure states.

Run visual checks on representative devices and browsers. Validate with a small set of users completing realistic tasks, including an existing budget with many items.

**Acceptance criteria**

- Calculation examples from Phase 1 pass consistently.
- The two primary journeys work from entry to completion, including return navigation.
- Save, recalculation and error states are verified.
- Usability participants can find an item, understand change scope and identify the next payday action without explanation.

**Questions before implementation**

1. Who can participate in usability testing, and do they represent both household roles?
2. What thresholds define success—for example, task completion rate, time or reduction in scrolling?

### 5.2 Release incrementally and observe

**Implement**

Release the changes in stages, ideally behind a feature flag if the product supports it. Start with the shared calculation and month rules, then Plan improvements, then the new Transfers view and optional progress tracking.

Compare the new experience with the baseline. Collect feedback on task completion, failed searches, warning resolution and confusion around transfer instructions, subject to the product’s privacy choices.

**Acceptance criteria**

- Existing budgets remain intact and usable after release.
- The team can identify and recover from calculation or migration issues.
- The two key journeys show improvement against the agreed baseline.
- Support material explains recurring edits, transfer calculations and checklist status.

**Questions before implementation**

1. Is a staged rollout or feature flag available?
2. What analytics and feedback collection are acceptable for this product?
3. Who owns product sign-off for financial calculations and the final UX?

## Suggested delivery order

| Order | Deliverable | Why it comes first |
|---|---|---|
| 1 | Product rules, current-state audit and calculation examples | Prevents the interface from presenting ambiguous or duplicated money movements. |
| 2 | Compact Plan, search and clear editing | Improves the less frequent but foundational budget-editing task. |
| 3 | Change scope, impact preview and Plan-to-Transfers links | Makes the consequence of editing visible and trustworthy. |
| 4 | Personal transfer checklist, breakdowns and warnings | Makes the frequent payday task direct and usable on mobile. |
| 5 | Progress tracking and changed-plan handling | Builds on stable instruction and month rules. |
| 6 | Desktop adaptation, accessibility, edge states and rollout | These run throughout design and implementation, with a final dedicated validation pass. |

The highest-priority decisions to answer first are **edit scope**, **the actual sequence of money movements**, **rounding**, and **whether transfer completion is tracked**. Once those are agreed, the interface and technical work can be estimated against concrete behaviour.
