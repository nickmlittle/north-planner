# Card tracker (Spending) rules

**Status:** agreed with Nick on 11 November 2026. Built in the `card/1`–`card/12` PR series from the [build plan](card-tracker-build-plan.md), which holds the full design, the Amex export format (§4) and the screens (§7). This document is the contract for what has shipped; keep it current with each PR. Where they disagree, the build plan's decisions (D1–D16, R1) win until this document is updated with Nick.

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

## Payments

Payments to Amex (`payments`) are never sorted or counted as spending. They're listed apart under All transactions. The statement's "Amex shows a payment of £X" hint and the offer to tick Pay Amex come with settling up (PR 9).

## Baseline fixture

`scripts/baseline-fixture.mjs` gives the baseline household an Amex (closes on the 24th, due 25 days later, paid from Monzo Joint), Ada's card ending 41001 and Ben's 41009, four rules, and 27 transactions from 2 Oct to 8 Nov 2026 on the 24 Oct and 24 Nov statements, including a row dated 24 Oct on the November statement, a refund, a payment and four to sort. Bills carries over. Groceries has its own joint pot so it can be paced.

## Text

- `normaliseDescription`: uppercase, whitespace collapsed, trimmed. Rules match against it.
- `merchantKey`: the raw description before its first run of 2+ spaces, uppercase, without digits or `*`, whitespace collapsed: `"B&M Retail - 10742 B&M  Dartford"` gives `"B&M RETAIL - B&M"`.
- A rule made from the sort sheet defaults its text to the first word of the merchant, or the first two when the first is three letters or fewer (`defaultRuleText`).

## Words on screen

See the [glossary](product-design-spec.md#glossary). **Spent**, **Left**, **Bring in**, **Sort / To sort / Sorted**, **Split**, **Pace**, **Close <Month>**, **Settle up**, **Built up** and **Free** are this feature's words. **Move** keeps its meaning (account → pot). Money leaving a pot is "Out of <pot>", and account to account is "Send to <account>". The UI says "sort", never "assign".
