# Mobile Transfers redesign and bottom navigation

## Summary

Replace the mobile hamburger and Budget view switch with three persistent destinations: **Plan, Transfers, Household**. Redesign Transfers as a compact grouped list, with each destination opening a full-screen breakdown.

The goal is to make the screen quicker to scan and easier to operate one-handed while retaining clear ownership, contribution amounts and allocation warnings. Desktop keeps its existing sidebar, combined Budget screen and transfer table.

## 1. Mobile navigation and application shell

### Bottom navigation

- Add a fixed bottom bar with three equally sized, labelled destinations, ordered **Plan · Transfers · Household**. Use Lucide icons alongside persistent text labels.
- Plan and Transfers open the existing Budget component in the appropriate mode; Household opens the existing household page.
- Remove the mobile hamburger, drawer, scrim and top Plan/Transfers switch. Retain the desktop sidebar and its expand/collapse behaviour.
- Use `aria-current="page"` for the selected destination, with a filled background or indicator as well as colour. Each destination has a minimum 48 px touch target.
- Allow 60 px for the bar plus `env(safe-area-inset-bottom)`. Reserve matching space in the content so the final row and form actions remain reachable.
- Reuse the existing mobile breakpoint, including its short, coarse-pointer landscape condition. Desktop and mobile navigation must never both be visible or keyboard-focusable.
- Hide the bar behind full-screen destination detail and modal editing flows. Existing modal focus containment must include the new navigation.

### Header and utilities

- Replace the current mobile top navigation with a compact, non-sticky page header: **Plan**, **Transfers** or **Household**, plus a 44 px **Account and save status** button.
- Use one visible, accessible page-level heading. Suppress the existing duplicate page heading only in the mobile presentation; keep desktop headings unchanged.
- The utility button opens an accessible sheet containing save status, the full storage warning when present, and signed-in email/sign-out where available. Local mode shows storage status without account actions.
- Keep save failures visible as a concise alert below the header; do not hide them solely inside the utility sheet.
- Retain the existing brand colours, typography family and saved check icon.

### Navigation state and URLs

Extend the existing query-string navigation rather than introducing a router dependency:

- `?view=budget&budgetView=plan`
- `?view=budget&budgetView=transfers`
- Add `month=YYYY-MM` when selecting a month.
- Add `transferAccount=<accountId>` when opening a destination breakdown.

Parse these into a typed navigation state in `src/state/navigation.ts`. Remove the current unconditional reset to Plan on every `popstate`.

Defaults and behaviour:

- Bare or legacy Budget URLs open Plan; invalid month values fall back to the current month.
- Incomplete household setup still takes precedence over requested Budget views.
- Plan/Transfers switching preserves the selected month and the mounted Budget component’s editing/search state.
- Each destination change creates a history entry; tapping the already-selected destination does not.
- Browser Back/Forward restores the selected tab, month and destination detail.
- Desktop ignores the mobile detail presentation and continues showing the combined Budget screen.

## 2. Transfers overview

Implement the presentation changes primarily in `src/pages/MobileBudgetViews.tsx`, with orchestration in `src/pages/MonthlyBudget.tsx`.

### Compact top section

- Replace the oversized “Budget your month” introduction with the mobile Transfers heading.
- Keep the previous-month button, month picker and next-month button in a single row, with minimum 44 px targets.
- Keep the brief budget-date status and labelled **Month options** control beneath the selector.
- Replace the large summary card with an unboxed summary block: **Allocated total**, the amount, allocation status and the existing information button.
- Keep the explanation that these are planned contributions rather than recorded payments inside summary details.
- Preserve the actionable incomplete-allocation warning above the destination list.

### Grouped destination list

- Replace separate rounded cards with one list divided by **Joint**, household member names, and **Needs owner**, using section headings and thin row separators.
- Preserve existing group order, account order and all allocation calculations.
- Make the entire destination row a single button opening its detail view. Do not nest other interactive controls inside it.
- Display:
  - Account provider/type/nickname, without repeating the group’s owner.
  - Right-aligned allocated total.
  - A wrapping contribution line, such as **Nick £2,382 · Immy £1,775**.
  - Item count and a chevron as the detail affordance.
- Use the existing owner-free account-label helper, preserving duplicate-account suffixes. The accessible button name includes the owner and account identity.
- Omit exactly-zero contributions from the overview only. Preserve nonzero pence values even if whole-pound formatting displays £0.
- If every contribution is zero, show **No contribution allocated**; an unresolved allocation must additionally show **Incomplete allocation**, so zero is not mistaken for a resolved result.
- Keep all people, including zero contributions, in destination detail.

### Typography and density

- Use approximately 16 px primary row text, 14 px contribution text and 13 px secondary metadata, with tabular numerals for money.
- Start rows at roughly 88 px minimum height, allowing them to grow naturally for long names and larger text.
- Use 16 px horizontal gutters and restrained vertical padding; do not reduce text size to force content onto one line.
- At narrow widths, account names and contribution lines wrap. Amounts remain readable; unusually large amounts can move beneath the title instead of clipping.
- No horizontally scrolling transfer table, contribution carousel or fixed-height text truncation on mobile.

## 3. Full-screen destination detail

### Presentation and content

- Opening a destination shows a full-viewport detail layer with a sticky header containing **Back to Transfers** and the account name.
- Include owner, selected month, allocated total and every household member’s contribution near the top.
- Follow with an unboxed, divided breakdown of **Direct to account** when present and each pot in its existing order.
- Show the allocated total and complete per-person split for each direct or pot summary, including zero amounts. Keep incomplete allocation status visible near the account total.
- Pot summaries are the lowest level of detail. Do not show budget-item rows or item disclosures in Transfers.
- Keep currency formatting and the existing rounding explanation. Do not introduce payment execution, paid/unpaid tracking or editing controls into this view.

### Interaction and accessibility

- Use the existing dialog accessibility behaviour as the foundation for the full-screen layer: background inertness, focus containment, scroll locking and Escape handling.
- The detail layer has one internal vertical scroll area, safe-area padding and no nested scrolling item lists.
- Focus the detail heading on entry. Back/Escape returns focus to the destination row and restores the overview’s scroll position without a visible jump.
- Keep the overview mounted behind the detail layer to preserve its state.
- Opening detail pushes a history entry. Back closes that entry when it was created in-app; a directly loaded detail URL uses a replacement navigation to the Transfers overview instead of leaving the app.
- Invalid or removed account IDs fall back to the overview with a brief “Destination is no longer available” status message.
- If the viewport changes to desktop while detail is open, close the mobile presentation, release focus/scroll locks and remove the detail parameter with history replacement.
- On return to mobile, show the overview rather than reopening the dismissed detail.

## 4. Implementation boundaries and sequence

1. Introduce typed navigation parsing and URL updates, then adapt the app’s selected Budget mode and month to this state.
2. Build the mobile bottom bar and utility sheet; remove obsolete drawer behaviour and associated mobile styles.
3. Replace transfer cards and summary styling with the grouped overview.
4. Add the full-screen destination view with direct and pot summaries, including history, focus and scroll restoration.
5. Update tests and perform responsive browser/device verification.

Internal interfaces will change to pass the selected month, Budget mode, destination ID and navigation callbacks into the relevant components. Transfer rendering should continue consuming `budgetTransfers()` output; monetary calculations must not move into presentation components.

No database changes, document-schema migrations, API endpoints, new routing library or new persistence store are required. Consolidate the affected mobile CSS instead of adding another layer of conflicting overrides.

## 5. Verification and acceptance criteria

### Automated coverage

Update the existing Vitest/Testing Library tests to cover:

- Three mobile destinations, active state, direct URLs and browser history.
- Bare/legacy URLs, invalid navigation parameters and household setup gating.
- Month preservation when switching Plan/Transfers.
- Grouping, duplicate account labels, direct-plus-pot totals and households with more than two adults.
- Zero contributions omitted only from the overview and retained in detail.
- Empty budgets and incomplete allocations, including the existing Edit income action.
- Detail entry/exit, direct and pot summaries, Escape, focus restoration and direct-link fallback.
- Account deletion while detail is selected and cleanup when leaving the mobile breakpoint.
- Account/sign-out availability, save warnings and modal isolation of bottom navigation.
- Desktop sidebar and transfer-table regression behaviour.

Run `npm run check` after implementation.

### Visual and interaction checks

Verify at 320, 375, 390 and 430 px widths; short phone landscape; and desktop widths on both sides of the breakpoint.

Acceptance criteria:

- No horizontal overflow with long account/person names, large amounts or enlarged text.
- At 390 × 844 with ordinary two-person data and no warning, at least three destination rows are fully visible before scrolling.
- All interactive targets meet the specified minimum sizes and have visible keyboard focus.
- The last content row remains accessible above the bottom bar and device safe area.
- A destination with 23 budget items shows only its direct and pot summaries without lengthening the overview.
- Returning from detail restores the same destination and scroll position.
- Plan forms, menus and modal actions remain usable with the on-screen keyboard.
- Desktop retains its existing layout and behaviour.

Physical-phone checks should confirm thumb reach, safe areas and keyboard interaction; responsive browser screenshots alone are insufficient.

**Chosen defaults:** three direct bottom destinations; full-screen destination detail ending at pot summaries; Plan remains the default landing view; zero contributions are hidden only in overview summaries; transfer calculations and desktop presentation remain unchanged.
