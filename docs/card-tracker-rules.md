# Card tracker (Spending) rules

**Status:** agreed with Nick on 11 November 2026. Built in the `card/1`–`card/12` PR series from the [build plan](card-tracker-build-plan.md), which holds the full design, the Amex export format (§4) and the screens (§7). This document is the contract for what has shipped; keep it current with each PR. Where they disagree, the build plan's decisions (D1–D16, R1) win until this document is updated with Nick.

Related: [transfer calculation rules](transfer-calculation-rules.md) (ticks, Move, Funding), [recurring monthly budget rules](recurring-monthly-budget-rules.md) (calendar months, snapshots), [product design spec](product-design-spec.md) (layout, language, glossary).

## What has shipped

| Part | PR | Code |
| --- | --- | --- |
| Data model, validation, statement and date helpers, Household → Cards | 1 | `src/domain/cardTracker.ts`, `src/pages/CardSettings.tsx` |

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

## Text

- `normaliseDescription`: uppercase, whitespace collapsed, trimmed. Rules match against it.
- `merchantKey`: the raw description before its first run of 2+ spaces, uppercase, without digits or `*`, whitespace collapsed: `"B&M Retail - 10742 B&M  Dartford"` gives `"B&M RETAIL - B&M"`.
- A rule made from the sort sheet defaults its text to the first word of the merchant, or the first two when the first is three letters or fewer (`defaultRuleText`).

## Words on screen

See the [glossary](product-design-spec.md#glossary). **Spent**, **Left**, **Bring in**, **Sort / To sort / Sorted**, **Split**, **Pace**, **Close <Month>**, **Settle up**, **Built up** and **Free** are this feature's words. **Move** keeps its meaning (account → pot). Money leaving a pot is "Out of <pot>", and account to account is "Send to <account>". The UI says "sort", never "assign".
