# Recurring bills: design and PR build plan

Status: planned, 13 November 2026, with Nick. All five PRs are built (14 November 2026); [recurring-bills-rules](recurring-bills-rules.md) tracks what has shipped. Read this in full before starting any PR in it. Where it disagrees with the design canvas, this document wins; §6.1 lists the differences.

- **Design canvas** (private to the owner): https://claude.ai/artifact/Wqv1KMXNFrMimWybckZjLw, boards 1–6. The sample household and amounts on it are made up.
- **Related rules:** [card-tracker-rules](card-tracker-rules.md) (Spent, Left, pace, pot balances, Home), [recurring-monthly-budget-rules](recurring-monthly-budget-rules.md) (snapshots and edit scope), [product-design-spec](product-design-spec.md) (layout, language, glossary).

---

## 1. What we're building

Spending knows what went on the Amex card. It doesn't know about money that leaves a Monzo pot directly. Direct debits can't go on a credit card, and some bills are paid with a Monzo card linked to a pot (for example, Nick's phone bill on a virtual card). So the Bills pot's Spent is too low, and its worked-out balance drifts until the next "Check against Monzo".

Recurring bills fix this without a bank feed:

1. **A plan item can be a recurring bill.** It's paid by **direct debit** or **card**, and comes out on a set day. Yearly bills also have a month, which is the renewal date.
2. **North assumes a bill is paid on its day**, at the planned amount, unless it's paid on a card North tracks (Amex). A tracked card's charge already arrives on the statement and is sorted as usual.
3. **Pots show what's due.** A pot's figures add "£172.00 of it due" for the month's bills that haven't come out yet.
4. **Renewals are reminded.** Before a yearly bill renews, Home asks you to check the price, and a new price updates the plan.
5. **Plan › Dates** lists every bill by day and every renewal by date.

### Why not import Monzo's transactions

This was considered first (§9). The Monzo Google Sheets export does show direct debits paid from pots. But it leaves out payments on a pot's virtual card, has no pot balances, and only names pots by display name. Assuming bills on their day covers direct debits, standing orders and virtual cards the same way. It needs no file and works for every person's accounts.

## 2. Agreed decisions (the product contract)

Agreed with Nick on 13 Nov 2026. Don't change these without asking.

| # | Decision |
|---|---|
| B1 | **A "Recurring bill" checkbox** on the item, off by default. Ticking it reveals **Paid by: Direct debit · Card**. Unticked items behave exactly as today. There is no visible "Not a bill" option. |
| B2 | **Card asks which card**: each card North tracks (Amex), or **Another card**, which covers a Monzo virtual or debit card. |
| B3 | **Assumed vs seen.** A direct debit, or a payment on another card, is **assumed paid on its day at the planned amount**. It counts as Spent and lowers the pot's worked-out balance. A bill on a **tracked card** is never assumed: its charge comes in through Bring in and Sort. Its date is only used for Due and reminders. |
| B4 | **Dates.** A monthly bill has a day: 1st–28th, or **Last day**. A yearly bill has a day and a month, and that date is also its **renewal date**. There are no 29th–31st days, and weekends and bank holidays are ignored. |
| B5 | **Bills North assumed went out show as "Paid".** Bills not out yet show as **Due**. |
| B6 | **Renewal reminders** go on Home's To do list, by default **4 weeks** before the renewal. The warning time is set per item: 2, 4, 6 or 8 weeks, or off. |
| B7 | **The Dates view lives in Plan**, as a third grouping next to Category and Destination. |
| B8 | **No Monzo import for now.** It may come back later as an optional check of assumed against actual (§9). |

### Decisions made while planning (P1–P4)

Nick confirmed P1, P2 and P4 on 13 November 2026, before PR 2. P3 shipped in PR 1.

- **P1 · Left keeps its meaning.** Left stays Planned − Spent − Taken. Due is shown as a part of Left: "£256.54 left · £172.00 of it due". The canvas's Left tile shows Left after Due instead (§6.1).
- **P2 · Bills to an account are not added to Spending figures.** Spending gives accounts no Planned, because direct items such as rent aren't tracked there. A recurring bill whose destination is an account still appears in Plan › Dates and Coming up, but adds nothing to Spent and changes no balance.
- **P3 · Yearly bills need a pot that carries over.** In the month a yearly bill renews, its full amount counts as Spent while Planned is only the monthly set-aside. In a pot that doesn't carry over, that would read as an overspend. If the pot doesn't carry over, the editor warns: "Bills that renew yearly need a pot that carries over". Saving is still allowed.
- **P4 · Pace allows for bills.** In a paced pot, bills come out on fixed days, not steadily. Expected spend = bills paid so far this month + (Planned − all of this month's bills) × day ÷ days in month.

## 3. Words on screen

New words for the [glossary](product-design-spec.md#glossary), in PR 1:

| Word | Means | Not |
| --- | --- | --- |
| **Recurring bill** | A plan item that comes out on a set date. | Scheduled payment, standing item |
| **Paid by** | Direct debit or Card (then which card). | Payment method |
| **Paid** | A bill whose day has passed. North assumes it went out unless it's on a tracked card. | Counted, assumed, cleared |
| **Due** | A bill this month whose day hasn't come yet: "£172.00 of it due", "Due 22 Nov", "Due in 5 days". | Pending, upcoming, outstanding |
| **Renews** | A yearly bill's date: "Renews 3 Mar". | Expires, due date |
| **Via Amex** | A bill on a tracked card, listed for its date only: its spending comes from Sort. | |

Keep to existing words elsewhere. Money leaving a pot is still "Out of <pot>", and **Move** keeps its meaning. Run `copy.vocabulary.test.ts`.

## 4. Data model

### 4.1 On the item

Recurring-bill details live on `BudgetItem`, so they follow snapshot rules. An edit from November applies from November, as the editor's scope line already says.

```ts
// monthlyBudget.ts
export type BillDay = number | 'last'            // 1–28, or the month's last day
export interface RecurringBill {
  paidBy: 'direct-debit' | 'card'
  /** Card only: a tracked card's id (`card.cards[].id`). Absent means "Another card". */
  cardId?: string
  day: BillDay
  /** Yearly items only: 1–12. With `day`, this is the renewal date. */
  month?: number
  /** Yearly items only: weeks before the renewal to remind, 0 = off. Default 4. */
  remindWeeks?: 0 | 2 | 4 | 6 | 8
}
export interface BudgetItem { /* …existing… */ bill?: RecurringBill }
```

Validation in `validMonthlyBudget`:
- `day` must be 1–28 or `'last'`.
- `month` must be present for a yearly item and absent for a monthly one.
- `remindWeeks` is only allowed on a yearly item.
- `cardId` is only allowed when `paidBy` is `'card'`.

Changing an item between monthly and yearly in the editor clears or asks for `month`. No version bump: older documents have no `bill`.

### 4.2 Renewals handled

```ts
// budgetDocument.ts: optional like `card`
bills?: {
  /** Item id → the renewal date (YYYY-MM-DD) whose reminder was answered (Same price or Save new price). */
  renewals: Record<string, string>
}
```

### 4.3 Which card is tracked

A card is tracked when its id is in `card.cards`. A `cardId` that no longer matches a card counts as **Another card**. A card that's no longer in North isn't tracked, so its bills are assumed. Removing a card in Settings warns how many bills use it.

### 4.4 Baseline fixture

PR 1 adds synthetic recurring bills to `docs/fixtures/plan-transfers-baseline.json`, matching the canvas:
- Monthly bills in Bills: council tax by direct debit on the 1st, Netflix on Amex on the 2nd, water by direct debit on the 5th, phone on another card on the 9th, energy by direct debit on the 18th, broadband by direct debit on the 22nd.
- Yearly bills in Bills: breakdown cover on Amex, 6 Dec; home insurance by direct debit, 12 Jan; car insurance by direct debit, 3 Mar; TV licence by direct debit, 1 Apr.

Keep `baselineFixture.test.ts` reconciled. Never use real exports or real bill amounts.

## 5. Domain rules and algorithms

New module: `src/domain/recurringBills.ts`.

### 5.1 A month's bills (`monthBills(document, month, today)`)

For each item in `resolveBudget(document.budget, month).items` that has a `bill`:
- **Date:** monthly → `month-DD`, or the month's last day. Yearly → only when `bill.month` is this month.
- **Amount:** monthly → `amountPence`. Yearly → `entryAmountPence` (the full yearly price).
- **Tracked:** `paidBy === 'card'` and `cardId` names a card in `card.cards`.
- **State:** `paid` when date ≤ today; `due` when date > today. For a past month every bill is `paid`; for a future month every bill is `due`.

It returns `{ itemId, name, destination, date, amountPence, paidBy, cardId?, tracked, state }[]`, sorted by date, then name.

### 5.2 Spent, Due and pace (`monthSpending`)

- **Spent** for a pot also includes its bills that are `paid` and **not tracked**. Account destinations are left out (P2).
- **Due** is new on `DestinationSpending`: `duePence` = Σ the pot's `due` bills, tracked or not. A tracked bill leaves Due on its day, whether or not its charge has been sorted yet. The posting lag means it can briefly be in neither.
- **Left** is unchanged: Planned − Spent − Taken (P1).
- **Which rows show:** a pot with any bill in the month shows, even at £0 spent.
- **Pace** (P4): `billsSoFar` = Σ the pot's bills dated ≤ today, `billsAll` = Σ all its bills this month (both tracked and untracked).
  - expected = billsSoFar + (Planned − billsAll) × day ÷ days in month.
  - "Runs out" uses only the spending that isn't from bills: (Spent − untracked paid bills) ÷ day against Planned − billsAll.
- `leftByDestination` (the Sort sheet) is unchanged.

### 5.3 Pot balances (`potFlows`, `potBalance`)

- **New flow `'bills'`:** each untracked bill to a pot, in any month, flows −amount at the **start of its day** (local midnight, as an ISO string). A balance checked on the bill's day already includes it, since direct debits go out early in the morning. Only bills after the check count, as for every flow.
- **Free** (carry-over pots) = balance − card spend waiting − this month's untracked `due` bills for the pot. Money about to leave isn't free.
- The "How it's worked out" list shows the new flow as "Bills paid".

### 5.4 Renewal reminders (`homeInbox`)

- For each yearly bill, the **next renewal** is the first date with its day and month on or after today, or the most recent one if it hasn't been answered yet (below).
- **To do task** `renewal:<itemId>:<date>`, of new kind `'renewal'`:
  - It shows from `remindWeeks` weeks before the renewal.
  - Title "<Name> renews 6 Dec". Meta "In 3 weeks · £96.00 a year · Card · Amex".
  - Its target opens the Renewal sheet (§6, board 2).
  - It goes once `bills.renewals[itemId] === date`.
  - If the date passes unanswered, the task stays, titled "<Name> renewed 6 Dec", until it's answered. *As built (PR 5): for up to 4 weeks, so a bill dated long after its renewal doesn't ask about last year; and one answer covers renewals within six months of it, so moving the date while answering doesn't ask again.*
  - With `remindWeeks: 0` there's no task.
- **Coming up:** monthly and yearly bills in the next **7 days** (`BILLS_AHEAD_DAYS`), "Energy · £140.00", meta "Direct debit · Bills". Renewals don't repeat here while their To do task shows.

### 5.5 Answering a renewal

- **Same price** sets `bills.renewals[itemId] = date`.
- **Save new price** does the same, and edits the item from the renewal's month with `updateBudgetAtMonth`. It sets the new yearly price, and optionally a new renewal day and month. The sheet shows the month's impact with the same `budgetImpact` / `ImpactPreview` as the item editor: the new monthly set-aside and each person's change in Funding.

### 5.6 Edge cases

- **A bill added mid-month whose day has passed** shows as Paid for this month. It went out. It only changes the balance if the date is after the last check.
- **Removing an item** removes its bills from the month it's removed from onward, by snapshot rules.
- **February with day `'last'`** gives the 28th or 29th.
- **A yearly bill's month changes** in a later snapshot: each month uses its own resolved item.
- **Closed or settled months** use their own snapshots, so adding a date today doesn't change a closed month unless that month's snapshot is edited.

## 6. Screens (canvas boards)

1. **Item editor** (board 1, interactive):
   - A "Recurring bill" checkbox below Funding, described as "Comes out on a set date, like council tax, insurance or a subscription."
   - Ticked, it shows **Paid by** (a two-option segmented control), **Card** (a select of the tracked cards and Another card), then **Comes out on** (monthly) or **Renews on** with a day and month and **Remind me** (yearly).
   - A line says what will happen: "North marks £480.00 as paid from Bills on 3 March, and reminds you 4 weeks before." Tracked: "You'll sort the charge from the Amex statement as usual."
   - Shows the P3 warning when it applies.
2. **Renewal sheet** (board 2): the planned price, then **New price** and **Next renewal**, and the impact from the renewal's month. Actions: **Same price**, **Save new price**, and a link to edit the item.
3. **Phone · pot detail** (board 3): Spent / Due / Left in the header, and the month's bills with a Today divider.
4. **Desktop · pot detail** (board 4), for pots with bills:
   - The figures.
   - What Spent is made of ("£241.00 direct debits and cards" · "£10.99 sorted from Amex").
   - **Bills this month**, a table of date, item, paid by, amount and status. Tracked rows are muted and marked "Via Amex".
   - **Yearly bills set aside here**: each yearly bill's renewal, monthly set-aside and yearly price.
5. **Plan › Dates** (board 5):
   - **Every month** by day, with paid by, destination and amount, and the monthly total.
   - **Once a year** by renewal date, with reminder status, yearly price and monthly set-aside.
   - A prompt for **yearly items with no date**: "3 yearly items have no renewal date", linking to Add dates.
6. **Home** (board 6): the renewal task with **Check the price** / **Same price**, and bills in the next 7 days.

### 6.1 Where this differs from the canvas

- **Left:** the canvas's Left tile shows Left after Due (£84.54). The build shows Left as today (£256.54) with "£172.00 of it due" (P1). The desktop tiles become Planned · Spent · Left, with Due under Left.
- **Home:** the canvas draws a new "Coming up" card. Home already has **To do** and **Coming up**. The renewal is a To do task, and bills join the existing Coming up list.
- **The no-date prompt** on the canvas names Bills and Subscriptions. The build prompts only for yearly items with no date, since nearly every yearly item is a renewal.

## 7. PR plan

Five PRs, each squash-merged from fresh `main` on a branch named `bills/<n>-<slug>`.

### How every PR is done

Follow [card-tracker-build-plan §8](card-tracker-build-plan.md#how-every-pr-is-done):
- Domain unit tests and component tests.
- Docs in the same PR: create `docs/recurring-bills-rules.md` in PR 1, and update `product-design-spec.md`.
- `npm run check`.
- Visual check at 375×812 and 1440×900, against the baseline seed.
- `gh pr create`, wait for CI to list a run, watch it by PR number, squash-merge, then check `main`.

### PR 1 · `bills/1-model`: the item and the editor

- The `RecurringBill` type, validation, decoding, and drafts in `budgetItemDrafts.ts`.
- The editor section in `BudgetItemEditor.tsx` (board 1), with the P3 warning.
- Removing a card warns about bills that use it.
- The fixture bills (§4.4).
- Rules doc and glossary words.
- Tests: validation, draft round trip, editor states (unticked, direct debit, card tracked or other, monthly or yearly, switching frequency).

### PR 2 · `bills/2-figures`: Spent, Due, pace and balances

- `monthBills`.
- `monthSpending`: Spent, `duePence`, rows shown, pace (P4).
- `potFlows` `'bills'`, and Free less due bills.
- Month › Pots rows show "£X of it due".
- Tests:
  - paid/due at the month's edges and on the bill's day
  - last day in February
  - yearly bills only in their month
  - tracked bills excluded from Spent but included in Due
  - account bills ignored (P2)
  - pace with bills
  - balance flows before and after a check

### PR 3 · `bills/3-pot`: the pot detail

- Boards 3–4: the Spent breakdown, Bills this month with the Today divider, and Yearly bills set aside here.
- Tests at the phone layout.

### PR 4 · `bills/4-dates`: Plan › Dates

- A `'dates'` value for `PlanGrouping`, and a third option on the toolbar switch.
- The two tables (board 5) and the prompt for yearly items with no date.
- A command palette entry, "Bills by date".
- Each row opens the item editor.

### PR 5 · `bills/5-renewals`: Home and the Renewal sheet

- `document.bills.renewals`.
- The `'renewal'` To do task, and bills in Coming up (§5.4).
- The Renewal sheet (board 2) with the impact preview (§5.5).
- Tests: the reminder window, remindWeeks 0, an unanswered past renewal, Same price, a new price from the renewal's month.

## 8. Risks

- **An assumed amount is wrong** after a price rise, a failed payment or a variable bill. The next "Check against Monzo" will show the gap. The renewal reminder catches most yearly changes. Monthly price rises rely on editing the item.
- **Build-up flags in Bills.** Money set aside for yearly bills builds up on purpose. If the Bills pot trips its build-up limit (2× monthly Planned by default), raise its limit in Manage → Pots. A smarter limit that allows for yearly bills can come later.

## 9. Later: a Monzo check (not planned)

If assumed bills turn out to be unreliable, North could read Monzo's Google Sheets auto-export (on Nick's paid Monzo plan) as a **check**, not a source. It would match each assumed bill to a real direct debit and flag "Assumed £32.50 on the 9th, actually £34.00".

Facts from a sample export (13 Nov 2026), kept here so they aren't lost:
- **Sheets:** one per account, "Personal Account Transactions" and "Joint Account Transactions". Immy's accounts need her own export.
- **Columns:** Transaction ID (`tx_…`, unique), Date, Time, Type, Name, Emoji, Category, Amount, Currency, Local amount, Local currency, Notes and #tags, Address, Receipt, Description, Category split. Hundreds of blank formatted rows follow the data, so stop at the first empty ID.
- **Signs:** amounts are from the main account's view. A negative Pot transfer is money into the pot.
- **Pots** are named only in Name, as "<pot> Pot". There's no pot ID.
- **A direct debit paid from a pot** is a pair with the same timestamp to the second: a `Direct Debit` row of −X and a `Pot transfer` row of +X naming the pot.
- **Payments on a pot's virtual card don't appear.** That's why B8 holds.
- **History** starts around when the export was turned on, so early transfer pairs can be missing a side.

Never commit a real export. Build any importer against a synthetic fixture.
