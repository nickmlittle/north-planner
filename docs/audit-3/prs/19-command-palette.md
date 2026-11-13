# PR 19 · ⌘K: jump to any screen, item, pot, statement or action

| | |
| --- | --- |
| **Suggested PR title** | `Audit 3 · 19: command palette (⌘K) for screens, items, pots, statements and actions` |
| **Size** | M (≈450 lines) |
| **Needs** | PR 07 merged (registry). Best after PRs 10–16 so the targets exist, but it only needs PR 06's routes. **Decision D6.** |
| **Unblocks** | — |
| **Branch** | `audit3/19-command-palette` |

## Goal

One keystroke to anywhere. <kbd>⌘K</kbd> (<kbd>Ctrl K</kbd> elsewhere) opens a palette: type a few letters, press Enter. "groc" jumps to the Groceries item, the Groceries pot or Groceries' pace. "oct" jumps to the October statement or October's close. "add" adds an item. It's the Linear and Things move that makes a well-known app fast.

## Findings it fixes

- [F07 · Outside To sort there's no keyboard model](../review.md#f07) (jump and act)

## Current behaviour

There's no search across the app. Plan's search only searches Plan items. Finding a pot's page takes Spending › This month › scroll › row (3 clicks plus scrolling); after PR 06, Month › row.

## Target behaviour

### Palette (`src/components/CommandPalette.tsx`)

- **Opening:** <kbd>⌘K</kbd>, or the sidebar's "Search ⌘K" item (desktop), or the phone header's search icon (add it to the left of the account button on Home only).
- **Layout:** a `Sheet`-like panel **anchored near the top** on desktop (top 15vh, width 640px), and full-height on phones.
  - An input "Search North…" with focus in it.
  - Results grouped under small headings, up to 6 per group, and 30 in total.
  - The selected row is highlighted with ↑/↓, Enter runs it, and Esc closes.
  - A footer hint: "↑↓ move · ↵ open · esc close".
- **Empty query:** "Recent" (the last 5 commands used, `localStorage` `north.recentCommands`), then "Go to" and "Actions".

### Sources (`src/state/commands.ts`, pure and tested)

| Group | Entries (title · meta) | Runs |
| --- | --- | --- |
| Go to | Home · Month · Plan · Spending · Settings, plus each Settings section ("Settings · Cards") | `navigateTo` |
| Items (selected month) | "Groceries · £325.47 · Home · Groceries · Monzo Joint" | Plan, focusing the row, opening its group (`northPlanItem` history state) |
| Pots | "Groceries pot · £143.57 left · Monzo Joint" | Month › pot page |
| Statements | "October statement · £646.88 · Ready to settle" | Spending › statement |
| Months | "October 2026 · Closing" (the last 6 months and the next 2) | Month for that month |
| Transactions | "GREEN GROCER LONDON · £62.40 · Sun 8 Nov" (only when the query is 3 or more characters) | Spending › Transactions, filtered and focused |
| Actions | Add item (N) · Bring in (I) · Add a transaction · Check balances · Mark £140.59 moved (when there's something to set aside) · Close October (when due) · Previous/next month | the same handlers as the buttons |

- **Matching:** case-insensitive. Prefix matches on words rank first, then substring, then initials ("gm" → "Go to Month"). Ties go to Recent first, then group order.
- **Amounts:** "325" matches items or transactions whose amount text contains it.
- **Shortcut hints** on the right of entries (`N`, `I`, `G P`), shown with `Kbd`.

### Accessibility

`role="dialog"` with `aria-label="Search North"`. The input is a `combobox` with `aria-controls` pointing at a `listbox` and `aria-activedescendant`. Results are `option`s.

## Files

- **Add:** `src/components/CommandPalette.tsx` (+ css), `src/state/commands.ts` (+ test).
- **Change:** `src/components/AppLayout.tsx` (mount and ⌘K), `src/components/PlannerHeader.tsx` (the sidebar Search item and the phone search icon on Home), and the Keyboard subsection of `docs/product-design-spec.md`.
- **Reuse:** `navigateTo`, `resolveBudget`, `planItemLabels`, `cardSpending`/`potBalance` (pot "left"), `statementSummary`, `allTransactions`, `Kbd`, and the PR 07 registry (to expose page actions: pages register their actions with `useShortcut`, and the palette lists those with a `title`).
- **Don't touch:** the screens' own search (Plan, Transactions). The palette navigates; it doesn't filter in place.

## Acceptance criteria

- [ ] ⌘K opens the palette on every screen, with focus in the input. Esc closes and focus returns.
- [ ] "groc" lists the Groceries item, the Groceries pot and GREEN GROCER transactions. Enter on the item opens Plan with Groceries focused (and its group open). Enter on the pot opens its page.
- [ ] "oct" lists the October statement and October 2026. Enter on the statement opens it.
- [ ] "add" puts "Add item" first. Enter opens the editor on Plan, navigating there if needed.
- [ ] An empty query shows Recent after one use.
- [ ] Phone: the search icon on Home opens a full-height palette. Tapping a result navigates.
- [ ] Screen reader: VoiceOver announces the active option as you move.
- [ ] `npm run check` passes. Add `commands.test.ts` for ranking, sources and the amount match.

## How to check

By hand at 1440 and 375, seeded: press ⌘K and try "groc", "oct", "add", "bills", "325". There's no mockup artboard; follow the Sheet and ListRow styles in `docs/audit-3/mockups/png/design-system.png`.

## Working in this repo

- **Run it:** `npm run dev -- --port 5174 --strictPort --mode localonly` (local storage, no sign-in). Seed by opening `http://localhost:5174/scripts/baseline-seed.html`. It loads `docs/fixtures/plan-transfers-baseline.json` (Ada and Ben, 40 items, an Amex card with October and November statements and an Amex pot) and lands on Plan for November 2026. Re-seed before each check. Figures like "19 days left" depend on today's date.
- **Screenshots:** `node docs/audit-3/tools/capture.mjs <name> "<query>"` writes phone (375×812) and desktop (1440×900) PNGs, viewport and full height, to `/tmp/north-shots`. Add `--width 1100` for in-between widths. Playwright isn't a dependency; see the script header.
- **Check:** `npm run check` (eslint, vitest, build) must pass. CI runs the same.
- **CI guards:** `src/styles.tokens.test.ts` (no raw colours, sizes or spacing outside `:root`; breakpoints 640/768/1100 only), `src/styles.contrast.test.ts`, `src/copy.vocabulary.test.ts` (retired words; the glossary is in `docs/product-design-spec.md`), `src/styles.views.test.ts`.
- **Tests:** jsdom has no `matchMedia`, so components render their phone presentation. Stub `window.matchMedia` with `matches: false` to test desktop.
- **Docs:** update your screen's section of `docs/product-design-spec.md`, and any rules doc whose behaviour changes. Never `git add -A docs`: untracked review notes live there.
- **Style:** match the surrounding code (some files are dense one-liners) and don't reformat code you aren't changing. Design rules: [plan.md §2.3](../plan.md#design-system).
- **Branch:** `audit3/NN-short-name` from a fresh `main`. One PR, squash-merged.
