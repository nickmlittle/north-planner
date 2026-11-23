# Waiting: design and PR build plan

Status: planned, 23 November 2026, with Nick (audit 6, planning session 1). Eight PRs, `waiting/1-review-clock` to `waiting/8-pay-back`, none built yet. Read this in full before starting any PR in it. Where it disagrees with the design canvas, this document wins; [card-tracker-rules](card-tracker-rules.md) becomes the contract as each PR ships.

- **Design canvas** (private to the owner): https://claude.ai/artifact/NnPa7Q2sMjeAKSvjZ3poyE. Seven desktop and phone pairs: To sort, marking a row, Go through them, Close, settle up, paying the buffer back, Home.
- **Working doc** (private to the owner): https://claude.ai/artifact/4o9wtLrziYQbGK3bjNWJAN. It holds the decisions to confirm (WP1–WP10) as dropdowns.
- **Figures and names in this document are examples.** They use the baseline fixture's household (Ada's card ends 41001, Ben's 41009), not the household's real numbers. On the household's own data, "Ask Ada" reads "Ask Immy".
- **Related rules:** [card-tracker-rules](card-tracker-rules.md) (To sort, the bill sum, Close, settle up, the Amex pot, the buffer), [product-design-spec](product-design-spec.md) (layout, language, glossary).

---

## 1. What we're building

A third state for an Amex row: **To sort → Waiting → Sorted.** In audit 6's live review, 9 of 17 new rows stayed in To sort because they needed the other cardholder, a conversation, or an order lookup. North read them as untouched. They kept the To sort count up, kept Home nagging, blocked Close, and pushed Set aside down the page.

| # | Decision (audit 6, 23 Nov 2026) |
| --- | --- |
| W1 | Waiting rows count in no pot, no pace and no move. The bill shows them as their own part. |
| W2, W5 | The reasons are **Ask Ada**, **Ask Ben** and **To discuss**, stored as a person or "to discuss". The cardholder's name comes first. |
| W3, W11 | At settle up the buffer covers what's still waiting. North records it, and once a row is sorted its pot pays the buffer back. The household pays Amex from Joint's main balance after moving the Amex pot's money out, so covering needs no extra transfer. |
| W4 | Waiting is a mark on the transaction, with no sort. Sorting the row clears it. |
| W6 | A reason is required. A note is optional. |
| W7 | Desktop: a clock icon beside Split, and the **W** key. Phone: "Not ready to sort?" in the sort sheet. No new column, and no extra row height. |
| W8 | Spending's To sort tab runs Set aside (always on top), then To sort, then Waiting, then Expecting back. |
| W9 | Anyone can clear a row. **Go through them** steps through a group one row at a time. |
| W10 | **Waiting blocks Close**, like To sort. |
| W12 | Home gets "Go through 4 with Ada" and "2 to discuss". The freshness line and the bill add the waiting count and amount. |

**Not in this plan:** the bill gauge and RAG tones, "Assume this will be coming back", ticks in the Move sheet, a cardholder's own view (shared households), and an Amazon order extractor. Each has its own planning session.

## 2. Data model and rules

Two stored things carry the feature: a **Waiting mark** on a transaction, and a **front** recorded when a bill is paid with rows still waiting. Every figure is worked out from those two (D14). The document version doesn't change.

### 2.1 The Waiting mark

```ts
// CardTransaction
waiting?: {
  on: { kind: 'person'; personId: string } | { kind: 'discuss' }
  note?: string   // trimmed; up to 140 characters
  at: string      // ISO: when it was marked
}
```

- **Validation:** the mark is allowed only on a purchase or refund with no sort. The person must be an adult. A mark with a sort, on a payment, or with a note over 140 characters makes the document invalid, as a bad sort does today.
- **Writers:** `markWaiting(document, id, on, note, now)` adds or edits the mark. `clearWaiting(document, id)` is Back to To sort. **Every write that sets a sort drops the mark**, through one helper: `sortTransaction`, `restoreSort`, `sortRefund`, `linkRefund` and rule sorts.
- **People:** an adult someone is waiting on can't be removed, the same rule as a cardholder.
- **Order:** `transactionsWaiting` groups the rows as Ask <person> in household order with the cardholder's group first, then To discuss. Rows run newest first, as in To sort.

### 2.2 What counts where

| Where | Today | With Waiting |
| --- | --- | --- |
| `transactionsToSort`, Spending's tab count, the nav count | Every unsorted purchase and refund | Unsorted **and not waiting** |
| Spent, Left, pace, To move, Expecting back, Needs a look | Unsorted rows left out | No change: Waiting rows stay out (W1) |
| `addRule`'s "also sorted" | Every unsorted row it matches | Skips Waiting rows |
| Import and refund matching | Never touches sorted rows | New rows are never waiting. A refund whose purchase is waiting gets the usual suggestions. |
| `billSum` | Bill = In the Amex pot + To move + To sort + Expecting back | Adds **Waiting** (count and £). To sort leaves Waiting rows out. *Covered* needs none waiting. |
| `freshness` | "… · 3 to sort" | Adds "· 6 waiting" |
| `closeMonthPlan` readiness | Can close once nothing is to sort | Also needs **nothing waiting** (W10). Home's "All November transactions sorted" is done only when none are waiting. |
| `statementSummary` ready and settled | Nothing to sort | Nothing to sort. From PR 7, Waiting is allowed only on a bill paid from the Amex pot. A statement that settles once still needs every row sorted, because its shares must add up to the bill. |

### 2.3 Covering waiting rows at settle up

```ts
// CardTracker
fronts?: Front[]
interface Front {
  id: string; cardId: string; statementKey: string
  at: string                     // the Pay tick's time
  source: BudgetDestination      // the buffer by default
  transactions: Array<{ transactionId: string; pence: number }>
}
// StatementRecord
frontSource?: BudgetDestination  // "Cover the waiting from", chosen before Pay
```

- **Recording:** ticking Pay on a bill paid from the Amex pot, while rows are waiting, writes one Front. It holds each waiting row's amount, less anything that row had already moved, as `billSum`'s To sort works it out. Unticking Pay removes the Front. The source defaults to the card's buffer (`bufferOf`) and can be any pot or account, as covers can.
- **Balances:** the Amex pot's `paid` flow becomes the Pay amount less the Front. The source pays the Front: a `front` flow out of a source pot, or for an account (Joint's main balance), `bufferBalance` takes it off.
- **Paying back:** once a fronted row is sorted, it's To move as usual. `moveSteps` sends its lines to the Front's source instead of the Amex pot. For example, "Out of Going out" lands in Joint's main balance with no further step, and a source pot gets "Into <pot>". The same `SetAsideMove` records it. The Amex pot's inflow leaves fronted rows out, and the source gets them instead.
- **Owed back:** a Front's total, less what its rows have moved since `at`. `frontsOwed(document)` feeds Home's "Pay the buffer back" and the Move sheet's line "£124.40 still owed, for the 4 still waiting".
- **No change:** Should hold and the Amex pot check. Fronted rows belong to a bill that's paid, and paid bills never count in Should hold.
- **Nothing to pay back:** a row sorted to the source itself (Joint's one-offs, when the buffer is Joint's main balance) moves no money. Recording it clears what's owed.

## 3. Words on screen

**Waiting** on its own means the new state, and nothing else. North already says "waiting" in four places. Each keeps a longer phrase, or is renamed.

| Words | Where | Notes |
| --- | --- | --- |
| **Waiting**, "6 waiting", "£212.40 waiting" | Spending section, freshness line, bill parts, Home's Amex card | The new state |
| **Ask Ada · Ask Ben · To discuss** | Wait menu, sheet buttons, group headings | Cardholder first |
| **Not ready to sort?** · **Mark waiting · Ask Ada** | Wait menu and sort sheet | The note box is labelled "Note (optional)" |
| **Go through them** · "Go through with Ada · 1 of 4" · **Skip · still waiting** · **Back to To sort** | Group headings, the sheet | Phone says Skip |
| "Go through 4 with Ada" · "2 to discuss" | Home To do | "The oldest has waited 8 days" |
| **Before you can close November** | Close <Month> | **Renamed** from "Waiting" |
| "Close November once nothing is waiting" | Close's disabled button | |
| "Cover the waiting from" · "£1,042.46 from the Amex pot + £212.40 from the buffer for 6 waiting" | Settle up's Pay step | Step renamed "Pay Amex from Monzo Joint" |
| **Waiting on this bill** | Statement page | |
| **Pay the buffer back** · "£88.00 stays in Monzo Joint's main balance" | Home To do, Move sheet | |
| Kept: "Waiting to move", "Waiting to settle", "Waiting for Ada's £294.64", "Waiting for late October transactions to post." | Pot sums, Payday, Close | Always a longer phrase, so they don't read as the state |

The glossary in `product-design-spec.md` gains Waiting, Ask <person>, To discuss, Go through them and Pay the buffer back. `card-tracker-rules.md` gains a **Waiting** section in PR 2, and each later PR extends it.

## 4. The PR series

Eight PRs, in order, each branched from fresh main and squash-merged once `gh pr checks <n>` passes. PR 1 is review tooling. Without it, neither Chrome nor Device Hub can reach Close (4 Dec), settle up (18 Dec) or paying back (20 Dec), because Playwright's clock is no longer in the loop.

| PR | Branch | Builds | Decisions | Size |
| --- | --- | --- | --- | --- |
| 1 | `waiting/1-review-clock` | A date for the local build only, so reviews can stage any day | — | S |
| 2 | `waiting/2-model` | The mark, what counts where, Close blocked, the rules doc | W1, W4–W6, W10 | M |
| 3 | `waiting/3-spending` | Set aside on top, the Waiting section, opening a waiting row | W8, W9 | M |
| 4 | `waiting/4-mark` | Clock icon, the W key and its menu; the phone's "Not ready to sort?" | W5–W7 | M |
| 5 | `waiting/5-go-through` | Go through them, from every place that lists waiting rows | W9 | M |
| 6 | `waiting/6-close-home` | Close's blocker, Home's To do rows, "waiting" on the bill and freshness line | W10, W12 | M |
| 7 | `waiting/7-front` | Settle up with rows waiting: the buffer covers them, and the Front is recorded | W3, W11 | M–L |
| 8 | `waiting/8-pay-back` | The Move sheet pays the buffer back; Home's "Pay the buffer back" | W11 | M |

### 4.1 Review clock (`waiting/1-review-clock`)
- **Builds:** `src/reviewClock.ts`, imported first in `main.tsx`. In `--mode localonly` only, `?today=2026-12-04` stores `north.review.today`, and `Date` reads that day at the current time of day. `?today=` with no date clears it. A pine chip, "Review date: Fri 4 Dec · Clear", shows while it's set. Vite drops the code from the production build because the mode check is static.
- **Tests:** the clock is off without the mode; a production `vite build` has no `north.review.today` string in it (a script check in CI).
- **Review:** Chrome on desktop sets 4 Dec, and Month's stage chip reads "Ended". In Device Hub, Safari on the iPhone 17 shows the chip below the safe area.

### 4.2 Model (`waiting/2-model`)
- **Builds:** §2.1 and §2.2: the mark, `markWaiting`/`clearWaiting`, the sort helper that drops the mark, `transactionsWaiting`, the `addRule` skip, `billSum.waiting`, `freshness.waiting`, Close readiness and the adult-removal guard. Settle readiness stays strict until PR 7, so a bill can't be paid with rows waiting before the buffer can cover them (WP2).
- **Files:** `cardTracker.ts` (type and validation), `cardSorting.ts`, `cardRefunds.ts`, `expectingBack.ts`, `billSum.ts`, `monthStages.ts`, `homeInbox.ts` (the sort task and the sorted task), `navCounts.ts`, `spendingFormat.ts`, `budgetDocument.ts`, and `card-tracker-rules.md` §Waiting.
- **Tests:** validation (with a sort, on a payment, a stranger, a long note); each sort writer clears the mark; the To sort and Waiting lists; the five-part bill adds up; Close stays blocked until nothing is waiting; rules skip waiting rows.
- **Review:** nothing visible yet. Chrome checks that the baseline's Spending, Home and Month read exactly as on main.

### 4.3 Spending layout (`waiting/3-spending`)
- **Builds:** the To sort tab's order (W8). Desktop's Set aside becomes one line on top: "Set aside in the Amex pot · £172.20 · 6 transactions sorted since Fri 20 Nov", with See the moves (opens the steps in place), Not all of it and Mark £X moved. On phone, the Set aside card moves to the top. The Waiting section groups rows by reason, each with its count, total and **Go through them** (live from PR 5). Desktop rows show date, merchant, the note on a second line, card, amount and days waited. Phone rows show the note in the meta line. Opening a waiting row opens the sort sheet with the note first, **Change**, and **Back to To sort**.
- **Files:** `Spending.tsx`, new `WaitingList.tsx`, `SortSheet.tsx`, `Spending.css`.
- **Tests:** section order with and without rows to sort; the grouping and totals; the tab count leaves Waiting out; Back to To sort.
- **Review:** Chrome at 1440 against wireframe 1. Responsive at 1024, 768, 390 and 320: the one-line band wraps its buttons, and the note line ellipsises rather than widening the table. Device Hub on the SE and the Pro Max: rows stay 56pt, and the Waiting group heading's button is 44pt.

### 4.4 Marking a row (`waiting/4-mark`)
- **Builds:** desktop's clock icon sits in the Split column, so there's no new column and no new row height. The **W** key opens the same menu: Ask <cardholder> first, then the other adult and To discuss (1–3 to choose), Note (optional), Mark waiting. Enter marks it, Esc cancels, and focus moves to the next row. On phone, the sort sheet's "Not ready to sort?" works like choosing a pot: choosing a reason swaps the footer to "Mark waiting · Ask Ada" and shows the note box. After marking, the message reads "ZARA UK LONDON is waiting: Ask Ada." with **Undo**. The same menu is **Change** on a waiting row (PR 3).
- **Files:** `SortTable.tsx`, new `WaitMenu.tsx`, `SortSheet.tsx`, `Spending.tsx`.
- **Tests:** the keys (W, 1–3, Enter, Esc); a reason is required; payments get no clock; Undo restores To sort; the column count is unchanged.
- **Review:** in Chrome, keyboard-only marking of 3 rows, and the menu stays inside the viewport for the last row at 1440 and 1024. Device Hub: the note box doesn't zoom (16px text); with the keyboard up, Mark waiting stays visible in Safari and in the Home Screen app; check landscape on the 17.

### 4.5 Go through them (`waiting/5-go-through`)
- **Builds:** the sort sheet's go-through mode: "Go through with Ada · 1 of 4 · £154.40", a progress bar, the note first, **Skip · still waiting**, Place moves on, and "Next: BOOTS 1182 SIDCUP · £23.45". The end message reads "Gone through 4 with Ada: 3 sorted, 1 still waiting." Split and Receipt items work as they do today. It opens from the Waiting group headings, and later from Close (PR 6), the statement page (PR 7) and Home (PR 6).
- **Files:** `SortSheet.tsx`, `Spending.tsx`, new `goThrough.ts` (the queue, fixed when the sheet opens).
- **Tests:** the queue order; Skip keeps the mark; Place moves on; a row sorted elsewhere drops out; the end message's counts.
- **Review:** Chrome walks a whole group with the mouse and with Enter. Device Hub on the SE: the progress bar and footer fit at 320 with the note showing.

### 4.6 Close and Home (`waiting/6-close-home`)
- **Builds:** Close's "Waiting" section becomes **Before you can close November**. Its row reads "6 waiting · £212.40 · Ask Ada 4 · To discuss 2" with Go through them. A line under the covers reads "The 6 waiting aren't counted yet, so these figures may change." The disabled button reads "Close November once nothing is waiting". On Home, the To do gains a row per reason ("Go through 4 with Ada · £154.40 · the oldest has waited 8 days", "2 to discuss"), each opening the go-through. The Close task's meta says what's waiting, the freshness line adds "· 6 waiting", and the Amex card adds "£212.40 waiting". "£X waiting" also joins every bill line: Bills it pays, Month's Amex row, the statement page and Bring in.
- **Files:** `CloseMonth.tsx`, `homeInbox.ts`, `Home.tsx`, `Freshness.tsx`, `spendingFormat.ts` (`billParts`), `SetAsideCheckLead.tsx`, `month/PotsSection.tsx`, `StatementsPanel.tsx`, `BroughtInLines.tsx`, `copy.vocabulary.test.ts`.
- **Tests:** the Home rows and their order; the Close blocker; bill parts add up; the copy guard.
- **Review:** Chrome on 4 Dec (review clock) against wireframes 4 and 7, with the To do sheet open. Responsive: Home's three cards at 1024 and 768. Device Hub: Close's pinned footer above the home indicator in the Home Screen app.

### 4.7 Settle up with rows waiting (`waiting/7-front`)
- **Builds:** `Front`, `StatementRecord.frontSource` and validation. Readiness relaxes for bills paid from the Amex pot. The Pay step is renamed "Pay Amex from Monzo Joint", with the caption "£1,042.46 from the Amex pot + £212.40 from the buffer for 6 waiting", **Cover the waiting from** (buffer by default, any pot or account), and the buffer's checked balance. The statement page gets a Waiting part and the section **Waiting on this bill** with Go through. The Pay tick writes the Front, and unticking removes it. In the flows, the Amex pot pays the bill less the Front, and the source pays the Front.
- **Files:** `cardTracker.ts`, `cardStatements.ts`, new `fronts.ts`, `potBalances.ts`, `buffer.ts`, `StatementsPanel.tsx`.
- **Tests:** the Front's figures, including a row that had moved before; untick removes it; the Amex pot and buffer balances; the Amex pot check doesn't shift; a statement that settles once still needs everything sorted.
- **Review:** Chrome on 18 Dec against wireframe 5: tick Pay, then check the Amex pot page and Check balances' buffer row. Device Hub: the source select on the 17 in Safari.

### 4.8 Paying the buffer back (`waiting/8-pay-back`)
- **Builds:** `moveSteps` routes fronted rows' lines to the Front's source. The Move sheet adds "£88.00 stays in Monzo Joint's main balance: it pays the buffer back for the November bill. £124.40 is still owed, for the 4 still waiting." What it covers is split into "Pays the buffer back · November bill" and "Into the Amex pot · December bill". The Amex pot's inflow leaves fronted rows out, and the source's balance gains them. `frontsOwed` feeds Home's To do "Pay the buffer back · £88.00" and a line on the desktop Set aside band. Undo on a move undoes the pay-back too.
- **Files:** `setAside.ts`, `fronts.ts`, `potBalances.ts`, `buffer.ts`, `MoveToPotSheet.tsx`, `homeInbox.ts`, `Spending.tsx`.
- **Tests:** the routing for a Joint pot, a personal pot and a source pot; mixed December and pay-back moves; owed back after a partial move; a row sorted to the source itself needs no step.
- **Review:** Chrome on 20 Dec against wireframe 6: Moved, then the Amex pot and buffer figures, then Undo. Device Hub: the Move sheet scrolls with its footer pinned on the SE.

## 5. Review: Chrome and Device Hub

Each PR is reviewed three ways before it merges: Google Chrome on desktop against the local build, Chrome at responsive widths, and Device Hub on three iPhones. After deploy, it gets a read-only live review in Chrome. Tests still gate the merge (CI runs `npm run check`; locally, `npx eslint src scripts && npm test && npm run build`). This series doesn't use Playwright screenshots.

### 5.1 Set up once
- **Dev server:** `npm run dev -- --port 5174 --strictPort --mode localonly`, with no sign-in and browser storage.
- **Review states** (untracked, kept locally, example figures only): a states script builds four documents from the baseline fixture, and a seed page loads one, sets the review clock (PR 1) and opens Home. The script grows as PRs land: s3 and s4 need PR 7's Front.

| State | Date | What it holds | Used by |
| --- | --- | --- | --- |
| s1 | Mon 23 Nov | 3 to sort, 6 waiting (4 Ask Ada, 2 To discuss), £172.20 to move | PRs 2–6 |
| s2 | Fri 4 Dec | November ended and all in; the 6 still waiting | PRs 5–6 |
| s3 | Fri 18 Dec | November bill closed, final export in, 6 waiting | PR 7 |
| s4 | Sun 20 Dec | Paid with £212.40 covered by the buffer; two rows since sorted | PR 8 |

- **Frames page:** shows one page in same-origin frames 320, 375, 390, 768 and 1024 wide, side by side. They share storage, so the state and clock carry over. One screenshot covers the narrow widths.

### 5.2 Google Chrome (Claude in Chrome)
1. **Desktop review, local:** open a new tab, resize the window to 1440×900, and load the PR's state. Walk the PR's flow and screenshot each moment its wireframe board shows, then compare it against the canvas. Keyboard paths (J/K, W, 1–3, Enter, Esc) run by key presses. The console must be clean of errors and warnings. Record the main flow as a GIF for the PR.
2. **Responsive:** resize the window to 1280, then 1024, then 768. Below Chrome's minimum window width, use the frames page for 390, 375 and 320. In each frame, nothing scrolls sideways (`scrollWidth <= innerWidth`), buttons wrap and aren't cut off, tables scroll inside their box, and targets are 44px at phone widths.
3. **Live review, after deploy:** in a new tab on the live site with the household's real data, read-only. Check that the change is there and that the figures add up: the bill's parts sum to the bill, and To sort plus Waiting equals the old To sort count. Click nothing that changes data unless the owner asks. Real figures stay out of the repo and the PRs.

### 5.3 Device Hub (iOS)
- **Tools:** Xcode 27.2's Device Hub, via `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl`. Taps, typing and rotation go through Xcode's MCP DeviceInteraction tools. The audit 5 simulator tools keep the bridge open and drive the flows, and a Web Inspector client runs page JavaScript (the seed and the review clock), the only way into the Home Screen app.
- **Devices:** iPhone SE (smallest), iPhone 17, and iPhone 17 Pro Max (largest). Each runs Safari on `http://localhost:5174` and the Home Screen app installed from the PWA seed page. **Never attach to a production tab.**
- **What to check on each PR's screens:** the pine header and sheet footers clear the notch and the home indicator; with the keyboard up, the note box and Mark waiting stay in view; nothing zooms when a field takes focus (16px inputs); targets are 44pt; sheets and Close's pinned footer work in landscape (audit 5's F20 and F21).

**Evidence in each PR:** the Chrome desktop shot, the frames shot and Device Hub shots from the SE and Pro Max, pushed to the `pr-assets` branch as in audit 5.

## 6. Order and deadlines

PRs 1–6 must be live by **Thu 3 Dec**, the first day November can close (the last import 3 days after the month ends). PRs 7–8 must be live before the November bill is settled; it closes Tue 24 Nov and is due **Sat 19 Dec**.

- **Order:** each PR builds on the one before. Marked rows need PR 3's section to show in, and PR 8 routes money using PR 7's Front.
- **If PR 6 slips past 3 Dec:** Close is blocked but doesn't say why. Rows can go Back to To sort, which today's Close screen explains.
- **Until PR 7:** settle up waits for every row to be sorted, as it does today (WP2).
- **Live setup:** after PR 4, mark the rows parked in the audit 6 review; after PR 7, choose where the waiting rows are covered from when settling.
- **After every deploy:** a read-only live review in Chrome (§5.2).

## 7. Decisions made while planning (to confirm)

These came up while planning and aren't in W1–W12. Each is the default the PRs build unless Nick changes it; the working doc tracks each one's status.

| # | Decision | Why |
| --- | --- | --- |
| WP1 | A review clock in local builds only (PR 1), never in production | Chrome and Device Hub can't stage 4, 18 or 20 Dec without one |
| WP2 | Settle up stays blocked by Waiting until PR 7 ships | Paying before the buffer can cover waiting rows would leave the Amex pot reading short |
| WP3 | A statement that settles once (before the Amex pot) still needs every row sorted | Its shares must add up to the bill; none of these are left unsettled |
| WP4 | Only rows in To sort can be marked. A sorted row goes back to To sort first. | One way in keeps the table and the sheet simple (W7) |
| WP5 | Days waited count from when it was marked, not the purchase date | "Waited 8 days" is about the conversation, not the shop |
| WP6 | Notes are up to 140 characters, on one line | They show on the row and in the sheet without wrapping the table |
| WP7 | A rule never sorts a waiting row, including one made later with Always | Waiting is a person's hold; a rule shouldn't undo it |
| WP8 | The go-through queue is fixed when it opens; rows marked later join the next one | So "1 of 4" never shifts mid-conversation |
| WP9 | Unticking Pay removes the Front; pay-backs already moved become ordinary Amex pot moves | Undo stays honest, and nothing is stored twice |
| WP10 | On Home, the waiting rows rank after Sort. With 3 or more rows, Set aside moves under Open, as wireframed. | Decisions before transfers; the Set aside band leads Spending (W8) |
