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

The tracker is an optional `card` field on the budget document, like `ticks`. A document without it is valid and there is no version bump. `decodeBudgetDocument` validates it with `validCardTracker`; an invalid `card` makes the whole document invalid, as for `ticks`. Every destination must be an existing pot or account, every person an adult, and every transaction's card and statement must exist. Split lines must add up to their transaction. An adult who is a cardholder, or a transaction's person, can't be removed.

Money is integer pence everywhere. Spreadsheet amounts are floats and become pence with `Math.round(value * 100)` (`penceFromAmount`); typed amounts are parsed without floats (`parsePence`).

Types (`src/domain/cardTracker.ts`) follow plan §5.1, with these refinements:

- `CardTransaction.merchant` stores `merchantKey` of the raw description at import. The stored description is whitespace-collapsed, so the padding between merchant and town is gone by then, and suggestions and refund matching need the merchant.
- `TransactionSort.checkedAt` records "Check" on a rule's sort.
- `StatementRecord.finalImportAt` records the final export (an import of the period, taken after its close, that matched Amex's summary), and `settleWithoutFinalAt` the override.
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

## Adding by hand

`addManualTransaction` adds a transaction with id `manual:<uuid>`: a date, description, amount (a refund is negative) and card ending. Its statement comes from the date window (`statementFor`), its merchant is the whole typed description (typed text has no Amex padding), and the rules apply as on import.

## To sort

`transactionsToSort` is every purchase and refund with no sort, newest first (by date, then the order they came in). Payments are never listed. "Last brought in" is the latest `ImportRecord`'s time (`lastImport`), so a future feed that records imports updates it the same way.

## Sorting and suggestions (§6.3)

- **Suggestions** (`suggestions`), in order and without repeats: every destination the same merchant went to last time (the most recent sorted transaction with that `merchant`; each line of a split), the cardholder's own pots (pots in accounts owned by that person alone, A–Z), joint pots (accounts with more than one owner, A–Z), the joint account (the card's pay-from account's main balance), then the buffer if it's set to somewhere else. A card ending with no person gets no personal pots. The sheet shows the first six; "All pots and accounts" lists the rest.
- **Sorting by hand** (`sortTransaction`) stores the lines with `by: 'person'`. The lines must add up to the transaction, and payments are never sorted. "Move back to To sort" removes the sort.
- **Always** (`addRule`) adds a rule at the end of the list with the edited text (uppercased) and, optionally, the card ending, and sorts every transaction still to sort that it matches (`by: 'rule'`). The tapped transaction itself is sorted by hand.
- **Changing a rule's sort**: when the sort sheet re-sorts a rule-sorted transaction with "Change the rule too", the rule's destination changes (`updateRule`) and the transaction becomes a sort by hand. Other transactions the rule sorted keep their sort.
- **Sorted by rules** lists rule sorts with no `checkedAt`; "They all look right" sets it (`checkRuleSorts`).
- **Rules** apply top to bottom; `moveRule` swaps neighbours, `updateRule` edits the text, card and destination, and `deleteRule` removes one. Editing or deleting a rule never changes past sorts. Split rules (D13) are shown read-only; their editing UI is later.

## Splits (D4)

- A split is a sort with more than one line. Lines keep the transaction's sign (amounts are typed as positive) and must add up to it exactly; Save waits until "Left to place" is £0.00.
- **Half each** and **the funding share** (`halfEach`, `byFundingShare`) give one line per adult, divided with `splitByPercent` (equal weights, or the month's positive employment income per adult, as Transfers' income ratio uses). Each part goes to the person's own pot (A–Z), else their own account, else the card's pay-from account. The button names the share in whole percent ("60/40"); it shows only with two or more adults and some employment income.
- **Receipt items** (`receiptLines`): each typed item is a line with its `item` name; "Everything else" takes what's left as one more line (left out when nothing's left). Items worth more than the transaction can't be saved.
- `totalsByDestination` adds the lines up per pot or account ("By pot"); `splitLabel` gives "Split · 4 pots", or "Split · 3 ways" when an account is one of them.
- **Split rules** (D13): `SortRule.split` holds percentages that add up to 100, and `ruleLines` turns them into lines with `splitByPercent`. There's no UI to make one yet.

## Refunds (D5, §6.4)

- **Matching** (`findRefundMatch`): purchases on the same card ending with the same merchant, dated on or before the refund and no more than 180 days earlier, for at least the refund's amount. An exact amount wins, then the most recent.
- **Where it goes back** (`refundPlan`): a purchase with one line → that pot or account; a split purchase with a line of exactly the refund's amount → that line; any other split → the user picks a line or "Spread across the split" (`spreadLines`: in proportion to the lines, pennies by largest remainder); an unsorted purchase → the usual suggestions.
- **On import** (`matchRefundOnImport`): a clear match sorts the refund straight back with `by: 'rule'` and no `ruleId` (so it shows under Sorted by rules, tagged Refund, for checking) and sets `refundOf` (with `lineIndex` for an exact split line). An unclear match only sets `refundOf` and leaves the refund to sort.
- **By hand** (`sortRefund`): choosing a line, spreading, or any other pot or account sorts the refund and sets `refundOf`. The refund counts in the month of its own date, and lowers its pot's share of the statement it's on.
- Rows link both ways: "Refund of COSTCO £186.40 · 24 Oct" on the refund, "Refunded −£14.99 · 6 Nov" on the purchase (`refundsOf`).

## Month figures (§6.5)

`monthSpending(document, month, today)` works out each destination's figures for a calendar month. The screens never recompute them.

- **Planned**: the month's resolved items (`resolveBudget`) for that pot, monthly amounts. Accounts have no Planned on this screen: direct items (rent, childcare) aren't card spending.
- **Spent**: the split lines of purchases and refunds *dated in the month* (D2), whatever statement they're on. Refunds are negative. Unsorted transactions and payments don't count.
- **Taken**: the previous month's next-month covers for the pot (R1). **Left** = Planned − Spent − Taken.
- **Pace** (steady pots in the current month only): day = today's day of the month; expected = Planned × day ÷ days in month. **Ahead of pace** when (Spent + Taken) − expected ≥ max(£10, 10% of Planned). **Over** when Left < 0 (in any month). **Runs out** when the daily average would reach Planned before the month's last day; the screens show it only when ahead. The thresholds are constants in `cardSpending.ts`.
- **Needs care** = over or ahead. "Sorted to" is the latest transaction date brought in.
- **Status**: over, ahead, on track, left (no pace, or a past month), one-offs (accounts, and pots with no plan), funded (a Funded only pot) or saving (a Saving pot). Carry-over pots show what was spent this month (Free comes with PR 8).
- **Which rows show**: paced pots with a plan (even at £0 spent), Funded only pots with a plan, and any pot or account with spending or a cover taken. Rows are grouped by kind (see Pot kinds), each ordered Joint first, then each adult (a pot belongs to its account's single owner), then A–Z. **Spending this month counts Tracked pots only** (D4): the month's Planned and Spent totals are the Tracked rows'. Bills, Saving, Funded only pots and an account's one-offs are listed in their own groups, not in that total.
- **Pot settings** (`potSettings`, `savePotSettings`): the pot's kind decides. Pace is steady for a Tracked pot (unless pace was switched off) and none for any other kind; carries-over is true only for Carries over. Build-up limit defaults to 2× the monthly Planned. Edited in Settings › Accounts & pots, where the pot's kind is chosen.
- **Pot detail**: what's left and for how many days, about £X a day (Left ÷ days left) against the average so far (Spent ÷ day), the cumulative chart (`cumulativeByDay`) against the planned pace, and the pot's transactions in the month (`destinationTransactions`), each split showing only its line for this pot.
- **Sort sheet**: `leftByDestination` gives "£X left" for every planned Tracked pot, in the transaction's month. A Funded only pot's option says "Funded only" and a Saving pot's says "Saving": they have no Left. Placing spend on them shows no impact line.

## Pot kinds (month-health plan D3–D5, P2)

`PotTracking.kind` is `tracked`, `funded-only`, `saving` or `carries-over`, kept in `card.pots[potId]` and validated like its neighbours. Rules and defaults live in `src/domain/potKinds.ts`.

| Kind | What North does | Month › Pots shows |
| --- | --- | --- |
| **Tracked** (Groceries, Going out) | Left this month, pace, covers and leftovers at Close, build-up flag | Left, pace, the meter |
| **Funded only** (Ada's and Ben's Spending) | Moves the money in on payday and stops there. No Left, no pace, no leftovers or build-up, not counted in Spending this month | "£1,135.42 moved in", then "£115.30 on the Amex" |
| **Saving** (Holidays, Emergency) | No Left or pace, nothing to cover or carry. (Built up is a later PR) | "£1,586.36 put by" and what was spent from it |
| **Carries over** (Bills) | What's left stays in the pot; Free (below) | Free, and what's due |

- **Default** (`defaultPotKind`, P2), when nobody has chosen: a pot with the older `carriesOver` flag is Carries over; a savings pot or a pot in a savings, ISA or pension account is Saving; a spending pot in one person's account is Funded only; anything else is Tracked. A savings pot kept in a current account (Holidays in Monzo Joint) is set to Saving by hand.
- **Chosen** (`savePotKind`): stored only when someone picks one in Settings › Accounts & pots; until then a pot follows where it is (move it to a joint account and it becomes Tracked). It sets `pace` and `carriesOver` to match, so older readers agree. `savePotSettings` with `carriesOver` moves a chosen kind with it.
- **The Amex pot has no kind** (`potKind` returns nothing for a card's set-aside pot); it has its own group in Month › Pots and no choice in settings.
- **Close** (`closeMonthPlan`) covers overspends, lists leftovers and flags build-ups for Tracked pots only.
- A Funded only pot's rows are named with their account ("Spending · Ada") since Ada's and Ben's pots sit in one group.

## Carry-over pots (D9, §6.6)

```
free = checked balance
     + payday Move ticks into the pot made after the check
     − settle-up "Out of <pot>" ticks made after the check (net of "Into <pot>")
     − card spend on the pot not yet settled
```

- (Since A3 this is `potBalance` in `potBalances.ts`, which also counts covers, built-up moves and moves to the Amex pot; see "The Amex pot".)
- **Not yet settled**, per statement: the pot's share of that statement (its split lines, by `statementKey`) minus what its settle-up tick moved (`settle:out:<potId>`, less `settle:into:<potId>`). A late refund after settling leaves a negative amount waiting (money to come back). Each statement with something waiting is listed by name ("Waiting to settle · October statement").
- **Moves** are payday ticks whose key ends `:move:<potId>`, in any month, made after the check.
- With no checked balance there's no figure: "Check the balance to see what's free". **Check against Monzo** (`checkPotBalance`) records the balance and the time; the bank's name is the pot's account provider.
- **Annual costs** (`annualCosts`) are the month's Plan items to the pot entered yearly, shown as "£612.00 a year".
- Carry-over pots never show pace or "£X left"; This month shows what they spent this month and what's free. ("Carries over" is one of the four pot kinds, see Pot kinds.)

## Month stages (§6.9)

`monthStage(document, month, today)`:

| Stage | When |
| --- | --- |
| upcoming | The month hasn't started and none of its payday steps are ticked. |
| funding | Before the month, some but not all of its payday steps done. |
| funded | Before the month, every payday step done. During the month, "Funded" (or "Funding · 3 of 8") shows as a chip. |
| in-progress | Today is in the month. |
| closing | The month has ended and isn't closed. |
| to-settle | Closed, but a statement holding any of its purchases or refunds isn't settled. |
| settled | Closed, and all those statements are settled. |

Payday progress (`paydayProgress`) counts the month's Transfers steps and ticks for the whole household, exactly as Transfers and Home do.

## Closing a month (D7, D8, D11, R1, §6.10)

- **Can close** (`closeMonthPlan`'s readiness) once the month has ended, every purchase and refund dated in it is sorted, and the latest import is at least 3 days after the month's last day (`LATE_POSTING_DAYS`), or "All <Month> transactions are in" was pressed (`markAllIn`).
- **Overspends**: every Tracked pot with a plan and Left below 0 (Funded only, Saving and carry-over pots have none). Each is covered by its whole overspend from the buffer by default, or from another monthly pot with money left that month (most left first), or from next month's funding for the pot. A chosen source is stored at once (`setCover`) so its step can be ticked before Close; changing the source drops the step's tick.
- **Cover steps** (`cover:<potId>`), ticked like any step (`setCoverTick`): from an account, "Move £35.00 from Joint Monzo into Eating out"; from a pot, "Out of Treats £35.00, then move into Eating out". A next-month cover moves no money; next month's pot shows "£35.00 taken by October" and has that much less left.
- **Leftovers**: Planned − Spent (− anything last month took, − covers taken from the pot), above 0, for each Tracked pot with a plan.
- **Built up** (`builtUp`) = Σ leftovers of closed months − Σ moved out. The close screen shows it including this month. A pot is flagged when built up > its limit × this month's Planned, unless "Keep it" recorded at least that much (`keptBuildUpPence`). "Move £X…" suggests keeping one month's worth and records what was moved (`moveBuiltUp`); the money itself moves in the bank.
- **Close** (`closeMonth`), one button for the household, records `closedAt`, the covers, the leftovers and what each destination had spent (`closedSpent`). A later re-sort or late transaction in the month shows "Changed since closed" with Close again, which records them afresh.

## Home month cards (§7.1)

`homeMonths(document, today)` gives Home one card per month that isn't finished, only once a card is set up:

- **Current month**: its stage and funding, Sorted to, how many pots need care and a row for each (ahead: "runs out around …" when it would; over: "Covered when <Month> closes"), and tasks: bring in once the last import is 3 or more days old (`BRING_IN_AFTER_DAYS`), "Statement closes tomorrow" the day before a close, and "Bring in the final <Month> statement" for each closed statement that isn't complete or settled.
- **Each past month not settled** (closing or to settle): All transactions in and sorted (done when nothing is to sort and the late postings are in, or "All … are in" was pressed), Close <Month> (done once closed), and Settle the <Month> statement for each statement holding its transactions (done once settled).
- **Next month**: when its money arrives, from each adult's salary payday; once any of its payday steps is ticked, "Finish <Month>'s Transfers" (done when all are). If a step was ticked more than 3 days (`EARLY_PAY_DAYS`) before the earliest payday, its money has arrived early: it is still that month's money (D1).
- **The last settled month** shows as one line, with the latest settle-up time of its statements, until the month after it is settled too.

## Paydays and working days (§5.2)

- An employment income source can have a **payday** (`{ day, ifNotWorkingDay: 'previous' | 'next' }`), edited in the income dialog ("Paid on day", "On a weekend or bank holiday"). It is shared by every month; an empty day removes it.
- **Working days** (`workingDays.ts`) exclude weekends and bank holidays in England and Wales, worked out without a network: New Year's Day, Good Friday and Easter Monday (from Easter), the early May, spring and summer bank holidays, Christmas Day and Boxing Day with substitute days, plus known one-off changes (2020, 2022, 2023) and any extras passed in.
- A payday is the rule's day in a month (or the month's last day), moved back or forward to a working day (`paydayIn`). A month's money arrives in the month before (`moneyArrives`): 28 Dec 2026 is the Boxing Day substitute, so January's money comes Thu 24 Dec (previous) and Tue 29 Dec (next). With "next working day" it can land in the month itself (28 Feb 2026 is a Saturday, so March's arrives Mon 2 Mar); it's still that month's money.

## Desktop sorting (board 7)

On desktop, To sort is a table. Each row's "Pot or account" starts at its first suggestion (or the refund's purchase pot); Enter or Place sorts it there, as the sort sheet does: a refund is linked to its purchase, and Always makes a rule from the first word or two of the merchant (it also sorts anything else waiting that it matches). A refund of a split purchase opens the sort sheet to choose the part. Rows take ↑/↓, /, Enter, A and S, and focus moves to the next row after placing. The side panel's figures come from `monthSpending` and `statementSummary`, like every other screen.

## Payments

Payments to Amex (`payments`) are never sorted or counted as spending. They're listed apart under All transactions, and on their statement as "Amex shows a payment of £X on 8 Nov". When one equals an open Pay step, the statement offers "Tick Pay Amex" (`paymentMatchingPay`); it is never ticked automatically.

## Statements (§6.7)

- **Which statement** a transaction is on is its `statementKey`. A statement is named by the month it closes in: the 25 Oct – 24 Nov statement is the "November statement". Statements are listed newest first (`statementKeys`).
- **Total** = Σ purchases and refunds on it; payments are excluded. **Which months it counts in**: the same transactions totalled by the month of their date.
- **Summary check**: North's positive rows against Amex's Charges, and negative rows (refunds and payments) against Payments & Credits, from the latest import of the period.
- **Open** while today ≤ the close date. **Complete** once a final export is in (`finalImportAt`) or "Settle without the final export" is chosen (`settleWithoutFinalAt`). **Ready to settle**: closed, complete and every purchase and refund on it sorted. **Settled**: ready, and every settle-up step done (`settledAt` records when the last tick made it so; unticking or a later change clears it).

## Settle up (§6.8)

`settleSteps(document, statementKey)`:

1. **Shares**: Σ the statement's split lines by destination; each pot share goes to its account, account shares stay on their account.
2. **Accounts in order**: each person's own accounts (household order), then joint accounts, then accounts without an owner, with the pay-from account last. For each: **Out of <pot>** for each pot share above 0 (`settle:out:<potId>`), **Into <pot>** for one below 0 (`settle:into:<potId>`), pots A–Z; then, unless it's the pay-from account, **Send to <pay-from account>** with the account's net share (`settle:send:<accountId>`), or, when the net is below 0, the pay-from account sends the difference back (`settle:return:<accountId>`). Spend sorted to the pay-from account itself needs no step: "Includes £95.00 of one-offs already in Monzo Joint".
3. The last step is **Pay <card> from <pay-from account>** for the statement total (`settle:pay`). The steps add up to the bill by construction.
4. Ticks reuse `StepTick` and `stepStatus`: a step ticked at a different amount (a late refund, a re-sort) shows "Changed since ticked" with the difference to copy, and tapping its circle accepts the new amount. Each account says who makes its steps: the owner, or "Either of you" for a joint account. Tap-to-copy and the one-time hint are shared with Transfers (`copyHint.ts`).

## Baseline fixture

`scripts/baseline-fixture.mjs` gives the baseline household an Amex (closes on the 24th, due 25 days later, paid from Monzo Joint), Ada's card ending 41001 and Ben's 41009, four rules, and 27 transactions from 2 Oct to 8 Nov 2026 on the 24 Oct and 24 Nov statements, including a row dated 24 Oct on the November statement, a refund, a payment and four to sort. Bills carries over. Groceries has its own joint pot so it can be paced.

## Text

- `normaliseDescription`: uppercase, whitespace collapsed, trimmed. Rules match against it.
- `merchantKey`: the raw description before its first run of 2+ spaces, uppercase, without digits or `*`, whitespace collapsed: `"B&M Retail - 10742 B&M  Dartford"` gives `"B&M RETAIL - B&M"`.
- A rule made from the sort sheet defaults its text to the first word of the merchant, or the first two when the first is three letters or fewer (`defaultRuleText`).

## The Amex pot (set aside as you go)

**Status:** agreed with Nick on 11 November 2026, after #137. Nick keeps an "Amex" pot in Monzo and moves money into it from the spending pots during each review, rather than once per statement. Built in the `amex-pot/1`–`4` PR series (A1–A4 in the table above).

- **The setting** (Household → Cards): "Set money aside in" a pot, "Starting with" a statement (`CardAccount.setAside = { potId, fromCloseDate }`). The choices are the two statements before the open one, the open one (the default) and the next. Statements closing on or after `fromCloseDate` are paid from the pot (`usesSetAside`); earlier ones keep settling once via the pay-from account (§6.8). With no pot, nothing changes.
- **A move** (`SetAsideMove`, `card.moves`) records when it happened and, for each transaction, the lines it moved: all its lines the first time, the change since it was last moved after that. What a transaction has moved is the sum over moves (`movedByTransaction`), so undoing any move (`undoMove`) is just removing it.
- **To move** (`toMove`): sorted purchases and refunds on statements paid from the pot whose lines differ from what has moved (`pendingLines`), newest first. Unsorted transactions wait until they're sorted; payments never move. A transaction re-sorted or split after moving is **Changed since moved** (`moveState`) and moves only the difference: "Out of Eating out £20.00, Into Groceries £20.00".
- **The steps** (`moveSteps`) are settle-up's (`shareSteps`) with the pot's account as the hub: for each account, Out of each pot (Into one whose refunds outweigh its spend), then Send to the pot's account (or it sends the difference back); spend sorted to the pot's account itself is already in its main balance. The last step is Into the pot with the total (Out of it when refunds outweigh spend). Lines sorted to the pot itself need no step.
- **Moved** (`recordMove`) records what's still to move for the ticked transactions at that moment. Transactions with nothing to move are skipped.
- **Every pot's balance** (`potBalance`, replacing PR 8's `potFree`) = the balance last checked against the bank + every move North knows about since (`potFlows`): payday Move ticks in, Close month covers in or out (ticked, not next-month ones), built-up money moved out, settle-up Out of / Into ticks, moves to the Amex pot (out of a spending pot; into the Amex pot, less lines sorted to it), and paying the card from the Amex pot (its Pay tick on a statement paid from the pot). With no check there's no balance. **Waiting** (`waitingShares`) is each statement's card spend on the pot less its settle-up ticks and what has moved to the Amex pot ("Still to move · November statement", or "Waiting to settle" on a statement that settles once); **Free** = balance − waiting. The Amex pot waits on nothing.
- **Where balances show:** This month adds "£289.75 in Monzo" to each monthly pot's line (carry-over pots keep "£X free in the pot"), and its summary links to the Amex pot and opens **Check balances**. Pot detail has "In Monzo now" with its sums and "Check against Monzo" for every pot. The sort sheet shows "£X free" for a checked carry-over pot. Home's move task adds what the Amex pot has.
- **Check balances** (`checkPotBalances`): every pot by account, North's figure and when it was checked, and a box for what the bank shows; it says "Matches" or "£5.40 less than North worked out". "Same as North" fills in North's figure. Blank pots keep their last check.
- **The Amex pot's page** (pot detail for the set-aside pot): its balance, and each statement it pays (`setAsideStatements`): the total, what's moved in, what's still to move (sorted or not) and what's been paid.
- **Settling up from the pot** (§6.8 for statements paid from it): `settleSteps` gives no account steps; its `setAside` says what's still to move for the statement. The steps are **Move the rest to the Amex pot** (`settle:move`, done once nothing sorted on the statement is left to move; "Move them" opens the Move sheet for just this statement) and **Pay Amex from the Amex pot** (`settle:pay`, ticked as before, from the pot's account). `settleStepDone` decides each step, so a statement is settled when everything on it is in the pot and Pay is ticked. A move that finishes the last step records `settledAt` (`refreshSettled`). The statement detail shows "£312.85 of £649.23 is in the Amex pot · £140.59 sorted and still to move" with "Move it", and Shares are still shown per account, gathered in the pot's account.
- **On screen:** while anything is left to move, Spending shows "£140.59 to move to the Amex pot · 3 transactions sorted since the last move" on every section, and Home's current month has the task "Move £140.59 to the Amex pot". The **Move sheet** lists the moves to make per account (tap an amount to copy it), then "What it covers": every transaction to move, all ticked, a re-sort tagged "Changed since moved" with its change. Unticking one takes it out of the moves and leaves it for next time. **Moved £X** records it; the message offers **Undo**. All transactions tags each row on a pot statement **Moved** or **Changed since moved**.

## Checking the Amex pot

**Status:** agreed with Nick on 15 November 2026, from the [Amex pot check build plan](amex-pot-check-build-plan.md) (decisions R1–R5, Q1–Q5). Built in the `amex-check/1`–`3` PR series (C1–C3 in the table above); this section grows with each PR.

- **Should hold** (`shouldHold`, `src/domain/setAsideCheck.ts`): what has moved into the card's set-aside pot for the statements paid from it that have no Pay tick yet. It's Σ every moved line of their transactions, refunds negative, lines sorted to the pot itself included (a purchase sorted to the Amex pot is paid from what's in it). It comes from the moves alone, never from a balance check, so extra money can't hide in a checked balance.
- **Holds:** the pot's balance (`potBalance`): the last check plus every flow since.
- **The check** (`setAsideCheck`): gap = Holds − Should hold, exact to the penny (Q2). It **matches** at £0, has **extra** above and is **short** below; it's **unchecked** until the pot is checked against the bank. Moves and payments shift both figures together, so a gap only opens with something North doesn't know about: a transfer not made or rounded up, money moved before the purchase reached North, a fee. The check also carries what's still to move (the Move sheet's total), the closed statements with money in and no Pay tick (`unpaidClosed`: a bill paid but not ticked reads short) and the card's last five moves, newest first (`recentMoves`).
- **Evening it up** (`GapMove` in `card.gapMoves`, `recordGapMove`, `undoGapMove`): extra moved out of the pot (positive) or a top-up into it (negative), to or from the card's buffer (`gapDestination`: Buffer for overspends, else the pay-from account's main balance, never the Amex pot itself; Q1). The destination is stored as it was when recorded. It's the `gap` flow: out of the Amex pot, and into the buffer when that's a pot. The sums say "Extra moved out" or "Topped up" on the Amex pot, and "Extra from the Amex pot" on the buffer pot.
- **The steps** (`gapSteps`): extra is Out of the Amex pot, then Send to the buffer's account when it's another account, then Into the buffer pot when it's a pot. A top-up runs the other way and ends Into the Amex pot.
- **Covering a bill** (`billCover`): for an unpaid statement paid from a checked pot, Holds less what has moved in for the card's other unpaid statements, against the statement's purchases and refunds. The difference is to spare or short.
- **Order:** press Moved before checking the pot against the bank. A check made after a transfer but before Moved counts the transfer twice, and it reads as extra.
- **The Amex pot's page** (`amex-check/2`, `SetAsideCheckLead`): the check leads the page, above Statements it pays.
    - **Unchecked:** "Should hold £312.85", what that means, and **Check against Monzo**.
    - **Checked:** "Checked against Monzo · Sat 14 Nov", then "Matches", "£5.80 extra" or "£9.20 short" (toned), over the sums Should hold and In Monzo now.
    - **Extra:** "Move it to Monzo Joint." (the buffer's name), the banking steps (`gapSteps`, tap to copy), **Moved £5.80**, and a hint for money moved early: leave it, it matches once the purchase arrives and is marked moved. Moved records a `GapMove`; the message "Moved £5.80 to Monzo Joint. The Amex pot matches." offers Undo.
    - **Short:** "Did a transfer not happen? Make it now, then check the Amex pot again.", a line for each closed statement with no Pay tick (**Open the November statement**), **Recent moves** ("Fri 6 Nov · £312.85", "7 transactions · Groceries £230.25, Spending £55.10, Bills £15.00 and 1 more", each with Undo, which is `undoMove`), then "Or top up the Amex pot from Monzo Joint." with its steps and **Topped up £9.20**.
    - "How In Monzo now is worked out" folds the pot's sums once anything has moved since the check. Each statement it pays opens on Spending.
- **Month's Amex row** (`amex-check/2`): when the check has a gap, "£5.80 extra" or "£9.20 short" (toned) takes the place of what's still to move.
- **Check balances** (`amex-check/3`): the Amex pot's row reads "Should hold £312.85 · checked Sat 31 Oct". A typed figure says Matches, "£5.80 extra" or "£9.20 short" against what it should hold. While anything sorted is still to move, the row adds "£140.59 sorted and still to move. Moved it in Monzo already? Press Moved first, or it counts twice." Same as North shows only when the pot already holds what it should. Saving says "1 balance checked. The Amex pot has £5.80 extra." (or "is £9.20 short."), with **Open Amex pot** on Month and Spending.
- **Settle up** (`amex-check/3`, `billCover`): on a statement paid from the pot, once nothing is left to move and until Pay is ticked, the Pay step says "The Amex pot covers the £169.20 bill · £5.80 to spare.", "£9.20 short of the bill: top up the Amex pot before you pay." or, before any check, "Check the Amex pot against Monzo to see if it covers the bill."
- **Home** (`amex-check/3`): with a gap, To do has "Move extra out of the Amex pot" (£5.80, "To Monzo Joint · checked Sat 14 Nov") or "The Amex pot is short" (£9.20, "Less than it should hold · checked Sat 14 Nov"), toned, opening the Amex pot's page. It's the `gap:<cardId>` task in `homeMonths`.

## Links between Spending and Month

**Status:** agreed with Nick on 14–15 November 2026, from the [Spending ↔ Month link build plan](spending-month-link-build-plan.md) (decisions L1–L7). Built in the `link/1`–`link/5` PR series; this section grows with each PR.

- **Spending → Month** (`link/1`): on desktop Transactions, a transaction placed in one pot shows its Pot or account cell as a link, "Open Groceries in Month" to a screen reader. It opens that pot's page for the transaction's month (`monthOf(date)`), without opening the sort sheet. An account, a split or a To sort cell stays plain text. The sort sheet of a transaction placed in a pot has **Open Groceries in Month**: it's the phone's way across, because a phone row is a single button, and the keyboard's way on desktop.
- **Month → Spending** (`link/1`): each transaction on a pot page opens Spending › Transactions with that row in view, focused and marked (`?transaction=<id>`, `is-arrived`). **See in Spending** (the Transactions section's aside, and the pot page's ⋯) opens Transactions filtered to the pot. An account's one-offs row on Month ("See Monzo Joint one-offs in Spending") opens Transactions filtered to that account. The filter rides in history state (`northTransactionFilter`, `transactionFilterState`), so Back and Forward keep it and a shared link doesn't. It shows as a removable chip.
- **Back:** every link pushes a history entry, so Back returns to the pot page or the row you came from.
- **Freshness** (`link/1`, `freshness` in `spendingFormat.ts`): wherever pace shows, say how far the card is sorted. "Amex sorted to Fri 13 Nov · 3 to sort ›" (the newest purchase or refund brought in, payments left out, and the To sort count, linking to To sort), "… · all sorted" with nothing waiting, and "Amex not brought in yet" before any bring-in. With more than one card it says "Cards". It shows beside Pots on desktop Month (before "Checked against Monzo"), under the month in the pine header on phones, and under the pace chart on a pot page. A month that hasn't started has none.
- **Where it went** (`link/2`, `src/domain/merchants.ts`): a pot page shows its card spend by brand (`brandOf`), biggest first: up to five bars, then **Other** for the rest (six brands show all six). Only each transaction's lines on the pot count, so splits and refunds add up to the pot's card spend (`merchantBreakdown`). A brand is a known chain's name by prefix (Tesco, Sainsbury's, Lidl, Aldi, Asda, M&S, Waitrose, Morrisons, Co-op, B&M, IKEA, Amazon, Uber, Uber Eats, Deliveroo, Just Eat). Otherwise it's the merchant up to " - " or the first word that describes the shop (STORE, STORES, EXPRESS, RETAIL, LTD, ONLINE…), title-cased: "TESCO STORE 3180 SIDCUP" and "TESCO STORES" → "Tesco", "GREEN GROCER" → "Green Grocer". Each bar reads "Tesco · 4 transactions £303.38"; tapping one shows only its transactions below ("Transactions · Tesco only"), and tapping it again or **Show all** shows them all. A pot with no card spend has no Where it went.
- **By today** (`link/2`): this month's pace chart marks the plan's figure for today on the planned-pace line, labelled "£210 by today", so the gap to the Spent dot reads as ahead or behind. The label sits on the side away from the Spent line.
- **Needs a look** (`link/3`, `needsALook` and `lookReason` in `cardSpending.ts`): the month's pots that are over or ahead of pace, over first, then the bigger gap. Each has a reason: "Mostly Tesco £303.38" when one brand (`merchantBreakdown`) is at least half of Spent (`MOSTLY_SHARE`, decision L4), else "Biggest: AIRBNB £380.00", its biggest transaction on the pot; none with no card spend on it. Desktop Month shows a strip of cards above the Pots table, with name and owner, the headline, a meter, the reason and the run-out or cover line; the table still lists every pot. Phone Month shows a "Needs a look" section above the groups, and those pots leave their groups (decision L5). A pot's Due stays on its card ("£30.00 of it due"). Home's pace heads-up keeps its title and gains the reason as its second line: "Mostly Tesco £303.38 · runs out ~Sat 21 Nov".
- **November so far** (`link/3`): Spending shows this month's Needs a look pots as chips under its tabs, "Groceries £102 ahead", opening the pot's page. Pots that share a name share a chip, "Treats · 2 over" (or "· 2 ahead", "· 2 to look at"), which opens Month.
- **Pace words** (`link/3`, `src/formatting/paceLabels.ts`): "£102 ahead" (whole pounds), "£203.82 over", "runs out ~Sat 21 Nov", "covered when November closes" and the reason line come from one place, used by Month's Pace column, Needs a look, Home's heads-up and the so-far chips.
- **Pace in the picker** (`link/4`, `pickerPace` in `src/pages/sortPace.ts`): each pot in the sort sheet and the desktop To sort select carries its Left and pace for the transaction's month, as Month works them out (assumed bills included): "£130.00 left · £110 ahead" (toned), "£150.00 over", "£130.00 left", "nothing planned" for a pot with no plan that month (decision L3), and "£80.00 free" for a carry-over pot once its balance is checked. On desktop it follows the pot's name in each option's text, "Groceries · Monzo Joint · £130.00 left" (decision L6). Accounts have none.
- **Impact line** (`link/4`, `paceIfPlaced` in `cardSpending.ts`): what placing the transaction would change, before it's placed, naming the pot alone: "Groceries: On track → £110 ahead · runs out ~Fri 20 Nov", "Fuel: £61.80 left → £38.20 over · covered when November closes". When the pace doesn't move it shows Left instead ("£86.00 left → £85.00 left"); a pot with no plan says "Spending has nothing planned in November"; a carry-over pot shows Free; an account, or the pot it's already in, has none. It's toned once ahead or over. In the sort sheet (both sizes) you choose a pot, which starts as where the transaction is now or else the suggestion, and the line sits above **Place in Groceries · Monzo Joint** in the sheet's footer (board M2); a pot it's already in says "Already in …" with Place off, until Always or Change the rule is ticked. A split refund's parts still place with one tap. In the desktop To sort table it's under the focused row, for the pot chosen in its select, and describes that select.
- **Tipped toast** (`link/4`): only when a placing tips a pot into ahead or over (it wasn't already): "Groceries is now £110 ahead of pace" or "Groceries is now £150.00 over", with **Open Groceries** (the pot on Month, for the transaction's month) and **Undo** (`restoreSort`: back to its previous sort, or To sort, saying "TESCO STORES is back in To sort."). It stays 8 seconds. A refund lowers Spent, so it never tips a pot. On phones Spending's message line sits under the tabs, so the tabs keep the pine band.
- **Sorts itself here** (`link/5`, `rulesFor` and `ruleSuggestions` in `cardSorting.ts`): at the foot of a pot page, the single-pot rules that send transactions to it, A to Z ("TESCO · Your rule", "LIDL · Your rule · only on Ada's card"), each opening Settings › Sorting rules, as does the section's **Sorting rules**. Split rules aren't listed. Then a **Make rule** for each merchant sorted here by hand at least twice (`SUGGEST_AFTER`, decision L7) that no rule matches yet: "TESCO STORES · Sorted here 2 times · a rule for "TESCO"". Merchants group by the rule they'd make (`defaultRuleText`), so TESCO STORES and TESCO STORE 3180 count together. Only whole hand-sorted purchases count (not rule sorts, splits or refunds), and a merchant hand-sorted elsewhere as often as here isn't suggested. Make rule uses `addRule`, which also sorts what's waiting in To sort: "Rule added. It also sorted 1 more." With no rules and nothing to suggest, there's no section.

## Words on screen

See the [glossary](product-design-spec.md#glossary). **Spent**, **Left**, **Bring in**, **Sort / To sort / Sorted**, **Split**, **Pace**, **Close <Month>**, **Settle up**, **Built up** and **Free** are this feature's words. **Move** keeps its meaning (account → pot). Money leaving a pot is "Out of <pot>", and account to account is "Send to <account>". The UI says "sort", never "assign".
