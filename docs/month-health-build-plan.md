# How are we doing this month: build plan

**Status:** drafted 16 November 2026 from UX audit 4 and its decisions D1–D14, all agreed with Nick. P1–P10 were decided while planning and are still to confirm. Figures are examples from the baseline fixture's Ada and Ben household.

Audit 4 followed one question, *how are we doing this month?*, through eight moments: payday, placing transfers, ticking off, day 10 after a statement upload, day 20, day 25, the last 3 days and the month just closed. North was good at *what to do next* and weak at *how we're doing*:
- Home listed jobs, not a verdict.
- The Amex had five figures that didn't add up on screen.
- A pot's "left" and its money disagreed, and nothing explained the gap.
- Personal pots that only see Amex spend looked like real budgets.
- Payday took 18 steps where 12 would do.
- Nothing answered "can we afford this?" before buying.

This plan fixes all of that in 11 PRs.

## 1. Decisions

| # | Question | Answer | What it means for North |
| --- | --- | --- | --- |
| D1 | The Amex figures | One sum per bill | **Bill = In the Amex pot + To move + To sort** (+ Expecting back, D11). Every figure names its bill ("the November bill"). Home shows the oldest unpaid bill until it's paid, then the open one |
| D2 | A pot's money | One sum per pot | **In the pot = Left this month + Waiting to move + Carried over**. "Free" is retired. Carry-over pots show **Spare** instead |
| D3 | Personal pots | Funded only | North moves the money in on payday and stops there. No Left, no pace, no leftovers or build-up, not counted in Spent. Their Amex spend is listed as "£115.30 on the Amex" |
| D4 | Spending this month | Tracked pots only | "£458.80 of £577.24", with pace. Bills and Saving get their own lines |
| D5 | Plan's balance | "unassigned" | "£58.13 unassigned" replaces "£58.13 left", so *left* only ever means a pot's Left |
| D6 | Joint pot moves | Once, for the household | Both of you fund the joint accounts. Then one of you makes each joint pot move once, at the household total, once both fundings are ticked |
| D7 | Paying each other | One net transfer | Ada's £810.74 to Ben and Ben's £516.10 to Ada become one transfer: £294.64 from Ada to Ben |
| D8 | Step order | The app you're in | Steps are grouped by the account the money leaves |
| D9 | Placing and ticking | One pass | Ticking a step copies the next amount. Every tick can be undone |
| D10 | Between the first payday and the 1st | Both months | The old month's verdict, with the new month's payday card on top |
| D11 | Money we expect back | Expecting back | Receipt items can be marked as coming back. They're held in their pot until the bill: not spent, not moved. A refund cancels them out. If no refund has landed by settle up, the money moves then |
| D12 | Discount codes | Spread over items | Original prices, plus one discount line (an amount or %) spread over the items it covers and checked against the charge |
| D13 | Carried-over money | Shown, not spent | Carried over is part of the pot sum, never part of Left |
| D14 | Home's layout | Pot cards, with a verdict line | A dated verdict line, a to-do strip, one card per Tracked pot, the Amex bill as a card, then Bills, Saving and Plan |

### Decided while planning (to confirm)

| # | Decision |
| --- | --- |
| P1 | **Carried over** = closed months' leftovers still in the pot (today's `builtUp`). If the worked-out balance differs from Left + Waiting + Carried over, a fourth line shows the difference as "Not explained £X", with **Check against Monzo**. It never hides inside another line |
| P2 | **Pot kind defaults:** a carry-over pot is Carries over; a savings pot or a pot in a savings account is Saving; a spending pot in one person's account is Funded only; anything else is Tracked. A savings pot kept in a current account (Holidays in Monzo Joint) is set to Saving by hand |
| P3 | **Weekly figures:** from Monday to Thursday a Tracked pot shows **This week**: Left spread over the weeks left. From Friday to Sunday it shows **This weekend**: what you can spend by Sunday night and still be on pace. Over a pot, it's £0.00 |
| P4 | **A typical shop** is the average of the pot's purchases of £30 or more over the last 3 months. It shows once there are 3 of them |
| P5 | **The new payday steps start with December**, the first month with no ticks. A month that already has ticks keeps its old steps |
| P6 | **A step that needs someone else's money waits for their tick.** The net transfer unlocks the moves that use it. Both fundings of a joint account unlock its household moves |
| P7 | **Expecting back that never comes back:** "Not coming back" turns it into spending in the purchase's month. A closed month then shows "Changed since closed" |
| P8 | **The month summary leads Home** from close until "Seen it", or until the 7th of the new month |
| P9 | **Joint's buffer is checked like a pot.** Check balances gets a row for it. After a check, covers and the Amex pot's extra and top-ups keep it worked out |
| P10 | **The full To do:** Open, on Home's to-do strip, opens a sheet with To do, Heads-up, Coming up and Done |

## 2. Words

New on screen: **Bill**, **In the Amex pot**, **To move**, **To sort**, **Expecting back**, **Left this month**, **Waiting to move**, **Carried over**, **Not explained**, **Spare**, **unassigned**, **Tracked**, **Funded only**, **Saving**, **Built up**, **Put by**.

The copy vocabulary guard (`src/copy.vocabulary.test.ts`) retires each old word in the PR that replaces its last use:

| Retired | Use instead | PR |
| --- | --- | --- |
| "£X left" for Plan's balance | "£X unassigned" | 3 |
| "free" (a pot's figure) | the pot sum, or "Spare" | 4 |
| "this statement" | "the November bill", "November bill so far" | 4 |
| "set aside" as a balance, "In Monzo now" | "In the Amex pot" | 4 |
| "still to move" | "To move" | 4 |
| "should hold" | "Expected", inside Check balances only | 4 |

"Matches" appears only after a real check made after the last move. Until then the Amex pot reads "worked out".

## 3. The figures

### The bill (D1)

| Part | What it is | Day 20 example |
| --- | --- | --- |
| In the Amex pot | What has moved in for this bill | £727.27 |
| To move | Sorted, not yet moved | £402.00 |
| To sort | Not yet sorted | £24.00 |
| Expecting back | Held returns (D11) | — |
| **Bill** | Purchases and refunds on the bill | **£1,153.27** |

On day 25 the November bill has closed: £1,254.86 = £1,153.27 in the Amex pot + £101.59 to move. The December bill so far is £106.00 = £27.00 to move + £79.00 expecting back, after a −£42.00 refund. Home shows November's sum, with "covered" once it's all in the Amex pot, until its Pay tick. Then it shows December's.

### A pot (D2, D13)

| Kind | Leads with | Its sum |
| --- | --- | --- |
| **Tracked** (Groceries, Going out) | Left this month, This week or This weekend, pace, To sort beside Left | In the pot £332.63 = Left −£12.83 + Waiting to move £156.40 + Carried over £189.06 |
| **Funded only** (Ada's and Ben's Spending) | "£1,135.42 moved in on payday", then its Amex spend | Due to the Amex pot: Next move £36.99, Held £79.00 |
| **Saving** (Holidays, Emergency) | Built up | Built up £6,931.08 = before November £5,756.72 + put by £1,586.36 − spent £412.00 |
| **Carries over** (Bills) | Spare | Spare = In the pot − bills due − waiting to move (today's "free") |

Before a pot's first check, In the pot is unknown, so the pot shows Left and Waiting with **Check against Monzo**.

### The verdict

One dated line on Home and in the month summary, made from the Tracked pots. It names a pot that's over or ahead of pace, otherwise "on track": "Groceries £12.83 over. Going out on track." The header carries the date it's true to ("Amex to Thu 19 Nov · 1 to sort"). On overlap days it names the month: "November: Groceries £77.03 over. Going out £79.87 left."

## 4. Screens

| Where | Today | With this plan |
| --- | --- | --- |
| **Home** | A three-figure strip (Plan, Spent, the card), then To do | The header with its date, the to-do strip (top 3 jobs, then **Open**), the verdict line, one card per Tracked pot, the Amex bill card, then Bills, Saving and Plan. A payday card leads from the first payday to the 1st (D10). A "Just brought in" card follows each bring-in. The month summary leads after close (P8) |
| **Payday** | 18 steps, grouped by destination, copy then tick | 12 steps: Ada 4 in Starling, Ben 3 in Nationwide, and one of you 5 in Monzo. **Start** copies the first amount and each tick copies the next. Waiting steps say what they wait for. A Done view shows where the £7,700.00 went and what November starts with |
| **Tracked pot page** | "£23.87 for 10 days · About £2 a day", In Monzo, "£212.93 free" | Left this month with To sort beside it, This week or This weekend, a typical shop, **Try an amount**, the pot sum, Carried over by month, and the last 3 months |
| **Funded only pot page** | "£1,134.20 for 2 days · About £567 a day" | Moved in on payday, its Amex spend, Due to the Amex pot (Next move, Held) and Expecting back. "What's in it now? Check Starling" |
| **Saving pot page** | Left and pace | Built up and its sum, put by each payday, and what was spent from it |
| **Month › Pots** | One list, every pot judged the same way | Grouped by Tracked, Funded only, Saving and Carries over. The header counts the Tracked pots only |
| **Amex** (Spending, the Amex pot page, Month's Amex row) | Five figures under different names | One sum per bill, oldest unpaid bill first, plus the Expecting back list |
| **Bring in** | Counts from the file and Amex's summary | Also the month: sorted to, earlier-month rows flagged ("3 are October's"), the verdict and what changed ("Groceries went from on track to £73 ahead"), bills gone out, the bill sum, and refunds named |
| **Can we afford…** | Nowhere before buying | A sheet from Home and every pot page: amount + pot gives an answer, with no record made |
| **Receipt items** | Final prices, typed by hand | A **Back** tick per item, original prices and one discount line, checked against the charge |
| **Move to the Amex pot** | "Out of Spending £115.99", net and unexplained | Each pot's line names its parts: "Netflix £9.99 + ASOS kept £69.00 − ASOS refund £42.00", and "£79.00 expecting back stays in her pot" |
| **Month summary** | "1 cover · 4 pots with money left" | "How did November go?": the verdict, Tracked pots against plan and against October, bills, Saving, covers from the buffer, what carries into December and the bill |
| **Check balances** | Pots and the Amex pot | Plus Joint's buffer (P9) |

### Can we afford…

| Pot | Answer |
| --- | --- |
| Tracked, stays within Left | "Yes. £71.27 left for the last 8 days", then on pace or "about £20 behind pace". If the pot has rows to sort, what changes if they're sorted there |
| Tracked, goes or is over | "£112.03 over. Joint's buffer covers it when November closes (£500.00, checked Thu 19 Nov)" |
| Funded only | "Check Nationwide": North only sees the Amex part. If it goes on the Amex, it moves to the Amex pot at your next move |

Saving pots, carry-over pots and the Amex pot aren't offered. On overlap days the sheet says which month's money it is: "This counts in November. December's Going out (£251.77) starts on Tue 1 Dec."

## 5. Payday (D6–D9)

| In | Who | Steps |
| --- | --- | --- |
| Starling | Ada | Send to Monzo Joint £2,223.22 · Send to Monzo Joint Savings £518.98 · Send to Ben £294.64 · Move to her Spending £1,135.42 |
| Nationwide | Ben | Send to Monzo Joint £1,796.27 · Send to Monzo Joint Savings £718.48 · Move to his Spending £1,249.50, which waits for Ada's £294.64 |
| Monzo | Either of you, once both have funded | Bills £965.58 · Groceries £325.47 · Going out £251.77 · Holidays £1,586.36 (from Monzo Joint) · Emergency £1,237.46 (from Joint Savings) |

- **Every account gets the same money as today.** Only who moves it, and in what order, changes. A test checks that the new steps add up to the old per-account totals for every fixture month.
- **Household moves** are keyed `household:move:<potId>`. The key ends in `:move:<potId>` like a person's move, so `potFlows` reads it unchanged.
- **One adult:** nothing changes.
- **Taps for Ben's half:** 9, or 10 if he has to wait for Ada's money. Today it's 20.

## 6. Expecting back and discounts (D11, D12)

- **Marking:** in Receipt items, each item has a **Back** tick. A ticked item's line carries `expectingBack: true`.
- **Held:** its line isn't counted as spending and doesn't move to the Amex pot. It's the bill's fifth part. On a Funded only pot it sits with the pot's Amex spend.
- **Matching:** a refund for the purchase is matched to its expecting-back lines first, whole or in part. This extends `matchRefundOnImport`, using `refundOf.lineIndex`. A matched line and its refund cancel out, so nothing moves.
- **Settle up:** if the bill's held money still hasn't been refunded, "Move the rest to the Amex pot" includes it, labelled. A later refund flows back out of the Amex pot like any refund.
- **Not coming back:** turns a held line into spending (P7).
- **Spending › Expecting back:** each held purchase, with its items, how much is still out and how long ago it was returned.
- **Discounts:** items take their original price. **Add discount** takes an amount or a %, spread over the ticked items in proportion to price, with leftover pennies going to the largest items first. Save stays off until items − discount = the charge. Lines store the discounted amount, keeping `originalPence`, and the sort keeps `discount` for editing. Every other figure reads `amountPence` as today.

Example: £165.00 of items, less a 20% code on 5 of them (£17.00), is £148.00. Ada keeps £69.00, and £79.00 is expecting back.

## 7. Edge cases

| Case | What happens |
| --- | --- |
| Pot never checked | No In the pot. Left and Waiting show, with Check against Monzo |
| Sum doesn't add up (a missed transfer, interest) | "Not explained £X", until the next check (P1) |
| A pot changes kind mid-month | The month's figures recompute. Closed months keep their records |
| Bill closed and covered, Pay not ticked | Home shows it "covered" until the Pay tick, then the open bill |
| Partial refund of returns | £79.00 held, £47.00 refunded: £32.00 still expecting back |
| Refund after settle up | A normal refund: it moves back out of the Amex pot |
| Refund for a kept item | Today's refund flow |
| Discount that doesn't divide evenly | Largest-remainder pennies. The lines always add up to the charge |
| One person's pay is late | The household moves wait: "Waiting for Ben's £1,796.27" |
| A month already ticked under the old steps | It keeps them (P5) |
| The month ends before Sunday | This weekend is all of Left |
| Can we afford on a pot that's over | The buffer answer, with its check date |
| Bring-in with earlier-month rows | They're listed under their own month in To sort, and Close <Month> counts them as today |

## 8. Build

### Data model

- `PotTracking.kind?: 'tracked' | 'funded-only' | 'saving' | 'carries-over'`. It's stored when someone chooses; otherwise it comes from P2. Existing `pace` and `carriesOver` are still read, and a saved kind sets them to match. The Amex pot stays special: its card's set-aside pot has no kind.
- `SplitLine.expectingBack?: true`, `SplitLine.notComingBackAt?: string`, `SplitLine.originalPence?: number`.
- `TransactionSort.discount?: { pence: number; percent?: number }`.
- `CardTracker.accounts?: Record<string, { checkedBalance?: { pence: number; at: string } }>`, for the buffer (P9).
- `MonthRecord.summarySeenAt?: string` (P8).
- Payday tick keys `household:move:<potId>`. Fund keys (`<person>:fund:<account>`) are unchanged; the net transfer is one of them.

Everything is optional and validated like its neighbours, so older documents still load.

### Functions

| Module | Functions |
| --- | --- |
| `src/domain/potKinds.ts` | `potKind`, `savePotKind`, defaults (P2) |
| `src/domain/billSum.ts` | `billSum(document, statementKey)` → the parts and how In the Amex pot is known; `homeBill(document, today)` → the oldest unpaid bill, else the open one |
| `src/domain/potSum.ts` | `potSum(document, potId, month, today)` → Left, To sort, Waiting, Carried over, In the pot, Not explained, Spare; `weekFigures(row, today)` (P3); `typicalShop` (P4) |
| `src/domain/afford.ts` | `affordCheck(document, potId, pence, today)` → yes / behind pace / over with the buffer / funded only, plus the month line |
| `src/domain/personTransfers.ts` | Household moves (D6), net transfers (D7), steps by app (D8), what each step waits for (P6), and which layout a month uses (P5) |
| `src/domain/expectingBack.ts` | Held lines and totals per pot and per bill, matching refunds to them, `notComingBack` |
| `src/domain/cardSplits.ts` | `spreadDiscount` (D12) |
| `src/domain/bringIn.ts` | `importChanges(document, importId)`: what changed since the import before it, from `importedAt` |
| `src/domain/monthSummary.ts` | `monthSummary(document, month, today)` |
| `src/domain/homeInbox.ts` | The verdict, the to-do strip (top 3) and the new Home sections, replacing the three-figure strip |

### PRs

Eleven PRs, each squash-merged from fresh `main`, on branches named `health/<n>-<slug>`. **PRs 1 and 2 need to merge by Thu 26 Nov** for December's money (Ada's pay lands Fri 27 Nov). If they can't, they wait for January's (P5).

| # | Branch | What | Decisions |
| --- | --- | --- | --- |
| 1 | `health/1-payday-model` | Household moves, the net transfer, waiting (P6), the layout per month (P5), and the per-account totals test. `transfer-calculation-rules.md` gets a section and a worked example | D6, D7 |
| 2 | `health/2-payday-steps` | Steps by app, Start, tick copies the next, Undo toasts and waiting lines. Home's fund row and payday card show what's landed, the household total and per-person progress. The Done view | D8, D9, D10 (card) |
| 3 | `health/3-pot-kinds` | `potKind`, the choice in pot settings, Spending this month = Tracked, Month › Pots grouped by kind, Funded only rows, Close skipping Funded only and Saving, labels in the sort sheet, Plan's "unassigned" | D3, D4, D5 |
| 4 | `health/4-sums` | `billSum` and `potSum`, applied on Spending, the Amex pot page, Month's Amex row, settle up, pot balances and Check balances. Spare, worked out and checked labels, "Matches" only after a later check. The guard retires five phrases | D1, D2, D13 |
| 5 | `health/5-pot-pages` | The lead for each kind, This week and This weekend, a typical shop, Try an amount (`affordCheck`), Carried over by month, the last 3 months | D2, D3 |
| 6 | `health/6-home` | Home B: the verdict, header date, to-do strip and To do sheet (P10), pot cards, the Amex bill card, the Bills, Saving and Plan tiles, and the payday card's place on overlap days | D10, D14 |
| 7 | `health/7-bring-in` | The month's verdict in the Bring in result, the Just brought in card, earlier-month rows in To sort, refunds named | — |
| 8 | `health/8-afford` | The Can we afford… sheet from Home and pot pages, the buffer in Check balances (P9), the month line | — |
| 9 | `health/9-expecting-back` | The Back tick, held lines, the bill's fifth part, matching refunds, settle up, the Expecting back list, Not coming back, held lines on pot pages and in the Move sheet | D11 |
| 10 | `health/10-discounts` | Original prices, Add discount, the spread and the check against the charge | D12 |
| 11 | `health/11-month-summary` | "How did <Month> go?", leading Home (P8). After close, the Needs a look row goes once its cover is ticked | — |

### How every PR is done

Follow [card-tracker-build-plan §8](card-tracker-build-plan.md#how-every-pr-is-done):
- Domain unit tests for every edge case in §7, and component tests at the phone layout.
- Docs in the same PR:
  - the sums, the kinds and Expecting back in `card-tracker-rules.md`;
  - payday in `transfer-calculation-rules.md`;
  - Home, Month and the glossary in `product-design-spec.md`.
- `npm run check`.
- A visual check at 375×812 and 1440×900, against the baseline seed and the audit 4 moment states (day 10, day 20, day 25, the last 3 days and after close).
- `gh pr create`, wait for CI to list a run, watch it by PR number, and squash-merge only when every check passes.

### How we'll know it worked

| Moment | Taps today | Target |
| --- | --- | --- |
| Payday, Ben's half | 20, with 4 app switches | 9 (10 with a wait), with 2 |
| Day 20: this week's shop, a meal out | 0–2, plus sums in your head | 0: Home says it |
| Day 25: what a refund does | 3, and never stated | 0: Bring in and Home say it |
| Day 25: an order with returns and a code | 12 taps + 14 fields, prices worked out by hand, returns untracked | 17 taps + 15 fields, nothing worked out, returns held |
| Last 3 days: can we afford it? | Not possible before buying | 2 taps + an amount |

## 9. Setup on the live data (no code)

- **After PR 3:** check each pot's kind.
  - Groceries and Going out: Tracked.
  - Both personal Spending pots: Funded only.
  - Holidays: Saving, set by hand. Emergency: Saving.
  - Bills: Carries over.
- **After PR 8:** check Joint's buffer once in Check balances.
- **After PR 9:** mark any returns already sent back as Expecting back.

## 10. Risks

- **Payday moves real money.** PR 1 changes who moves what. The per-account totals test, and a dry run against December's plan before Fri 27 Nov, guard it.
- **November's figures change mid-month.** When PR 3 lands, Spending this month drops the personal pots. Home and Month say so once, with "Spending this month now counts Groceries and Going out".
- **"Not explained" will show on pots whose last check is old.** That's intended: it's the gap that "free" used to hide.
- **The verdict depends on bring-ins.** Its date is always beside it, and Home asks for a bring-in after 3 days, as today.
