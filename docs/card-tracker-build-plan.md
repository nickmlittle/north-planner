# Card tracker (Spending): design and PR build plan

Status: built, 11 November 2026, in #126–#137 (`card/1`–`card/12`). [card-tracker-rules](card-tracker-rules.md) is the contract for what shipped; §8a lists where the build differs from this plan. Written 11 November 2026 with Nick. This document is the single reference for building the card tracker. Read it in full before starting any PR in it. Where it disagrees with the design canvas, this document wins. In particular, the canvas uses illustrative statement dates (3rd–2nd). The real Amex statements run from the 25th to the 24th (§4).

- **Design canvas** (wireframes; private to the owner): https://claude.ai/artifact/9x86swd2UHgJcRKBNZKYA6, section "Card tracker (Amex)", boards 1–7. The older "Card tracker sketch" board at the top is superseded.
- **Related rules:** [transfer-calculation-rules](transfer-calculation-rules.md) (ticks, Move, Funding), [recurring-monthly-budget-rules](recurring-monthly-budget-rules.md) (calendar months, snapshots), [product-design-spec](product-design-spec.md) (layout, language, glossary).

---

## 1. What we're building

About 90% of the household's spending goes on one Amex account (two cards: Nick's and Immy's). The Plan says where money *should* go. The card tracker records where it *did* go, and settles the bill:

1. **Bring in**: upload the Amex Excel export every few days.
2. **Sort**: every transaction goes to a pot or an account. Rules do most of it. A transaction can be split across pots and people, including by receipt items.
3. **Track**: planned vs spent for each pot this month, with pace. Carry-over pots (e.g. Bills) show a balance instead.
4. **Close the month**: cover overspends, record leftovers, flag a surplus that has built up.
5. **Settle the statement**: each pot's share moves to Joint Monzo, then Nick pays Amex by hand. Ticked like Transfers.

Home shows every month that isn't finished as a card with its stage and to-dos.

The aim is a two-minute review every few days. Design every manual step so that a future bank feed can replace it without changing the screens (see §9).

## 2. Agreed decisions (the product contract)

Agreed with Nick, 11 Nov 2026. Don't change these without asking.

| # | Decision |
|---|---|
| D1 | **Budget month = calendar month** (1st to last day). Pay that arrives at the end of a month (Immy on the 28th, or the last working day before it; Nick on the 28th, or the next working day after it) is **next month's money**. Christmas early pay is January's money, so no month ever stretches. |
| D2 | **A transaction counts in the month of its date**, whatever statement it's on. Statements and months are two views of the same transactions. |
| D3 | **Everything is sorted.** Every purchase or refund goes to a pot or an account (a one-off can go to "Joint account"). Card payments to Amex are not sorted (§4.3). |
| D4 | **Splits.** One transaction can be split into lines by amount, half each, the 60/40 funding share, or receipt items (typed in, with no photo capture). Each line goes to a pot or account. Lines must add up to the transaction. |
| D5 | **Refunds go back to the pot of the original purchase**, in the month the refund arrives, and lower that pot's share of the next statement. If the purchase was split, suggest the line with the exact amount, else let the user choose one or spread it in proportion. |
| D6 | **The bill is paid by hand**, once per statement: each pot's share moves to **Joint Monzo**, then Nick pays Amex from Joint Monzo. It is always paid from Joint Monzo (confirmed). Pots are managed during the month, and settlement happens once. |
| D7 | **Overspend** (a pot spent more than planned in a month) is covered when the month closes, from the **buffer** by default, or another pot with money left that month, or **next month's** funding for that pot. The buffer is **Joint Monzo's main balance** (a card setting that can be an account or a pot). |
| D8 | **Leftovers stay in the pot.** North tracks the build-up and flags a pot holding more than **2× its monthly funding** (a per-pot setting) so it can be moved elsewhere. |
| D9 | **Some pots carry over** (e.g. Bills, saving for annual costs). They show a balance and what's free, not a pace. |
| D10 | **Pace only for steady pots** (Groceries, Eating out, Treats). Irregular pots (Fuel, Car) show only what's left. This is a per-pot setting. |
| D11 | **Closing a month is one household button.** |
| D12 | **The tab is called Spending.** Navigation: Home · Plan · Spending · Transfers · Household. |
| D13 | **Split rules** (e.g. "Ocado: half each") are allowed but low priority. Build the data model for them, and the UI last. |
| D14 | **Design for automation** (daily export pull, bank balances, rules), with manual steps only where needed. |
| D15 | Ticks are **household-wide** for now (as for Transfers), and become per person once shared login exists. |
| D16 | **Amex statements run from the 25th of the previous month to the 24th.** North **requires the Excel (.xlsx) export**, because it states the statement period and has a summary that North can check the rows against (§4). The CSV export isn't supported. |

### Refinement made while planning (R1)

The first canvas draft showed an overspend cover as an "Out of Buffer" step inside the statement settle-up. **Cover steps are ticked on the Close month screen** instead. With the buffer as Joint Monzo's main balance, a cover reads "Move £35.00 from Joint Monzo into Eating out", which uses the existing meaning of **Move**. Board 5 has been updated to match. The reason: the real Amex statement closes on the 24th (§4), so months and statements overlap a lot. Tying a month's cover to one statement would be fragile. Settle-up steps are then purely the statement's shares. The "next month" cover option moves no money: next month shows "£35.00 taken by October" against that pot.

## 3. Words on screen

The glossary in `product-design-spec.md` stays authoritative, and `src/copy.vocabulary.test.ts` fails CI on retired words (*remaining, shortfall, allocat\*, contribut\*, budget balance, …*). Don't use them. Words for this feature:

| Word | Use |
|---|---|
| **Spending** | The tab. |
| **Spent** | Card spend sorted to a pot or account in a month: "£338.60 of £520.00 spent". |
| **Left** | Planned minus Spent for a pot: "£181.40 left". Negative is "£12.50 over". |
| **Bring in** | Import the Excel export: "Bring in transactions", "Last brought in Mon 9 Nov". |
| **Sort / To sort / Sorted** | Give a transaction a pot or account. "Sorted by rules". Avoid "assign" in the UI. |
| **Split** | A transaction with more than one line. |
| **Pace** | "On track", "£131 ahead of pace", "Runs out around Thu 19 Nov". |
| **Close <Month>** | The month-end step. |
| **Settle up** | Paying a statement. Steps: "Out of Treats", "Send to Joint Monzo", "Pay Amex". |
| **Built up** | The leftover total in a monthly pot. |
| **Free** | A carry-over pot's balance minus card spend not yet settled. |

**Move** keeps its glossary meaning (account → pot). Money leaving a pot is "Out of <pot>", and account to account is "Send to <account>". Add these rows to the glossary in PR 1.

## 4. The Amex export (Excel, required)

**Privacy:** Nick's real exports (`activity.csv`, `activity-9.xlsx`) live only on his machine. **Never copy them, or any of their rows, merchants, names, card numbers, references or balances, into the repo, tests, fixtures, PR text or logs.** Use the synthetic fixture created in PR 2.

### 4.1 Why the Excel export (D16)

- **It tells you which statement a row is on.** Amex puts a transaction on a statement by its *posting* date, but the export's Date column is the *transaction* date. The export for 25 Oct – 24 Nov contained rows dated 24 Oct. Only the export's own period reliably says which statement a row belongs to. The CSV has no period.
- **It lets North check the import is complete.** The Transaction Summary sheet gives Previous Balance, Payments & Credits, Charges and Total Balance. In the sample, the rows' positive amounts summed exactly to Charges, and the negative ones to Payments & Credits. North can say "All 38 transactions match Amex's summary", or "£12.34 of charges are missing".

### 4.2 Workbook layout (from a real export, 11 Nov 2026)

- **Two sheets:** `Transaction Details` and `Transaction Summary`. Both start with the same 6-row header:
  - **A1:** the sheet title.
  - **B1:** `<card product> Credit Card / Oct 25, 2026 to Nov 24, 2026`, which is **the statement period**. Parse it with `/(\w{3}) (\d{1,2}), (\d{4}) to (\w{3}) (\d{1,2}), (\d{4})\s*$/` (English month abbreviations).
  - **A2–A5:** `Prepared for`, the account holder's name, `Account Number`, and a masked number such as `XXXX-XXXXXX-9xxxx`.
  - **Row 6:** blank.
- **Transaction Details:**
  - Row 7 is the header, with 13 columns in this order: `Date, Description, Card Member, Account #, Amount, Extended Details, Appears On Your Statement As, Address, Town/City, Postcode, Country, Reference, Category`.
  - Rows 8 onwards hold one transaction each, newest first.
- **Transaction Summary:**
  - A7 is `SUMMARY` and B8 is `Total`.
  - Below them come label/number rows: `Previous Balance`, `Payments & Credits` (negative), `Charges`, and `Total Balance`.
  - Previous Balance + Payments & Credits + Charges = Total Balance.
- **Cell types:**
  - Text is stored as shared strings (`t="s"`).
  - **Date** is text in `DD/MM/YYYY`. Also accept an Excel date serial number in case Amex changes it.
  - **Amount** is a **numeric cell** written as a float (`18.0`, `61.12`), so convert it with `Math.round(value * 100)`.
  - Extended Details and Address can contain newlines.
  - **Reference** is plain text such as `AT26…` (23 characters, no quotes; the CSV wrapped the same value in quotes).
- **Scope:** the current statement period only, with posted transactions only (no pending). Because the export is usually taken mid-period, the period's end can be in the future.

### 4.3 Facts about the rows

- A **charge is positive and a credit negative**.
- **Card Member** holds the cardholder's name as printed. **Account #** is a 5-digit suffix with a leading minus, one per card (Nick's and Immy's differ). **Map cards to people by the Account # suffix, never by the name.** Don't store names.
- **Reference** is unique for every row and is the **deduplication key**.
- **Category** is Amex's own, e.g. `General Purchases-Groceries`, `General Purchases-Fuel`, `Travel-Lodging`. It's blank on payments. Use it only as a hint for suggestions.
- **Payments to Amex** look like `PAYMENT RECEIVED - THANK YOU`: a negative amount with a blank Category.
- **Refunds** are negative amounts on a merchant row, with a Category.
- **Description** pads the merchant and town with runs of spaces, e.g. `MERCHANT NAME         TOWN`. `Appears On Your Statement As` was identical to Description.

### 4.4 What to store for each transaction

Store only: the reference, date, description (whitespace collapsed), amount in pence, card suffix, Amex category, the statement it came from, and the import time. **Drop** Card Member, Address, Town/City, Postcode, Country and Extended Details, for privacy and document size. Don't store the header block's name or account number.

### 4.5 Kinds of row

- `payment`: amount < 0 and the description matches `/^PAYMENT RECEIVED/i`, or the Category is blank and the description contains `PAYMENT`. These aren't sorted or counted as spending. They're shown on the statement as "Amex shows a payment of £X on 8 Nov". When the amount equals an open "Pay Amex" step, offer to tick it, but never tick automatically.
- `refund`: any other amount < 0. Sorted (D5).
- `purchase`: amount > 0. This includes fees and interest, which are sorted like anything else (usually to Joint account).

## 5. Data model

All of it goes in the budget document as an **optional `card` field**, like `ticks`. Older documents stay valid, so there's no version bump. Validate it in `decodeBudgetDocument`: an invalid `card` makes the document invalid, as for `ticks`. Put the types and pure helpers in `src/domain/cardTracker.ts`, and keep the React code out of `domain/`.

### 5.1 Types (to start from; refine in PR 1)

```ts
import type { BudgetDestination } from './monthlyBudget'
import type { StepTick } from './transferTicks'

export interface CardTracker {
  cards: CardAccount[]                           // one Amex today; the model allows more
  transactions: CardTransaction[]
  rules: SortRule[]
  statements: Record<string, StatementRecord>    // key: `${cardId}:${closeDate}` (closeDate YYYY-MM-DD)
  months: Record<string, MonthRecord>            // key: YYYY-MM
  pots: Record<string, PotTracking>              // key: potId
  imports: ImportRecord[]                        // newest last; keep the last 50
}

export interface CardAccount {
  id: string
  name: string                                   // "Amex"
  closeDay: number                               // 1–28: the statement closes on this day; 24 for this Amex (25th–24th)
  dueDaysAfterClose: number                      // the payment is due this many days after closing; 25 for this Amex. Required when creating a card
  payFromAccountId: string                       // Joint Monzo: where pot shares collect and the bill is paid from
  bufferDestination?: BudgetDestination          // the default source for overspend covers; default: the pay-from account's main balance
  cardholders: Array<{ suffix: string; personId: string }>   // Account # suffix → adult
}

export interface CardTransaction {
  id: string                                     // the Amex Reference without quotes; manual entries `manual:<uuid>`
  cardId: string
  date: string                                   // YYYY-MM-DD
  description: string                            // whitespace collapsed
  amountPence: number                            // + purchase, − refund or payment
  kind: 'purchase' | 'refund' | 'payment'
  cardSuffix: string
  statementKey: string                           // `${cardId}:${closeDate}` from the export's period (§4.1); manual entries by date window
  personId?: string                              // from cardholders; absent if the suffix is unknown
  amexCategory?: string
  importedAt: string                             // ISO
  sort?: TransactionSort                         // absent = to sort (never set on payments)
  refundOf?: { transactionId: string; lineIndex?: number }
}

export interface TransactionSort {
  lines: SplitLine[]                             // one line for a simple sort; Σ amountPence === transaction amountPence
  by: 'rule' | 'person'
  ruleId?: string
  at: string
}

export interface SplitLine {
  amountPence: number                            // same sign as the transaction
  destination: BudgetDestination                 // a pot or an account, reusing Plan's type
  item?: string                                  // a receipt item name
  note?: string
}

export interface SortRule {
  id: string
  contains: string                               // uppercase, matched against the normalised description
  cardSuffix?: string                            // only on this card
  destination?: BudgetDestination                // a simple rule
  split?: Array<{ destination: BudgetDestination; percent: number }>   // D13; UI comes last
  createdAt: string
}

export interface StatementRecord {
  cardId: string
  closeDate: string
  amexSummary?: { previousPence: number; paymentsAndCreditsPence: number; chargesPence: number; totalPence: number; at: string }  // from the latest import of this period
  ticks?: Record<string, StepTick>               // settle-up steps (§6.8)
  settledAt?: string                             // set when every step is done
}

export interface MonthRecord {
  closedAt?: string
  covers?: Array<{ potId: string; amountPence: number; source: BudgetDestination | { kind: 'next-month' } }>
  coverTicks?: Record<string, StepTick>          // `cover:<potId>`
  leftovers?: Record<string, number>             // potId → pence left at close (monthly pots)
}

export interface PotTracking {
  pace?: 'steady' | 'none'                       // default: 'steady' for spending pots, 'none' for carry-over or savings pots
  carriesOver?: boolean
  buildUpLimit?: number                          // a multiple of monthly Planned; default 2
  checkedBalance?: { pence: number; at: string } // carry-over pots, checked by hand against the bank
  movedOut?: Array<{ pence: number; at: string }>  // built-up money moved elsewhere (D8)
}

export interface ImportRecord { at: string; cardId: string; fileName: string; statementKey: string; rows: number; added: number; skipped: number; sortedByRules: number; latestDate: string; matchesSummary: boolean }
```

### 5.1a Refinements made in PR 1

- `CardTransaction.merchant: string`: `merchantKey` of the *raw* description, stored at import. The stored description is whitespace-collapsed (§4.4), so the run of spaces that `merchantKey` splits on is gone once stored. Suggestions (§6.3) and refund matching (§6.4) read this field.
- `TransactionSort.checkedAt?: string` (PR 4's "Check"), `StatementRecord.finalImportAt?` and `settleWithoutFinalAt?` (§6.7 complete and its override), `MonthRecord.allInAt?` (§6.10's override) and `closedSpent?` ("Changed since closed"), and `PotTracking.keptBuildUpPence?` ("Keep it").
- The validator ignores unknown fields, so a later PR can add one without failing older checks.

### 5.2 Settings

The card's settings go in Household (a "Cards" section). **Creating a card asks for the closing day and the days until payment is due, and both are required** (this Amex: 24 and 25, so the 24 Nov statement is due 19 Dec). The other settings: the name, the account it's paid from (default: the joint account), the buffer (default: the pay-from account's main balance), and which person each card suffix belongs to. The first import that meets an unknown suffix asks "Whose card ends 9xxxx?". If an export's period doesn't end on the closing day, warn and offer to update the setting.

Each pot gets pace, carries over, and the build-up limit, edited wherever pots are managed (`BudgetManagement`).

PR 11 adds an optional **payday** to each employment income source: `payday?: { day: number; ifNotWorkingDay: 'previous' | 'next' }`. Immy is `{ day: 28, ifNotWorkingDay: 'previous' }` and Nick is `{ day: 28, ifNotWorkingDay: 'next' }`. Home uses it for "December's money arrives Fri 27 Nov · Mon 30 Nov".

- **Working days** exclude weekends and **bank holidays in England and Wales**. Compute them in a pure helper, with no network: New Year's Day, Good Friday and Easter Monday (from Easter), the early May, spring and summer bank holidays, Christmas Day and Boxing Day, with substitute days. Allow one-off additions such as coronation-style holidays.
- **Example:** 28 Dec 2026 is the Boxing Day substitute holiday, so Immy is paid Thu 24 Dec and Nick on Tue 29 Dec.
- **Edge case:** with "next working day", February's pay can land in March, e.g. 28 Feb 2026 is a Saturday, so Nick's pay arrives Mon 2 Mar. It is still March's money. The month just shows as funding until it arrives.

### 5.3 Size

About 100 transactions a month at roughly 250 bytes is around 300 KB a year in the document, which is fine for localStorage and the Supabase row. Don't store the dropped columns. If size becomes a problem later, archive settled months; it isn't needed now.

## 6. Domain rules and algorithms

Implement these as pure functions with unit tests. The UI never recomputes them.

### 6.1 Normalising and matching

- `normaliseDescription(s)`: uppercase it, collapse whitespace, and trim.
- `merchantKey(s)`: take the part before the first run of 2+ spaces in the *raw* description, uppercase it, drop digits and `*`, collapse whitespace and trim. For example, `"B&M Retail - 10742 B&M  Dartford"` gives `"B&M RETAIL - B&M"`. A rule created from the sort sheet defaults `contains` to the first word or two of the merchant key, and the user can edit it.
- Rule matching: the first rule (in list order) whose `contains` appears in the normalised description, and whose `cardSuffix` matches if it has one.

### 6.2 Import (`importAmexWorkbook(document, cardId, bytes, fileName, now)`)

1. Read the workbook (§8, PR 2) and check that both sheets exist and the row 7 header matches §4.2. If not, fail with "This doesn't look like an Amex Excel export. Download the Excel version of your transactions." Don't make a partial import.
2. Read the period from B1 and set `statementKey` = `cardId:<period end>`. Read the four Summary figures.
3. Map each row: the date, pence (integer maths, never floats), the kind, the suffix → person, the Reference, and the `statementKey`.
4. **Check the file against the summary.** Over *every* row in the file (new or already imported), Σ positives must equal Charges, and Σ negatives must equal Payments & Credits. Record `matchesSummary`, and store the summary on the statement. A mismatch is a warning, not a failure: "£12.34 of charges in Amex's summary aren't in this file".
5. Skip rows whose Reference already exists (deduplication). If a Reference is missing, use the key `date|amount|normalised description|suffix`.
6. Apply the rules to new purchases and refunds (`by: 'rule'`). Refunds first try a refund match (§6.4).
7. Add an `ImportRecord`. Return the counts, used for: "38 transactions · 29 already here · 9 new · 6 sorted by your rules · 3 to sort · matches Amex's summary".
8. Unknown suffixes: still import the rows, with no `personId`, and ask the user to map the suffix.

**Manual entry:** the user can add a transaction by hand (date, description, amount, card), with id `manual:<uuid>`. Its statement comes from the date window (§6.7). This covers anything missed after a statement closes, because the export only covers the current period.

### 6.3 Suggestions when no rule matches

Offer these in order, without duplicates:

1. The destination(s) last used for the same merchant key.
2. The cardholder's own pots (the pot's account owners include that person and nobody else).
3. Joint pots.
4. "Joint account" (Joint Monzo's main balance, which is also the buffer).
5. The buffer, if it's set to something other than the joint account.

Each option shows the pot's current month "£X left" once PR 7 exists, and is labelled "Suggested: Nick's card, used last time", and so on.

### 6.4 Refund matching

Look for purchases on the same card with the same merchant key, dated within 180 days before the refund, where the amount ≥ the refund. Prefer an exact amount, then the most recent. A match suggests the purchase's destination (for a split purchase, the line with the exact amount, else a choice) and sets `refundOf`. A refund counts in the month it arrives (D5).

### 6.5 Month figures (`monthSpending(document, month, today)`)

- **Planned** for a destination: the sum of the month's resolved items (`resolveBudget(...).items`) with that destination, using `amountPence`, which is already monthly.
- **Spent**: the sum of `SplitLine.amountPence` for transactions dated in the month whose line has that destination. Refunds are negative.
- **Left**: Planned − Spent − any next-month covers taken from this month by the previous month (R1).
- **Pace** (steady pots only, in the current month): `day` = today's day of the month, counted from 1, and `expected = Planned × day / daysInMonth`.
  - **Ahead of pace** when `spent − expected ≥ max(£10, 10% of Planned)`.
  - **Over** when Spent > Planned.
  - **Runs out**: if the daily average `spent/day` would reach Planned before the month ends, give that date.
  - The thresholds are constants in one place.
- **Needs care** = over, or ahead of pace.
- **"Sorted to <date>"**: the latest transaction date brought in (the posted lag is 1–3 days). Show it wherever pace shows.
- Destinations with no Planned amount show only spent, e.g. "£112.81 one-offs".

### 6.6 Carry-over pots ("free")

```
free = checkedBalance
     + payday Move ticks into the pot made after checkedBalance.at
     − settle-up "Out of <pot>" ticks made after checkedBalance.at
     − card spend on the pot not yet settled
```

"Not yet settled" means lines on transactions whose statement has no done "Out of <pot>" tick. With no checked balance, show "Check against Monzo" and no figure.

The annual costs listed under the pot come from Plan items with that destination and `frequency: 'annually'`.

### 6.7 Statements

- **Which statement a transaction is on comes from `statementKey`**, set from the export's period at import, not from its date (§4.1). Manual entries use the date window: for close day *d*, from (the previous close date + 1) to the close date. Window helpers are also used for the open statement, the next close date and the due date: due date = close date + `dueDaysAfterClose`.
- **Open**: today ≤ close date.
- **Complete**: an export of that period taken after the close date has been brought in and matches Amex's summary. Amex can export past periods, so this is always possible. Without it, allow an override: "Settle without the final export".
- **Ready to settle**: closed, complete, and every purchase and refund in it is sorted.
- **Settled**: every settle-up step is done.
- **The total** = Σ purchases and refunds with that `statementKey`. Payments are excluded. Show any payment rows separately (§4.5). When `amexSummary` exists, show whether North's rows match Amex's Charges and Payments & Credits.

### 6.8 Settle-up steps (`settleSteps(document, statementKey)`)

1. Shares: Σ the split lines of the statement's transactions by destination. Turn each pot share into its account, and keep account shares on their own account.
2. For each account in order (each person's own accounts first, Immy then Nick in household order, then joint accounts, with the pay-from account last):
   - For each pot share > 0: **Out of <pot>**, key `settle:out:<potId>`.
   - For each pot share < 0 (refunds bigger than spend): **Into <pot>**, key `settle:into:<potId>`, made after the account has the money.
   - If the account isn't the pay-from account and its net share is above 0: **Send to <pay-from account>**, key `settle:send:<accountId>`. If the net is below 0, the pay-from account sends the difference back instead: `settle:return:<accountId>`.
   - Account shares on the pay-from account itself, such as "Joint account" one-offs, need no step. Note them as "includes £95.00 of one-offs".
3. The last step is **Pay <card> £total from <pay-from account>**, key `settle:pay`.
4. Ticks reuse `StepTick` and `stepStatus` from `transferTicks.ts`, including "changed since ticked" when a later re-sort or a late refund changes a share. A statement is settled when every step is done. Say who makes each step: the account's owners, or "Either of you" for a joint account.

### 6.9 Month stages (`monthStage(document, month, today)`)

| Stage | When |
|---|---|
| `upcoming` | The month hasn't started and none of its payday steps are ticked. |
| `funding` | Before or during the month, with some but not all payday steps done. |
| `funded` | Before the month starts, with all payday steps done. Shown as a chip once the month is in progress. |
| `in-progress` | today is inside the month. |
| `closing` | The month has ended and isn't closed. |
| `to-settle` | Closed, but a statement holding any of the month's transactions isn't settled. |
| `settled` | Closed, and all of those statements are settled. |

Home shows every month from the oldest unsettled one up to next month.

### 6.10 Closing a month (D7, D8, D11, R1)

- **Can close when** all of the month's transactions are sorted, and the latest import is at least 3 days after the month ended (to catch late postings). An override is allowed: "All October transactions are in".
- **Overspends:** every pot with Spent > Planned. The cover source defaults to the buffer (`bufferDestination`: Joint Monzo's main balance). The alternatives are another pot with money left that month, or `next-month`. Each cover that moves money creates a step on the close screen (key `cover:<potId>`), ticked like any step:
  - from an account: "Move £35.00 from Joint Monzo into Eating out";
  - from a pot: "Out of Treats £35.00, then move into Eating out".
- **Leftovers:** store `Planned − Spent` (> 0) for each monthly pot in `leftovers`.
- **Built up** for a monthly pot = Σ leftovers − Σ movedOut. Flag it when built up > `buildUpLimit` × monthly Planned. The flag offers "Move £X…" (which records `movedOut`; the user moves the money in their bank) or "Keep it" (which hides the flag until it grows again).
- **The Close button** sets `closedAt`. Re-sorting a transaction in a closed month afterwards shows "Changed since closed" on that month, with "Close again".

## 7. Screens (see the canvas boards)

| Screen | Board | Notes |
|---|---|---|
| Spending tab: To sort, This month, Statements (+ Rules on desktop, and under ⋯ on phones) | 3, 4, 7 | Its own `view=spending` with a `spendingView` param, following `navigation.ts` patterns. |
| Bring in sheet | 3 | File input (`.xlsx`), "Download the Excel version of your transactions from Amex online", the counts afterwards, the summary check, "Sort N transactions". |
| Sort sheet | 3 | Suggestions with "£X left", "Always put <merchant> in this pot", "All pots and accounts", Split. |
| Split editor | 6 | Two modes: By amount / Receipt items. "Half each" and "60/40" shortcuts. "Everything else" takes the remainder. "Left to place £0.00" before Save. |
| Refund-of-split sheet | 6 | Exact match first, then each line, or "Spread across the split". |
| This month | 4 | Grouped like Plan (Joint, then each person, then Accounts). Bar plus pace tick, and status text. |
| Pot detail (steady) | 4 | "£X left for N days", "About £Y a day. You've averaged £Z", a cumulative chart vs planned pace, "Runs out around <date>", transactions with "on <Month> statement". |
| Pot detail (carry-over) | 4 | Free, broken down (§6.6), "Check against Monzo", annual costs from Plan. |
| Statement | 5 | Total, "All N sorted", "Matches Amex's summary", which months it counts in, shares by person and pot, Settle up. |
| Settle up | 5 | Steps per account (§6.8), tap-to-copy amounts, ticks, progress. |
| Close month | 2 | Overspends with cover pickers (default: Joint Monzo) and cover steps, leftovers with built up, the build-up flag, carry-over pots, one Close button. |
| Home month cards | 2 | Described in §7.1. |
| Desktop Spending | 7 | A sorting table you can use from the keyboard (↑/↓, `/` to search pots, Enter, `A` for Always, `S` for split), with the month panel and current statement alongside. |

### 7.1 Home

Keep today's Home (#121–#122): the per-person summary, the to-do list and Coming up. Each card is one month:

- **Current month card** (first): the stage chip ("In progress · 18 days left") and health chips ("Funded", "Sorted to 10 Nov", "2 pots need care"), then "£X of £Y spent", needs-care rows that open the pot, and "Bring in Amex transactions · last done Mon 9 Nov" once the last import is 3 or more days old. The existing per-person summary and per-person payday to-dos sit inside this card.
- **Previous month card** while it's closing or to settle: a checklist (All transactions in and sorted, Close <Month>, Settle the <Month> statement by <due>).
- **Next month card**: "December · money arrives Fri 27 Nov · Mon 30 Nov". It becomes a funding checklist once any of its payday steps is ticked. If one is ticked more than 3 days before the earliest expected payday, show "January's money has arrived early. It's for January."
- **Final export:** Amex can export past periods, so nothing is lost when a statement closes. After the close date, Home asks once for the final export: "Bring in the final October statement". This makes the statement *complete* (§6.7). There is no urgent last-chance task. Show a gentle "Statement closes tomorrow" in the current month card the day before the close.
- **Settled months** become a one-line "October · settled Mon 23 Nov", then drop off once the next month settles.
- **Later:** health dots in the 4×3 month picker (settled, closing or to settle, in progress, not started).

## 8. PR plan

Twelve PRs in five series. Each one is a squash-merged PR from fresh `main`, on a branch named `card/<n>-<slug>`.

### How every PR is done

1. Branch from an up-to-date `main`.
2. Implement it, with unit tests for every domain function and component tests for new UI. jsdom renders the phone layout, because it has no `matchMedia`.
3. Update the docs in the same PR: the screen sections in `product-design-spec.md`, and the rules in `docs/card-tracker-rules.md` (created in PR 1).
4. Run `npm run check` (lint, tests, build). The CI runs the same.
5. Check it visually at **375×812 and 1440×900**. Run the dev server with `npm run dev -- --port 5174 --strictPort --mode localonly`, and seed it from `/scripts/baseline-seed.html`. From PR 3 on, the baseline fixture includes card data.
6. Run `gh pr create`. Wait until CI shows a run before `gh pr checks --watch`, because `--watch` can exit early with "no checks reported". Then `gh pr merge --squash --delete-branch`, and check CI on `main`.
7. Never put Nick's real exports or their contents anywhere (§4).

### Series A: Foundations

**PR 1 · `card/1-model`: data model, settings and rules doc**
- `src/domain/cardTracker.ts`: the §5.1 types, `validCardTracker`, `normaliseDescription`, `merchantKey`, the statement window helpers (`statementFor(date, card)`, `dueDate`), `monthOf(date)`, and a pence parser.
- Wire `card` into `decodeBudgetDocument`: optional, and invalid makes the document invalid. Add a test that old documents still load.
- Household → "Cards" section: add or edit a card. **Creating a card requires the closing day and the days until due**, with no silent defaults; Nick will enter 24 and 25. The other settings: the name, pay-from account (default the joint account), buffer (default the pay-from account's main balance), and cardholder suffixes.
- Docs: create `docs/card-tracker-rules.md` from §2, §3 and §6 here, link it from the README, and add the glossary rows (§3).
- Done when: a document with a card round-trips through save and load; invalid shapes are rejected; the settings save.

**PR 2 · `card/2-xlsx-import`: workbook reader and importer**
- `src/domain/xlsx.ts`: a minimal, dependency-free XLSX reader.
  - Unzip using the ZIP central directory, inflating entries with `DecompressionStream('deflate-raw')` (available in current browsers and in Node 18+ for tests); support stored entries too.
  - Read `xl/workbook.xml` and its rels to find sheets by name.
  - Read `xl/sharedStrings.xml` (including rich-text runs) and the sheet XML. Handle cells of type `s`, `inlineStr`, `str`, `n` and `b`.
  - Parse XML with `DOMParser`, which jsdom provides in tests.
  - Return rows as arrays of strings and numbers.
  - Keep it small and well tested. Don't add a spreadsheet library.
- `src/domain/amexImport.ts`: sheet and header checks, period and summary parsing, row mapping, kinds, `statementKey`, the summary check, deduplication, rule application (the matcher is built here even though rules UI comes in PR 4), and `ImportRecord`.
- `scripts/amex-fixture.mjs`: generates `docs/fixtures/amex-export-sample.xlsx`, a **synthetic** workbook with the real layout and quirks:
  - both sheets and the 6-row header with a period in B1;
  - text dates and float amounts;
  - a newline inside Extended Details;
  - a payment row, a refund, and a row dated the day before the period starts;
  - two card suffixes;
  - a summary that matches.

  It also writes a variant whose summary doesn't match. The data is fictitious (merchants, names, references, balances). Write the zip with Node's `zlib` (deflate-raw).
- Tests cover the reader's cell types and shared strings, pence accuracy, the period parse, the summary match and mismatch, re-importing the same file (0 added), overlapping files, an unknown suffix, a wrong file (e.g. a CSV or another spreadsheet), and a row dated before the period that still lands on the export's statement.

**PR 3 · `card/3-spending-tab`: the tab, Bring in, To sort, manual entry**
- Navigation: add `spending` to `PlannerView`, plus a `spendingView` param (`sort` | `month` | `statements` | `rules`). Add a nav item in `PlannerHeader` (lucide `CreditCard`) between Plan and Transfers on both the sidebar and the bottom nav, keeping 48 px targets with 5 items at 375 px.
- Spending page with tabs, the Bring in sheet (`.xlsx` file input → PR 2 import → counts and the summary check → "Sort N"), the To sort list (newest first, with card and person), "Last brought in …", and empty states.
- "Add a transaction" by hand (§6.2).
- The baseline fixture's card has `closeDay: 24` and its transactions carry `statementKey`s, matching the real periods.
- Extend `scripts/baseline-fixture.mjs` with synthetic card data: the Ada and Ben cards, about two months of transactions with some sorted and some not, a few rules, and one carry-over pot.
- Done when an Excel export can be brought in on a phone and desktop and its new rows listed to sort.

### Series B: Sorting

**PR 4 · `card/4-sort-and-rules`: sort sheet, rules, Sorted by rules**
- Sort sheet with the §6.3 suggestions (no "£X left" until PR 7), "All pots and accounts", and "Always put <merchant> in this pot" (creates a `SortRule`).
- "Sorted by rules · N" section with Check; changing a rule-sorted transaction offers to update the rule.
- Rules tab: list, edit `contains` and the card restriction, change the destination, delete, reorder.
- An "All transactions" list with re-sorting.

**PR 5 · `card/5-splits`: split by amount, half each, receipt items**
- The split editor (board 6): lines with a destination, amount and note; the Half each and 60/40 shortcuts (the 60/40 share comes from the same proportional funding share Transfers uses); receipt items mode with an "Everything else" remainder line; a live "Left to place" and a total by pot; save is blocked unless the lines add up.
- Split rows in lists ("Split · 4 pots", with the lines below).
- Model support for `SortRule.split` (D13), but no UI yet.

**PR 6 · `card/6-refunds-payments`: refund matching and payment rows**
- Refund matching (§6.4) on import and in the sort sheet, the refund-of-split sheet, and `refundOf` links shown on both rows.
- Payment rows: listed apart and never sorted. The statement hint and the offer to tick come in PR 9.

### Series C: Tracking

**PR 7 · `card/7-this-month`: planned vs spent, pace, pot detail**
- `src/domain/cardSpending.ts` (§6.5) with thorough tests: refunds, splits, next-month covers, months with no plan, the first and last day of a month, and a 31-day month.
- This month tab and the steady pot detail with its chart (inline SVG using the colour tokens in `styles.css`, with an accessible label and a text equivalent of the key figures).
- "£X left" in the sort sheet options. Pot settings (pace, carries over, build-up limit) wherever pots are managed.

**PR 8 · `card/8-carry-over`: carry-over pots**
- Free (§6.6), the "Check against Monzo" balance entry, and annual costs from Plan, shown in the carry-over pot detail and the This month row.

### Series D: Months and settling

**PR 9 · `card/9-statements-settle`: statements and settle up**
- Statements tab (open, ready, settled), the statement detail (total, sorted state, the Amex summary check, which months it counts in, shares by person and pot), settle-up steps (§6.8) with ticks and tap-to-copy reusing Transfers' components, "changed since ticked", the payment-row hint, and the settled state.

**PR 10 · `card/10-close-month`: month stages and closing**
- `src/domain/monthStages.ts` (§6.9) and the close rules (§6.10): the Close <Month> screen, cover pickers and cover steps, leftovers, built up, the build-up flag with Move or Keep, carry-over pots, and the household Close button. Re-sorting after close shows "Changed since closed".

**PR 11 · `card/11-home-months`: Home month cards**
- §7.1 in full: the current, previous and next month cards, health chips, needs-care rows, the bring-in and final-export tasks, the settled one-liner, and the early-pay message.
- Add the optional `payday` (day plus previous or next working day, §5.2) to employment income sources, edited in the income dialog, and the England and Wales working-day helper with tests: weekends, Easter-based holidays, substitute days, and the 2026 Christmas example.
- Keep the existing Home tests passing and update them for the new structure.

### Series E: Desktop and extras

**PR 12 · `card/12-desktop`: desktop Spending polish**
- The board 7 layout: the sorting table with keyboard shortcuts and focus moving to the next row, the side panel with the month and current statement, and settle-up in columns like desktop Transfers.
- Every earlier PR must already *work* at 1440 wide; this PR makes it efficient.

**Optional, later:** a split-rule UI (D13), month-picker health dots (§7.1), and automation (§9).

## 8a. As built: differences from this plan

Each was recorded in its PR's "Design conformance" section. None changes a decision (D1–D16, R1).

- **Model (PR 1):** `CardTransaction.merchant` stores `merchantKey` of the raw description, because the stored description is whitespace-collapsed (§5.1a). Extra optional fields: `TransactionSort.checkedAt`, `StatementRecord.finalImportAt` / `settleWithoutFinalAt`, `MonthRecord.allInAt` / `closedSpent`, `PotTracking.keptBuildUpPence`. Cards have no delete. Days until due accept 1–60.
- **Import (PR 2, 6):** the header row is found by its exact 13 columns rather than fixed at row 7. An unreadable row, period or summary figure stops the whole import with a message. Refund matching runs as a second pass so a refund can match a purchase in the same file; an import-matched refund is stored `by: 'rule'` without a rule id (shown under Sorted by rules, tagged Refund). "Same card" for refunds means the same card ending.
- **Navigation (PR 3–10):** `spendingView` also has `all` (All transactions); `spendingPot`, `spendingStatement` and `spendingClose` open a pot, a statement and Close <Month>. Sections appear as they ship; on phones All transactions and Rules sit under ⋯.
- **Sorting (PR 4–5):** "Always" sits above the suggestions so it can be ticked before the one tap; a new rule also sorts anything still waiting that it matches. Six suggestions show before "All pots and accounts". The funding-share button names the actual share ("62/38"). A split with an account reads "Split · 3 ways".
- **This month (PR 7):** accounts show only what was spent ("one-offs"), never Planned. Rows: paced pots with a plan, plus anything with spending. "Runs out" shows only when a pot is ahead of pace.
- **Carry-over (PR 8):** annual costs list their yearly amount only; Plan items have no due month.
- **Statements (PR 9):** a statement is named by the month it closes in ("November statement" for 25 Oct – 24 Nov). Settle up opens once a statement is ready (or part ticked).
- **Closing (PR 10):** a cover's source is stored when chosen so its step can be ticked before Close. "Move £X…" suggests leaving one month's Planned.
- **Home (PR 11):** the per-person summary stays at the top and To do stays its own section; the month cards sit between them.
- **Desktop (PR 12):** each row's pot starts at its suggestion, so Enter places it in one key; the side panel shows on To sort and All transactions.
- **Not built (later):** a split-rule UI (D13), health dots in the month picker (§7.1), automation (§9).

## 9. Automation later (D14)

| Stage | Now | Later |
|---|---|---|
| Bring in | Excel export upload; manual entry for anything missed | A daily feed, e.g. Open Banking. The Bring in button and the final-export task disappear, and Home says "3 new to sort". |
| Sort | Rules plus suggestions | The same, with better suggestions. |
| Balances | Checked by hand for carry-over pots | Pulled daily from the banks. "Checked Mon 9 Nov" becomes "Updated today". |
| Settle | Ticked by hand | Still by hand. A payment row in the feed offers the Pay tick. |

To keep that possible, every computed figure comes from the stored transactions and settings, never from the screen's state. "Last brought in" comes from `imports`. Nothing assumes a human did the import.

## 10. Questions answered

All answered by Nick on 11 Nov 2026. Nothing blocks the build.
- Statements run from the 25th to the 24th, and payment is due **25 days** after the close. Both are required when a card is created.
- The bill is always paid from Joint Monzo, and the buffer is Joint Monzo's main balance.
- North requires the Excel export.
- **Paydays:** Immy on the 28th or the last working day before it; Nick on the 28th or the next working day after it.
- **Amex can export past periods**, so a statement is completed from its final export (§6.7). There's no last-chance pressure.
