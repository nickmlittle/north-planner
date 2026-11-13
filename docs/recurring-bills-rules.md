# Recurring bills rules

**Status:** agreed with Nick on 13 November 2026. Being built in the `bills/1`–`bills/5` PR series from the [build plan](recurring-bills-build-plan.md), which holds the full design, the algorithms (§5) and the screens (§6). This document is the contract for what has shipped; keep it current with each PR. Where they disagree, the build plan's decisions (B1–B8, P1–P4) win until this document is updated with Nick.

Related: [card tracker rules](card-tracker-rules.md) (Spent, Left, pace, pot balances, Home), [recurring monthly budget rules](recurring-monthly-budget-rules.md) (snapshots and edit scope), [product design spec](product-design-spec.md) (layout, language, glossary).

## What has shipped

| Part | PR | Code |
| --- | --- | --- |
| The item's recurring bill, validation, drafts, the editor section, the card-removal warning, fixture bills | 1 | `RecurringBill` in `src/domain/monthlyBudget.ts`, `readBillDraft` in `budgetItemDrafts.ts`, `src/domain/recurringBills.ts`, `src/pages/RecurringBillFields.tsx`, `CardSettings.tsx` |
| Spent, Due, pace and pot balances, Due on Month › Pots | 2 | `monthBills`, `potBillTotals` in `src/domain/recurringBills.ts`; `monthSpending` in `cardSpending.ts`; `potFlows`, `potBalance` in `potBalances.ts`; `src/pages/month/PotsSection.tsx` |
| The pot page: This month, Bills this month, Yearly bills set aside here | 3 | `nextRenewal`, `yearlyBillsFor` in `recurringBills.ts`; `src/pages/PotBills.tsx`, `SpendingMonth.tsx`, `billLabels.ts` |
| Plan › Dates | 4 | not started |
| Home and the Renewal sheet | 5 | not started |

## The contract

1. **A plan item can be a recurring bill** (B1). The item editor has a "Recurring bill" checkbox, off by default. Unticked items behave exactly as before. There's no visible "Not a bill" option.
2. **Paid by** is **Direct debit** or **Card** (B1). Card asks which card: each card North tracks (Amex), or **Another card**, which covers a Monzo virtual or debit card (B2).
3. **Assumed or seen** (B3). A direct debit, or a payment on another card, is assumed paid on its day at the planned amount. A bill on a tracked card is never assumed: its charge comes in through Bring in and Sort, and its date is only for Due and reminders.
4. **Dates** (B4). A monthly bill has a day: 1st–28th, or **Last day**. A yearly bill has a day and a month, and that date is its **renewal date**. There are no 29th–31st days, and weekends and bank holidays are ignored.
5. **Renewal reminders** (B6) default to **4 weeks** before, set per item: 2, 4, 6 or 8 weeks, or off. *(Shown on Home from PR 5.)*
6. **Bills to an account** are listed by date but add nothing to Spending figures or balances (P2).
7. **Yearly bills need a pot that carries over** (P3). The editor warns when the pot doesn't; saving is still allowed.
8. **Left keeps its meaning** (P1): Planned − Spent − Taken. Due is shown as a part of it: “£256.54 left · £172.00 of it due”.
9. **Pace allows for bills** (P4).

P1, P2 and P4 were confirmed by Nick on 13 November 2026.

## The item

A bill's details live on the item (`BudgetItem.bill`), so they follow the snapshot rules: an edit from November applies from November onward, as the editor's scope line says, and closed months keep their own snapshots.

```ts
type BillDay = number | 'last'            // 1–28, or the month's last day
interface RecurringBill {
  paidBy: 'direct-debit' | 'card'
  cardId?: string                         // card only; absent means Another card
  day: BillDay
  month?: number                          // yearly items only, 1–12: the renewal month
  remindWeeks?: 0 | 2 | 4 | 6 | 8         // yearly items only; absent means 4
}
```

A document is invalid when a bill has:
- a day other than 1–28 or `'last'`;
- no month on a yearly item, or a month on a monthly one;
- a reminder on a monthly item, or one other than 0, 2, 4, 6 or 8;
- a card id when it isn't paid by card, or an empty card id.

Older documents have no `bill` and load unchanged, with no version bump.

**Which card is tracked.** A card is tracked when its id is in `card.cards`. A `cardId` that no longer matches a card counts as Another card, so its bill is assumed. The editor opens such a bill with Another card chosen. Removing a card in Settings › Cards names the bills paid on it, in any month, and says North will assume them paid on their day.

## A month's bills

`monthBills(document, month, today)` lists the month's bills from that month's own plan, sorted by date, then name:
- **Date:** a monthly bill on its day, or the month's last day (the 28th or 29th in February). A yearly bill only in its renewal month.
- **Amount:** a monthly bill's amount; a yearly bill's full yearly price.
- **Tracked:** paid by card, on a card in `card.cards`.
- **State:** **Paid** when the date is on or before today, else **Due**. Every bill in a past month is paid, and every bill in a future month is due. A bill added mid-month whose day has passed shows as paid.

## Spent, Due and pace

In `monthSpending`, for each pot:
- **Spent** also includes its bills that are paid and not tracked (`billsPaidPence`). Bills to an account are left out.
- **Due** (`duePence`) is the pot's bills not out yet, tracked or not. A tracked bill leaves Due on its day, whether or not its charge has been sorted yet, so for a few days it can be in neither.
- **Left** is unchanged: Planned − Spent − Taken.
- **A pot with any bill in the month shows**, even at £0 spent.
- **Pace**, in a steady pot in the current month:
  - expected = the bills dated on or before today + (Planned − all this month's bills) × day ÷ days in month. Bills here are tracked and untracked; Planned − bills never goes below 0.
  - "Runs out" uses only the spending that isn't an assumed bill, (Spent − assumed bills + Taken) ÷ day, against Planned − all this month's bills.
  - The pot's chart counts assumed bills on their day.
- The sort sheet's “£X left” (`leftByDestination`) is unchanged.

**Month › Pots** adds “£30.00 of it due” to a monthly pot's status, and “£154.17 due this month” to a carry-over pot's (in place of “No pace”).

## The pot page

For a pot with bills in the month (boards 3–4):
- **This month** (carry-over pots): Planned · Spent · Left tiles. Spent says what it's made of, “£234.82 direct debits and cards, on their day · £19.99 sorted from Amex”, and Left has “£154.17 of it due” under it (P1). A monthly pot keeps its lead card and adds the same line under it: “£30.00 of it due · £181.90 sorted from Amex”.
- **Bills this month**: every bill by date, with how it's paid (“Direct debit”, “Card · Amex”, “Card”), the amount and its status: **Paid**, **Via Amex** (muted: listed for its date only), or **Due tomorrow**, **Due in 5 days** within a week, else **Due 22 Nov**. In the current month a **Today · Fri 13 Nov** line sits before the first bill still to come. Desktop is a table; phones list each bill with its day, name and how it's paid, then the amount and status. A note under it says Amex bills come in when you sort the statement.
- **Yearly bills set aside here** replaces “Annual costs from the Plan”: every yearly item to the pot, soonest renewal first, with “Renews 6 Dec · Card · Amex” (or “No renewal date”), the monthly set-aside and the yearly price.

## Pot balances

- **Bills paid** (flow `'bills'`): each untracked bill to a pot, in any month, takes its amount off the balance at the **start of its day** (local midnight). A balance checked on a bill's day already includes it, since direct debits go out early in the morning. Only bills after the check count, as for every flow, from the check's month to today.
- **Free** = balance − card spend waiting − this month's untracked bills still due (`billsDuePence`). Money about to leave isn't free.
- “How it's worked out” shows “Bills paid since” and “Bills still due this month”.

## The item editor

Below Funding, a bordered section: the **Recurring bill** checkbox, described as "Comes out on a set date, like council tax, insurance or a subscription." Ticked, it shows:

- **Paid by**, a two-option switch: Direct debit · Card.
- **Card** (Card only, when North tracks a card): each tracked card, "Amex (tracked in Spending)", then "Another card". Choosing Card picks the first tracked card.
- Monthly: **Comes out on**, "Choose a day", 1st–28th, Last day.
- Yearly: **Renews on**, a day (1–28, Last day) and a month, then **Remind me** (2, 4, 6 or 8 weeks before, or Don't remind me; 4 by default).
- One line of what North will do, once the date is chosen:
  - assumed, to a pot: "North marks £52.13 as paid from Bills on the 3rd each month." or "… on 3 March, and reminds you 6 weeks before.";
  - assumed, to an account: "North lists £144.82 from Monzo Joint on the 15th each month.";
  - tracked: "You'll sort the charge from the Amex statement as usual. The date only shows it as Due until then." Yearly: "The date is for the Due list and your reminder."
- The P3 warning for a yearly bill whose pot doesn't carry over: "Bills that renew yearly need a pot that carries over. Turn on Carries over for Groceries in Settings › Accounts & pots."

Saving with no day says "Choose the day it comes out." (or "Choose the day it renews."). A yearly bill with no month says "Choose the month it renews." The first error takes focus.

The fields are kept while the box is unticked or the frequency changes, and only what applies is saved. Switching a yearly bill to monthly drops its month and reminder. Switching a monthly bill to yearly keeps the day and asks for the month. **Add and start another** starts the next item unticked. **Duplicate** copies the bill.

## Baseline fixture

`scripts/baseline-fixture.mjs` gives the Bills pot (which carries over) the canvas's bills. Three Bills items are renamed for them, and the yearly ones keep their monthly amount, so the plan's totals don't change. The amounts are the fixture's made-up ones.

| Item | Paid by | Date |
| --- | --- | --- |
| Council tax | Direct debit | 1st |
| Streamflix (was Gas) | Amex | 2nd |
| Water | Direct debit | 5th |
| Mobile plans | Another card | 9th |
| Electricity | Direct debit | 18th |
| Broadband | Direct debit | 22nd |
| Breakdown cover (was Fuel) | Amex | 6 Dec, remind 4 weeks |
| Home insurance | Direct debit | 12 Jan, remind 4 weeks |
| Car insurance | Direct debit | 3 Mar, remind 6 weeks |
| TV licence (was Rail tickets) | Direct debit | 1 Apr, remind 2 weeks |

Never use real exports or real bill amounts.
