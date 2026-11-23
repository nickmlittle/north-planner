# Card tracker (Spending) rules

**Status:** agreed with Nick on 11 November 2026. Built in the `card/1`–`card/12` PR series (#126–#137) from the [build plan](card-tracker-build-plan.md), which holds the full design, the Amex export format (§4) and the screens (§7). This document is the contract for what has shipped; keep it current with each PR. Where they disagree, the build plan's decisions (D1–D16, R1) win until this document is updated with Nick.

Related: [transfer calculation rules](transfer-calculation-rules.md) (ticks, Move, Funding), [recurring monthly budget rules](recurring-monthly-budget-rules.md) (calendar months, snapshots), [product design spec](product-design-spec.md) (layout, language, glossary).

## What has shipped

| Part | PR | Code |
| --- | --- | --- |
| Data model, validation, statement and date helpers, Household → Cards | 1 | `src/domain/cardTracker.ts`, `src/pages/CardSettings.tsx` |
| XLSX reader, Amex import, rule matching, synthetic fixtures | 2 | `src/domain/xlsx.ts`, `src/domain/amexImport.ts`, `src/domain/cardSorting.ts`, `scripts/amex-fixture.mjs` |
| Spending tab, Bring in, To sort, manual entry, baseline card data | 3 | `src/pages/Spending.tsx`, `BringInSheet.tsx`, `ManualEntrySheet.tsx`, `src/state/navigation.ts` |
| Sort sheet, suggestions, rules, Sorted by rules, All transactions | 4 | `src/domain/cardSorting.ts`, `src/pages/SortSheet.tsx`, `RulesPanel.tsx` |
| Splits: by amount, half each, funding share, receipt items | 5 | `src/domain/cardSplits.ts`, `src/pages/SplitEditor.tsx` |
| Refund matching, refund of a split, linked rows, payments listed apart | 6 | `src/domain/cardRefunds.ts`, `src/pages/SortSheet.tsx` |
| This month: planned vs spent, pace, pot detail and chart, pot settings | 7 | `src/domain/cardSpending.ts`, `src/pages/SpendingMonth.tsx`, `BudgetManagement.tsx` |
| Carry-over pots: Free, Check against the bank, annual costs | 8 | `potFree`, `checkPotBalance`, `annualCosts` in `cardSpending.ts`; `src/domain/cardStatements.ts` (settle keys) |
| Statements, statement detail, settle up | 9 | `src/domain/cardStatements.ts`, `src/pages/StatementsPanel.tsx` |
| Month stages, Close <Month>, covers, leftovers and the build-up flag | 10 | `src/domain/monthStages.ts`, `src/pages/CloseMonth.tsx` |
| Home month cards, paydays, England and Wales working days | 11 | `homeMonths` in `monthStages.ts`, `src/domain/workingDays.ts`, `src/pages/HomeMonths.tsx`, `IncomeDialog.tsx` |
| Desktop: keyboard sorting table, side panel, settle up in columns | 12 | `src/pages/SortTable.tsx`, `SpendingSide.tsx` |
| Amex pot 1: set-aside pot setting, moves, what's left to move and its steps | A1 | `src/domain/setAside.ts`, `shareSteps` in `cardStatements.ts`, `src/pages/CardSettings.tsx` |
| Amex pot 2: Move sheet, Spending callout, Undo, moved tags, Home task | A2 | `src/pages/MoveToPotSheet.tsx`, `Spending.tsx`, `HomeMonths.tsx`, `homeMonths` in `monthStages.ts` |
| Amex pot 3: every pot's balance worked out, Check balances, the Amex pot's page | A3 | `src/domain/potBalances.ts`, `src/pages/CheckBalancesSheet.tsx`, `SpendingMonth.tsx` |
| Amex pot 4: settling a statement from the Amex pot | A4 | `settleSteps`, `settleStepDone`, `refreshSettled` in `cardStatements.ts`, `src/pages/StatementsPanel.tsx` |
| Amex pot check 1: should hold, the check, extra and top-ups, covering a bill | C1 | `src/domain/setAsideCheck.ts`, the `gap` flow in `potBalances.ts`, `GapMove` in `cardTracker.ts` |
| Amex pot check 2: the check on the Amex pot's page, Month's Amex row | C2 | `src/pages/SetAsideCheckLead.tsx`, `SetAsidePot` in `SpendingMonth.tsx`, `src/pages/month/PotsSection.tsx` |
| Amex pot check 3: Check balances, settle up's cover line, Home | C3 | `src/pages/CheckBalancesSheet.tsx`, `SettleSteps` in `StatementsPanel.tsx`, `gap` in `homeMonths` and `homeInbox` |
| Month health 4: one sum per bill and per pot (D1, D2, D13) | health/4 | `src/domain/billSum.ts`, `src/domain/potSum.ts`, `SetAsideCheckLead.tsx`, `PotSumSection` in `SpendingMonth.tsx` |
| Month health 5: pot pages by kind, This week, typical shop, Try an amount (D2, D3) | health/5 | `src/domain/afford.ts`, `src/domain/potSum.ts`, `src/pages/PotLeads.tsx` |
| Month health 8: Can we afford… sheet, the buffer check and the overlap-day month line (P9) | health/8 | `src/domain/afford.ts`, `src/domain/buffer.ts`, `src/pages/AffordSheet.tsx`, `affordText.ts`, `CheckBalancesSheet.tsx` |
| Month health 7: what a bring-in did, Just brought in, earlier months in To sort | health/7 | `src/domain/bringIn.ts`, `src/pages/BroughtInLines.tsx`, `BringInSheet.tsx`, `Home.tsx`, `monthHeads` in `spendingFormat.ts` |
| Month health 9: Expecting back: the Back tick, held lines, the bill's fifth part, refunds, settle up, Not coming back (D11, P7) | health/9 | `src/domain/expectingBack.ts`, `src/pages/ExpectingBack.tsx`, `SplitEditor.tsx`, `MoveToPotSheet.tsx`, `PotLeads.tsx` |
| Month health 10: discounts, original prices and Add discount (D12) | health/10 | `src/domain/cardSplits.ts`, `src/pages/SplitEditor.tsx` |
| Month health 11: How did <Month> go?, leading Home (P8); Needs a look drops a covered overspend | health/11 | `src/domain/monthSummary.ts`, `src/pages/MonthSummaryCard.tsx`, `Home.tsx`, `MonthPage.tsx`, `coveredAtClose` in `cardSpending.ts` |
| Waiting 2: the Waiting mark, what counts where, Close blocked (W1, W4–W6, W10) | waiting/2 | `WaitingMark`, `withSort` in `cardTracker.ts`; `markWaiting`, `clearWaiting`, `transactionsWaiting` in `cardSorting.ts`; `billSum.ts`, `monthStages.ts`, `cardStatements.ts` |
| Waiting 3: Set aside on top, the Waiting section, opening a waiting row (W8, W9) | waiting/3 | `WaitingList.tsx` (the section and `WaitingFields`), `Spending.tsx`, `SortSheet.tsx`; `waitingReason`, `waitingReasons`, `waitedFor` in `spendingFormat.ts` |
| Waiting 4: mark a row waiting: the clock, W and its menu; the sheet's Not ready to sort? (W5–W7) | waiting/4 | `WaitMenu.tsx`, `SortTable.tsx`, `SortSheet.tsx`, `Spending.tsx` |
| Waiting 5: Go through them (W9, WP8) | waiting/5 | `src/domain/goThrough.ts`, `SortSheet.tsx`, `Spending.tsx`; `goThroughTitle`, `goThroughEnded` in `spendingFormat.ts` |
| Waiting 6: Close and Home: Before you can close, Home's waiting rows, waiting on the bill and freshness line (W10, W12, WP10) | waiting/6 | `GoThroughSheet.tsx`, `CloseMonth.tsx`, `Home.tsx`, `homeInbox.ts`, `Freshness.tsx`; `startMonthGoThrough` in `goThrough.ts`; `billParts` in `spendingFormat.ts` |
| Waiting 7: settle up with rows waiting: the buffer covers them, and the Front is recorded (W3, W11, WP3, WP9) | waiting/7 | `src/domain/fronts.ts`; `Front`, `StatementRecord.frontSource`, `bufferSource` in `cardTracker.ts`; `cardStatements.ts`, `potBalances.ts`, `buffer.ts`, `billCover` in `setAsideCheck.ts`; `StatementsPanel.tsx` |
| Waiting 8: paying the buffer back through the Move sheet, and Home's Pay the buffer back (W11) | waiting/8 | `frontsOwed`, `payBackLines`, `paidBackInto` in `fronts.ts`; `moveSteps`, `moveTotal`, `ToMoveRow.front` in `setAside.ts`; `potBalances.ts`, `buffer.ts`, `monthStages.ts`, `homeInbox.ts`; `MoveToPotSheet.tsx`, `setAsideMove.ts`, `Spending.tsx` |

## The contract (decisions D1–D16, R1)

1. **Budget month = calendar month** (D1). Pay that arrives at the end of a month is next month's money. Christmas early pay is January's.
2. **A transaction counts in the month of its date** (D2), whatever statement it's on.
3. **Its statement comes from the export's period** (`statementKey`), not its date (D16, §4.1). Manual entries use the date window.
4. **Everything is sorted** (D3) to a pot or an account. Payments to Amex are not sorted.
5. **Splits are stored as lines that add up to the transaction** (D4): by amount, half each, the 60/40 funding share, or typed-in receipt items.
6. **Refunds go back to the original pot**, in the month they arrive (D5), and lower that pot's share of the next statement.
7. **Settle up once per statement via Joint Monzo** (D6): each pot's share moves to the pay-from account, then the bill is paid by hand from it.
8. **Overspend covers are ticked on the Close month screen** (D7, R1), from the buffer (the pay-from account's main balance) by default, or another pot with money left, or next month's funding (which moves no money).
9. **Leftovers stay in the pot** (D8). A monthly pot holding more than its build-up limit (default 2× its monthly Planned, set per pot) is flagged.
10. **Carry-over pots** (D9) show a balance and what's free, not a pace. **Pace only for steady pots** (D10), a per-pot setting.
11. **One Close button for the household** (D11). Ticks are household-wide for now (D15).
12. **The tab is called Spending** (D12). **Split rules** are modelled but their UI comes last (D13). Every figure is computed from stored data, so a future feed can replace the manual steps (D14).
13. **The Excel export is required** (D16). The CSV isn't supported. Statements for this Amex run from the 25th to the 24th; payment is due 25 days after the close.

## Data model

The tracker is an optional `card` field on the budget document, like `ticks`. A document without it is valid and there is no version bump. `decodeBudgetDocument` validates it with `validCardTracker`; an invalid `card` makes the whole document invalid, as for `ticks`. Every destination must be an existing pot or account, every person an adult, and every transaction's card and statement must exist. Split lines must add up to their transaction. An adult who is a cardholder, a transaction's person, or someone a row is waiting on can't be removed.

Money is integer pence everywhere. Spreadsheet amounts are floats and become pence with `Math.round(value * 100)` (`penceFromAmount`); typed amounts are parsed without floats (`parsePence`).

Types (`src/domain/cardTracker.ts`) follow plan §5.1, with these refinements:

- `CardTransaction.merchant` stores `merchantKey` of the raw description at import. The stored description is whitespace-collapsed, so the padding between merchant and town is gone by then, and suggestions and refund matching need the merchant.
- `TransactionSort.checkedAt` records "Check" on a rule's sort.
- `StatementRecord.finalImportAt` records the final export (an import of the period, taken after its close, that matched Amex's summary), and `settleWithoutFinalAt` the override.
- `MonthRecord.summarySeenAt` records "Seen it" on the month's summary (month-health P8).
- `MonthRecord.allInAt` records "All <Month> transactions are in", and `closedSpent` what each destination had spent at close, for "Changed since closed".
- `PotTracking.keptBuildUpPence` records "Keep it" on a build-up flag.

Only the reference, date, collapsed description, merchant, pence, card suffix, Amex category, statement and import time are stored for each row. Card Member, address fields and Extended Details are dropped, as are the header block's name and account number.

## Cards (Household)

- Creating a card **requires the closing day (1–28) and the days until payment is due (1–60)**. There are no silent defaults. The form shows the result as you type: "Statements run from the 25th to the 24th. The 24 Nov statement is due 19 Dec."
- The name defaults to "Amex". It's paid from the joint account by default (the first account with more than one owner). The buffer defaults to the pay-from account's main balance and can be any pot or account.
- Cards are mapped to people by the Account # suffix ("Card ending"), stored without Amex's leading minus, never by name. Mapping a suffix gives its earlier unmapped transactions a person.
- There is no delete: a card's transactions and statements depend on it.

## Statements and dates

- For close day *d*, a statement's window runs from the previous close date + 1 to the close date (`statementWindow`). `closeDateFor(date, d)` gives the close date whose window holds a date. Only manual entries use the window; imports use the export's period.
- The due date is the close date + `dueDaysAfterClose` (`dueDate`): the 24 Nov 2026 statement is due 19 Dec 2026.
- Date helpers work on `YYYY-MM-DD` strings in UTC, so a time zone never shifts a day. "Today" is the device's local date.

## Bringing in the Excel export

`importAmexWorkbook(document, cardId, bytes, fileName, now)` reads the workbook and brings it in. It is pure apart from reading the bytes; `now` is the import time.

1. **Read the workbook** with the dependency-free reader in `xlsx.ts`: the ZIP central directory, stored or deflated entries (inflated by `DecompressionStream('deflate-raw')`), the workbook and its relationships to find sheets by name, shared strings (rich-text runs joined, phonetic runs skipped) and cells of type `s`, `inlineStr`, `str`, `n` and `b`, parsed with `DOMParser`.
2. **Check the layout:** both `Transaction Details` and `Transaction Summary` exist, and a row holds the 13 columns in order (row 7 in real exports). Otherwise nothing is imported and the message is "This doesn't look like an Amex Excel export. Download the Excel version of your transactions." A CSV, another spreadsheet or random bytes all get this message.
3. **Read the period** from B1 (`… / Oct 25, 2026 to Nov 24, 2026`, English month abbreviations). The statement is `cardId:<period end>`. Read Previous Balance, Payments & Credits, Charges and Total Balance from the summary sheet. A missing figure, an unreadable period, or a row whose date or amount can't be read stops the import with a message naming it.
4. **Map each row:** the date (text `DD/MM/YYYY`, or an Excel date serial), pence (`Math.round(value * 100)` for numeric cells), the kind (§4.5: a negative `PAYMENT RECEIVED…`, or a negative blank-category `…PAYMENT…`, is a payment; other negatives are refunds; positives are purchases, fees and interest included), the card ending (without its minus) → person, the Reference, and the statement. A row dated before the period still goes on the export's statement, and counts in the month of its date.
5. **Check the summary** over every row in the file, new or not: positives must equal Charges and negatives Payments & Credits. A mismatch is a warning, not a failure, with the amounts missing. The summary is stored on the statement.
6. **Deduplicate** by Reference; without one, by `date|pence|normalised description|card ending`. Re-importing a file adds nothing; an overlapping export adds only its new rows.
7. **Match refunds, then apply the rules.** Each new refund first looks for its purchase (§6.4, below), among existing transactions and this file's purchases (a file lists newest first, so a refund comes before its purchase). A match wins over the rules. Otherwise, apply the rules to new purchases and refunds (never payments): the first rule, in list order, whose text appears in the normalised description, on its card if it names one. A split rule divides the amount by percent into pennies that add up (floor each share, spare pennies by largest remainder, earlier parts first).
8. **Record** an `ImportRecord` (the last 50 are kept). The result gives the counts for the Bring in sheet: rows, already here, new, sorted by rules, to sort, payments, the summary check and the latest date.
9. **Unknown card endings** are still imported, with no person, and listed so the screen can ask whose card it is. A period that doesn't end on the card's closing day is flagged so the setting can be updated.
10. **A final export:** an import taken after the period's close that matches the summary sets the statement's `finalImportAt` (it is then *complete*, §6.7).

`scripts/amex-fixture.mjs` writes `docs/fixtures/amex-export-sample.xlsx` (15 fictitious rows: a payment, a refund, a row dated the day before the period, a newline in Extended Details, two card endings, a matching summary) and `amex-export-mismatch.xlsx` (Charges £12.34 higher). Tests use only these and workbooks built by `xlsx.testing.ts`. Never put a real export, or anything from one, in the repo.

## What a bring-in did (month-health PR 7)

`importChanges(document, at, today)` in `src/domain/bringIn.ts` says what the import made at `at` changed, as the document stands now. Nothing is stored: the import's rows are the ones whose `importedAt` is `at` (manual entries are never counted), and "before" is the document without them (`withoutImport`). It returns:

- **Sorted to:** the destinations of the added purchases and refunds, biggest first. A split row counts once under each pot.
- **Earlier months:** added purchases and refunds dated before the month of `today`, by month ("3 are October's"). They still count in their own month, as they always did.
- **Pot changes:** each Tracked pot's pace this month, before and after: "Groceries went from on track to £73 ahead". Only pots whose phrase changed are listed.
- **Bills gone out:** added purchases sorted to a Carries over pot.
- **Refunds:** each added refund with the purchase it answers (`refundOf`) and where it went back, or "no purchase found" / "to sort".
- **The bill:** `billSum` of the statement the file was for, as it is now. Null when that statement isn't paid from the Amex pot.

It is null for an unknown import or one that added nothing. `justBroughtIn(document, today)` is the latest import's changes while it's the day of the import or one of the two after (`JUST_BROUGHT_IN_DAYS`); Home shows it as **Just brought in**. The Bring in sheet shows the same lines straight after the import, plus the month's verdict (`homeInbox().verdict` on the new document).

**To sort by month.** When To sort holds rows from more than one month, each month gets a heading ("November", "October · earlier month"): `monthHeads` in `spendingFormat.ts`, used by the phone list and the desktop table. With one month there are no headings. Close <Month> counts earlier-month rows as before.

## Adding by hand

`addManualTransaction` adds a transaction with id `manual:<uuid>`: a date, description, amount (a refund is negative) and card ending. Its statement comes from the date window (`statementFor`), its merchant is the whole typed description (typed text has no Amex padding), and the rules apply as on import.

## To sort

`transactionsToSort` is every purchase and refund with no sort that isn't waiting (`needsSort`), newest first (by date, then the order they came in). Payments are never listed. "Last brought in" is the latest `ImportRecord`'s time (`lastImport`), so a future feed that records imports updates it the same way.

## Waiting (audit 6, W1–W12)

**Status:** `waiting/2-model` (W1, W4–W6, W10, WP2–WP7), `waiting/3-spending` (W8, W9), `waiting/4-mark` (W5–W7), `waiting/5-go-through` (W9, WP8), `waiting/6-close-home` (W10, W12, WP10) and `waiting/7-front` (W3, W11, WP3, WP9), built 23 November 2026 from the [Waiting build plan](waiting-build-plan.md). A row goes **To sort → Waiting → Sorted**. Waiting is for rows that need the other cardholder, a conversation or an order lookup before they can be sorted. The screens come in later PRs; this section grows with them.

- **The mark** (`CardTransaction.waiting`, W4): `on` is an adult (`{ kind: 'person', personId }`, "Ask Ada") or `{ kind: 'discuss' }` ("To discuss"), with an optional `note` and `at`, when it was first marked. A reason is required and a note is optional (W6). The note is trimmed and kept on one line, up to 140 characters (`WAITING_NOTE_MAX`, WP6). Waiting is a mark on the transaction, never a sort.
- **Validation:** the mark is allowed only on a purchase or refund with no sort, waiting on an adult in the household or To discuss. A mark with a sort, on a payment, for someone else, or with a longer note makes the document invalid.
- **Marking** (`markWaiting`): only a row in To sort (WP4). A sorted row goes back to To sort first. Changing the mark keeps `at`, so days waited count from when it was first marked, not from the purchase date (WP5). **Back to To sort** is `clearWaiting`.
- **Sorting clears it:** every write that sets a sort goes through `withSort`, which drops the mark: `sortTransaction`, `restoreSort`, `sortRefund`, `linkRefund` and rule sorts. Undo of a placing passes the row's old mark to `restoreSort`, so the row goes back to Waiting.
- **Rules never sort a waiting row** (WP7): `addRule`'s "also sorted" skips them. New rows from an import are never waiting. A refund whose purchase is waiting gets the usual suggestions.
- **People:** an adult someone is waiting on can't be removed, as for a cardholder.
- **The list** (`transactionsWaiting`): one group per reason. The Ask <person> groups come first: adults on a card in household order, then other adults. To discuss comes last. Each group has its count and total, with rows newest first, as in To sort.

**On Spending** (`waiting/3`, W8, W9). The To sort tab runs **Set aside** (always on top), then **To sort**, **Waiting** and **Expecting back**.

- **Set aside**, on desktop, is one line: "Set aside in the Amex pot · £172.20 · 6 transactions sorted since Fri 20 Nov", with See the moves (the steps, opened in place), Not all of it and Mark £X moved. On phones, its card moves to the top.
- **Waiting** reads "6 · £212.40" and groups its rows as `transactionsWaiting` does. Each group shows its reason, count, total and **Go through them** (below). Desktop rows show the date, the merchant with its note on a second line (cut short with an ellipsis), the card, the amount and days waited. Phone rows put the date, the cardholder (when they aren't the one being asked), days waited and the note in the meta line.
- **Days waited** count from `at` (WP5): "today", "1 day", "8 days".
- **With nothing to sort** but rows waiting, To sort reads "Nothing left to sort" ("The 6 waiting are below."), never "Everything is sorted".
- **Opening a waiting row** opens the sort sheet. The reason, how long it has waited and the note come first. **Change** shows the reasons as buttons, the cardholder first, then the other adults and To discuss, plus the note box. The footer then reads "Mark waiting · Ask Ada", and the message after it reads "BOOTS 1182 SIDCUP is waiting: To discuss." Choosing a pot leaves Change. **Back to To sort** clears the mark. Placing the row sorts it and drops the mark, and Undo on the tipped-pot toast puts it back in Waiting.

**Marking a row** (`waiting/4`, W5–W7). Only rows in To sort can be marked (WP4). Marking adds no column and no row height.

- **Desktop:** a clock icon sits beside Split, in the same column. Like ✓ Place, it shows only on the hovered or focused row. The clock or the **W** key opens "Not ready to sort?", under the clock, or over it when the row is near the bottom of the window. It lists the reasons with keys: Ask <cardholder> ("Ada's card") first, then the other adult and To discuss ("Both of you"). The cardholder starts chosen, so W then Enter marks a row. 1–3 choose a reason, the note box is optional, and Enter marks it from anywhere in the menu except Cancel. Enter on a reason button marks that reason. Esc and Cancel close it and put focus back on the row. A click elsewhere closes it too. Once a row is marked, it leaves the table and focus moves to the next row, as after placing one. The table's key line adds "W waiting".
- **Sort sheet** (phones, and any row in To sort opened on desktop): **Not ready to sort?** ("It leaves To sort and counts in no pot until it's sorted.") shows the reasons as buttons, with none chosen. Choosing one works like choosing a pot: the footer becomes "Mark waiting · Ask Ada" and the note box appears. Tapping the chosen reason again, or choosing a pot, goes back to Place. Enter in the note box marks it. The section isn't shown on a sorted row or on one already waiting, which uses Change instead.
- **After marking**, the message reads "ZARA UK LONDON is waiting: Ask Ada." with **Undo**, which puts the row back in To sort ("ZARA UK LONDON is back in To sort.").

**Go through them** (`waiting/5`, W9, WP8). It steps through one waiting group in the sort sheet, one row at a time. It opens from the Waiting group headings, from Home's waiting rows, from Close (`waiting/6`) and from the statement page's Waiting on this bill (`waiting/7`). `GoThroughSheet` runs it over whichever page opened it, so it ends back there.

- **The queue** (`goThrough.ts`) is fixed when it opens (WP8): the group's rows in its order, with its count and total. Close's queue (`startMonthGoThrough`) is every row waiting from that month, all reasons in one queue, in `transactionsWaiting`'s order (the cardholder's group first, To discuss last). Rows marked later join the next go-through, so "1 of 4" never shifts. A row that is no longer waiting (sorted, or sent back elsewhere) drops out and counts as gone through. Only which rows have been dealt with is kept. What happened to each one is read from the document.
- **The sheet** is titled "Go through with Ada" ("Go through what's to discuss", or Close's "Go through November's waiting"). Under the title it reads "1 of 4 · £154.40" (phones leave out the total), with a progress bar. The row's name, amount and date come first, then its reason, days waited and note, with **Change** and **Back to To sort**. The pots, Always, Split and Receipt items work as they do in the sort sheet.
- **The footer** has **Skip · still waiting** ("Skip" on phones) and Place, then "Next: BOOTS 1182 SIDCUP · £23.45", followed by the next row's note on desktop. The last row has no Next line.
- **Moving on:** Place, Skip, a new reason or note (Mark waiting), Back to To sort, and linking a return all move on to the next row. Focus lands on Place, or on Skip when nothing is chosen, so Enter walks the group. The same sheet stays open, and each row starts afresh: its suggestion chosen, nothing ticked. A placing that tips a pot gets no toast here, because the impact line says so before Place.
- **Split** opens the split editor. Saving it counts as sorted and goes on to the next row. Cancel comes back to the same row.
- **The end:** "Gone through 4 with Ada: 3 sorted, 1 back in To sort, 1 still waiting." Parts at zero are left out. Closed part way, it reads "Gone through 2 of 4 with Ada: …", and says nothing if no row was gone through. Close's reads "Gone through November's 6 waiting: …" ("Gone through 2 of November's 6 waiting: …"). On Spending it's the status line, on Home a toast, and on Month the month's status line. On Spending, focus goes back to the Go through them button. If that group has gone, it goes to the first group's button, or to the To sort tab when nothing is waiting.

**On Close and Home** (`waiting/6`, W10, W12, WP10).

- **Close <Month>:** its first section is **Before you can close November** (renamed from "Waiting"), shown while it can't close. Rows to sort come first ("2 transactions to sort", Sort them). Waiting rows from the month are one row: "6 waiting · £212.40", "Ask Ada 4 · To discuss 2 · November can't close until they're sorted", with **Go through them**. Late postings come next (Bring in transactions, All November transactions are in). Once they're all in, a done row reads "All November transactions are in · Brought in Thu 3 Dec · nothing to sort". While rows wait, a line under the covers reads "The 6 waiting aren't counted yet, so these figures may change once they're sorted." The header's Close November stays disabled, with "Close November once nothing is waiting." under the header.
- **Home's To do:** one row per waiting group, in `transactionsWaiting`'s order, ranked straight after Sort and before Set aside (WP10). "Go through 4 with Ada" (or "2 to discuss"), with the group's total, and a meta line that leads with the wait, since phones cut it short: "The oldest has waited 8 days · ZARA UK, BOOTS, AMAZON and 1 more" (merchants, at most three). One row reads "Waited 8 days", and rows marked today read "Marked today". The row opens the group's go-through over Home. The Close task's meta says what's waiting: "6 waiting · Ask Ada 4 · To discuss 2".
- **The freshness line** adds the count: "Amex sorted to Sun 22 Nov · 3 to sort · 6 waiting ›", the link opening Spending's To sort. It reads "all sorted" only once nothing is to sort or waiting.
- **Every bill line** adds "£212.40 waiting" between To sort and Expecting back (`billParts`): Home's Amex card, Month's Amex row, Bills it pays, Just brought in, How did <Month> go? and the statement page's "In the Amex pot" row.

**What counts where** (W1). Waiting rows count in no pot, no pace and no move, the same as rows to sort.

| Where | With Waiting |
| --- | --- |
| `transactionsToSort`, Spending's tab count, the nav count, Home's Sort task | Rows to sort only, not waiting |
| Spent, Left, pace, To move, Expecting back, Needs a look | Unchanged: waiting rows have no sort, so they're left out |
| `potSum`'s and `afford`'s To sort | Rows to sort only |
| `billSum` | Adds **Waiting** (`waiting`, `waitingPence`): its rows' amounts less anything they had moved, the same as To sort. **Covered** needs none waiting. |
| `freshness` | Adds `waiting`, the count: "· 6 waiting" (`waiting/6`) |
| `closeMonthPlan` readiness | `waiting` is counted apart from `toSort`. **Waiting blocks Close** (W10): it can close only once nothing is waiting. Home's "All <Month> transactions sorted" is done only then. The blocker reads "Close <Month> once nothing is waiting." |
| `statementSummary` | `waiting` is counted apart from `toSort`. On a bill paid from the Amex pot, **ready** and **settled** allow rows waiting: the buffer covers them at Pay (W11, `waiting/7`). A statement that settles once, before the Amex pot, still needs every row sorted, waiting ones included, because its shares must add up to the bill (WP3). |

**Settle up with rows waiting** (`waiting/7`, W3, W11, WP3, WP9). A bill paid from the Amex pot can be paid while rows are still waiting. The Amex pot pays what's in it for the bill, and the buffer **fronts** the rest. The household pays Amex from Monzo Joint's main balance after moving the Amex pot's money out, so with the buffer as Joint's main balance, covering needs no extra transfer.

- **The Front** (`Front` in `card.fronts`, `src/domain/fronts.ts`): written by ticking Pay on a bill paid from the Amex pot while rows wait (`setSettleTick` → `recordFront`). It holds the Pay tick's time, the source, and each waiting row with what it still owed the Amex pot: its amount less anything it had moved before it was unsorted (`frontPlan`, the same as `billSum`'s Waiting). Rows that owe nothing are left out, and with nothing waiting there's no Front. Ticking Pay again records it afresh. **Unticking Pay removes it** (WP9). There's at most one per statement (`front:<statementKey>`).
- **The source** ("Cover the waiting from", `StatementRecord.frontSource`, `setFrontSource`) is chosen before Pay. It defaults to the card's buffer (`bufferSource`: Buffer for overspends, else the pay-from account's main balance, never the Amex pot) and can be any pot or account but the Amex pot. Choosing the buffer clears the choice. The Front stores the source it was paid from.
- **Validation:** each Front's card, statement, source and rows must exist, with at least one row, and no statement has two. A chosen source must be an existing pot or account.
- **Readiness:** on a bill paid from the Amex pot, rows waiting don't block **ready** or **settled**, only rows to sort do. The bill counts as settled at Pay (W11). Once a fronted row is sorted it's no part of the statement's "Move the rest" step (it pays the buffer back instead, `waiting/8`), so the bill stays settled. A statement that settles once still needs every row sorted (WP3).
- **Balances:** the Amex pot's `paid` flow is the Pay tick less the Front. A source pot has a `front` flow out at the Pay tick's time ("Covered the waiting on Amex"). A source that is the buffer account comes off `bufferBalance`. Should hold and the Amex pot check don't change: a paid bill never counts in Should hold, and the pot paid only what it held for it. `setAsideStatements`' paid figure is the Pay tick less the Front.
- **Covering the bill** (`billCover`): before Pay, the Amex pot only has to cover the bill less what's waiting (`waitingPence`): "The Amex pot covers its part exactly." ("· £5.80 to spare"), or "£9.20 short of its part: top up the Amex pot before you pay."
- **The statement page:** the Pay step reads **Pay Amex from Monzo Joint** on every bill paid from the Amex pot. While rows wait and before Pay, a box under it reads "£649.23 from the Amex pot + **£212.40 from the buffer** for 6 waiting.", then **Cover the waiting from** (the buffer first, "Monzo Joint (the buffer) · £500.00, checked Thu 10 Dec", then every pot and account by owner, a checked pot with its balance), "North keeps track. Once they're sorted, their pots pay the buffer back." and the cover line. A source other than the pay-from account's main balance adds "Move £212.40 from Holidays to Monzo Joint before you pay." Once paid, it reads what was covered and from where. The summary adds the bill's parts: "In the Amex pot £649.23 · Waiting · 6 £212.40", or once paid "From the Amex pot £649.23 · From the buffer for 6 waiting £212.40". The header's status shows settle progress, not "6 waiting", once the waiting rows don't block.
- **Waiting on this bill** ("6 · £212.40", `statementWaitingGroups`) lists the statement's waiting rows by reason ("Ask Ada · 4", its total, **Go through them**, "Go through" on phones), each opening the go-through over the statement page; its end message shows under the list. A note says what sorting them does: before Pay, "Sort them before you pay, and they go into the Amex pot as usual: the buffer covers less."; once paid, "Once they're sorted, their pots pay the buffer back."; on a statement that settles once, "The October statement settles once, so sort them before you settle up."

**Paying the buffer back** (`waiting/8`, W11). Once a fronted row is sorted, its money goes back to the Front's source instead of into the Amex pot, through the same Move sheet and the same `SetAsideMove`.

- **Which lines pay back** (`paidBackBy`, `payBackLines`): a move's lines for a row on a Front, moved after the Front's Pay tick. Nothing new is stored: unticking Pay removes the Front, and its pay-backs become ordinary Amex pot moves (WP9). Undo on the move undoes the pay-back.
- **The steps** (`moveSteps`): every line is gathered in the Amex pot's account as before (Out of each pot, Send to Monzo Joint). Into the Amex pot is only what isn't paying back (`totalPence`); each source gets its own `payBack` (`payBackPence` in all). A source that is that account's main balance needs no further step (the money stays there). A source pot there gets **Into <pot>**; another account gets **Send to <account>** (then Into its pot). A line already at the source (a row sorted to Joint's one-offs when the buffer is Joint's main balance), or in the Amex pot, moves no money, but recording it still clears what that row owed.
- **Balances:** the Amex pot's `set-aside` flow leaves pay-backs out (`moveTotal`). A source pot gains a `paid-back` flow ("Paid back for the waiting"), and `bufferBalance` adds what's paid back since the buffer was checked (`paidBackInto`). The spending pots' outflow is as for any move. Should hold, the Amex pot check, `setAsideStatements`' moved figure and the bill's settled state don't change.
- **Owed back** (`frontsOwed`): per Front, each row's amount on it less its lines moved since Pay (`owedPence`). `toMove` and `toMovePence` are the sorted rows still to move and the money that moves; `unsorted`, `unsortedPence` and `waiting` are the rows not sorted yet.
- **The Move sheet:** under the steps, "£88.00 stays in Monzo Joint's main balance. It pays the buffer back for the November bill. £124.40 is still owed, for the 4 still waiting." ("goes into Holidays" for a source pot; "It pays Holidays back"). Into the Amex pot's step adds "Only December's". What it covers splits into "Pays the buffer back · November bill" and "Into the Amex pot · December bill". The button counts everything leaving the pots ("Moved £133.10", Nick's call), and the message names both: "Moved £45.10 to the Amex pot and £88.00 back to the buffer."
- **Spending's Set aside band** adds the same line under it, and Mark £X moved counts both. Its figure is the Amex pot's part; with only pay-backs to move, the band reads "Pay the buffer back · £88.00 · 2 transactions sorted since …".
- **Home's To do:** Set aside leaves fronted rows out. **Pay the buffer back** · £88.00 ("For the November bill · 2 transactions sorted · £124.40 still owed for 4 waiting") follows it (same rank, `pay-back`, Nick's call: two rows), opening Spending's To sort. It goes once nothing for the Front is left to move.
