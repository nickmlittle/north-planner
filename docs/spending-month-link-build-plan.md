# Spending ↔ Month link: design and PR build plan

Status: planned, 15 November 2026, with Nick. PR 1 (`link/1-links`) is built; [card-tracker-rules](card-tracker-rules.md#links-between-spending-and-month) tracks what has shipped. Read this in full before starting any PR in it. Where it disagrees with the design canvas, this document wins.

- **Design canvas** (private to the owner): https://claude.ai/artifact/B98PWR9ZRecPSKRsEk55BF. Boards D1, D2, D4, M1, M2 and M3 are the source for this plan. The canvas was drawn for "lines" on an account; read "line" there as "pot" (decision L1).
- **Working doc** (private to the owner): https://claude.ai/artifact/QUKqHuCUVd9oaRKWmr33bx. It holds the household setup checklist with real figures.
- **Figures in this document are examples.** They show the shape of the copy, not the household's real numbers.
- **Related rules:** [card-tracker-rules](card-tracker-rules.md) (Spent, Left, pace, pot balances, Home), [recurring-bills-rules](recurring-bills-rules.md), [product-design-spec](product-design-spec.md) (layout, language, glossary).

---

## 1. What we're building

The goal: "you're spending too much on groceries" is obvious both where you sort a transaction and where you check the month.

Today that doesn't happen. Groceries and Going out are planned to the Monzo Joint account's main balance, not to a pot. `monthSpending` gives an account destination no Planned figure, so Month shows them only inside "Monzo Joint · one-offs", with no plan and no pace. Spending and Month also don't link to each other: Spending's `onOpenMonth` has been unused since audit 3, Month's account rows don't open, and a pot page's transactions lead nowhere.

The fix comes in two parts:

1. **Setup, no code (§2).** Groceries and Going out become real Monzo pots in Joint, and the Joint "Spending" pot stays for discretionary spend (Amazon, B&M). Pots already get pace, a Month row, a Home heads-up, the pot page chart and "£X left" in the phone sort sheet. That alone gives the groceries warning.
2. **Five PRs (§5)** that link Spending and Month both ways, on desktop and phone.

Pace counts the Amex only, because the Monzo Joint card is barely used. Personal Going out isn't tracked.

## 2. Before the build: household setup

This is done once, in the app and in Monzo, with no code. It starts in **November 2026** (decision L2). The exact checklist, with real amounts, is in the working doc.

1. **Monzo:** create Groceries and Going out pots in Monzo Joint.
2. **Settings › Accounts and pots:** add both pots under Monzo Joint, with "carries over" off so pace is steady.
3. **Plan, from November 2026:** point Groceries and Going out at their new pots, and add a Discretionary item to the Spending pot at £0 (decision L3). Month › Payday then shows two new pot moves to tick. Monzo Joint's funding step doesn't change, because the pots sit inside the account.
4. **Settings › Rules:** point the Tesco store rule at Groceries, and add TESCO STORES → Groceries and LIDL → Groceries. Rules sort only new transactions (`addRule` skips sorted ones).
5. **Spending, by hand:** reopen November's Monzo Joint transactions in the sort sheet and move them. Tesco and Lidl go to Groceries; Amazon and B&M go to the Spending pot. The sort sheet already re-sorts a sorted transaction, so nothing is built for this.
6. **Monzo, then Payday:** move the money into the new pots (Groceries less anything already moved to the Amex pot for those shops), then tick both moves.
7. **Move to the Amex pot:** re-sorted transactions show the difference (`setAside`). What already moved comes back to Monzo Joint, and the full amount is due from Groceries.
8. **Check balances:** enter the new pots from Monzo, so North starts from the real figures.

## 3. Design rules

Five rules keep Spending and Month telling one story. Every PR below is checked against them.

1. **Say what pace can see.** Wherever pace shows, say how fresh it is ("Amex sorted to Fri 13 Nov") and what's still waiting ("3 to sort").
2. **Every figure opens its transactions.** A pot's Spent on Month leads to those transactions in Spending. A transaction's pot leads to that pot's page on Month.
3. **Show pace where you decide.** The pot picker shows Left and pace for each pot, and what placing the transaction would change, before you place it.
4. **Same words on both sides.** "£110 ahead", "runs out ~Fri 20 Nov" and "£150.00 over" come from one helper. Today Month, the pot page and Home each word pace separately.
5. **Same features on desktop and phone.** Only the layout differs: strips and tables on desktop, cards and sheets on the phone.

## 4. Features

Six features, each on desktop and phone. The canvas boards each one comes from are in brackets.

### F1 · Links both ways (D1, D2, M1)

- **Spending → Month:** a transaction's pot is a link to that pot's page, for the transaction's month. Desktop: the Pot or account cell. Phone: "Open Groceries in Month" in the sort sheet once it's placed. (As built: a phone row is one button, so the link can't sit inside it.)
- **Month → Spending:** each transaction on a pot page opens in Spending › Transactions with that row in focus. "See in Spending" (the Transactions section's aside and the pot page's ⋯) opens Transactions filtered to that pot. An account row ("Monzo Joint · one-offs") opens Transactions filtered to that account.
- **Links survive Back:** both ways use the same history entries as the rest of the app, so Back returns to the row you came from.

### F2 · Freshness line (D1, M3)

Month says how fresh its figures are, and links to what's waiting.

- **Desktop:** beside "Pots": "Amex sorted to Fri 13 Nov · 3 to sort ›", next to the existing "Checked against Monzo Fri 13 Nov".
- **Phone:** the same words as a chip under the month title in the pine header.
- **Pot page:** the same line under the pace chart, so a Groceries figure never looks more complete than it is.

### F3 · Needs a look first (D2, M3, D4)

Pots that are ahead of pace or over lead the page, each with a reason.

- **Reason line:** "Mostly Tesco £300.00" when one merchant is at least 50% of Spent, else "Biggest: HOTEL £350.00" (decision L4). It comes from F4's merchant breakdown.
- **Desktop Month:** a strip of cards above the table: name, "£110 ahead", bar, reason, run-out date. The table itself is unchanged.
- **Phone Month:** a "Needs a look" section above the groups. Those pots aren't repeated in their group below (decision L5).
- **Home:** heads-up rows gain the reason as their second line.
- **Spending header:** "November so far" chips ("Groceries £110 ahead") that open the pot page.

### F4 · Where it went (D2, M1)

The pot page shows spending by merchant, so "it's Tesco" is visible at a glance.

- **Merchant name:** grouped by brand, so TESCO STORES and TESCO STORE 1234 ANYTOWN are both "Tesco". It builds on the existing `merchantKey` and `defaultRuleText`, plus a short alias list (AMZNMKTPLACE and AMAZON.CO.UK → Amazon).
- **Both sizes:** up to five bars, then "Other". Tapping a bar filters the transactions list below it.
- **Pace chart:** marks the amount expected by today ("£210 by today"), so the gap to £320.00 reads as the £110.

### F5 · Pace in the pot picker (D4, M2)

Sorting shows the consequence before you commit.

- **Options:** each pot shows Left and pace ("£130.00 left · £110 ahead", "£20.00 left · £150 ahead", "£150.00 over"). The phone sort sheet already shows "£X left", so this adds pace. On desktop the native select gets the same text after the pot name (decision L6).
- **Impact line:** once a pot is chosen and before it's placed: "Groceries: On track → £110 ahead · runs out ~Fri 20 Nov". Phone: above the Place button. Desktop: under the row, while it's focused.
- **Toast after placing:** only when a pot tips into ahead or over: "Groceries is now £110 ahead of pace", with Open Groceries and Undo.

### F6 · Sorts itself here (D2, M1)

The pot page lists the rules that send transactions to it, and suggests new ones.

- **Rules:** each single-pot rule pointing here, such as "TESCO STORE 1234 · your rule", linking to Settings › Rules.
- **Suggestions:** a merchant sorted here by hand 2 or more times with no rule gets "Make rule" (decision L7). It uses the existing `addRule` with `defaultRuleText`, and says how many existing transactions it also sorted.
- **Both sizes:** a short list at the foot of the pot page.

## 5. PR series

Five PRs on `link/<n>-<slug>` branches, in this order. Each one is squash-merged only when all its checks pass. PR 3 needs PR 2's merchant breakdown, and PR 4 reuses PR 3's pace wording.

| # | Branch | Delivers | Main files | Tests | Size |
| --- | --- | --- | --- | --- | --- |
| 1 | `link/1-links` | F1 links both ways, F2 freshness line | `state/navigation.ts` (a `transaction` param, and pot or account filters through history state), `App.tsx` (wire `onOpenMonth`, add `onOpenTransactions`), `Spending.tsx`, `TransactionsTable.tsx`, `SpendingMonth.tsx`, `month/PotsSection.tsx`, `MonthPage.tsx` | URL round-trip; Transactions opens filtered and focused; the account row opens Spending; the freshness text and its 0-to-sort case | M |
| 2 | `link/2-where-it-went` | F4 merchant bars, plus the "by today" marker on the chart | new `domain/merchants.ts` (`brandOf`, `merchantBreakdown`), `SpendingMonth.tsx`, `PotPage.css` | brand cases (both Tesco forms, Amazon aliases, B&M); totals match Spent with splits and refunds | S |
| 3 | `link/3-needs-a-look` | F3 on Month, Home and the Spending header, plus shared pace wording | new `pages/paceLabels.ts`, `domain/cardSpending.ts` (`needsALook` with its reason), new `month/NeedsALook.tsx`, `homeInbox.ts`, `Spending.tsx` | the 50% reason threshold; phone groups don't repeat these pots; Home's second line; one wording across screens | M |
| 4 | `link/4-sort-pace` | F5 pace in the picker, the impact line and the toast | `domain/cardSpending.ts` (`paceIfPlaced`), `SortSheet.tsx`, `SortTable.tsx`, `useToast` | impact for on track → ahead, → over, no plan, carry-over pots and refunds; the toast only when a pot tips | M |
| 5 | `link/5-pot-rules` | F6 rules and suggestions on the pot page | `domain/cardSorting.ts` (`rulesFor`, `ruleSuggestions`), `SpendingMonth.tsx` | the 2-or-more threshold; split rules left out; "also sorted N" message | S |

The rules doc, [card-tracker-rules](card-tracker-rules.md), gets a short "Links between Spending and Month" section in PR 1. Each later PR adds to it.

## 6. Copy

These are the exact strings, with example figures. They avoid the retired phrases in `copy.vocabulary.test.ts`: "Needs a look" is fine, "needs care" is retired.

| Where | Copy |
| --- | --- |
| Freshness line (F2) | Amex sorted to Fri 13 Nov · 3 to sort › — with nothing waiting: Amex sorted to Fri 13 Nov · all sorted — before any bring-in: Amex not brought in yet |
| Pot link in Spending (F1) | Groceries (screen-reader label: Open Groceries in Month) |
| Pot page action (F1) | See in Spending |
| Account row label (F1) | See Monzo Joint one-offs in Spending |
| Needs a look heading and reason (F3) | Needs a look · Mostly Tesco £300.00 — or, when no merchant is half: Biggest: HOTEL £350.00 |
| Pace status, everywhere | £110 ahead · runs out ~Fri 20 Nov — £150.00 over · covered when November closes — On track |
| Spending header chips (F3) | November so far: Groceries £110 ahead · Holidays £150 ahead · Treats · 2 over |
| Pot page sections (F4, F6) | Where it went · Other · £210 by today · Sorts itself here · Your rule · Make rule |
| Picker option suffix (F5) | £130.00 left · £110 ahead — £150.00 over — nothing planned |
| Impact line (F5) | Groceries: On track → £110 ahead · runs out ~Fri 20 Nov — for a pot with no plan: Spending has nothing planned in November |
| Toast after placing (F5) | Groceries is now £110 ahead of pace · Open Groceries · Undo |
| Rule suggestion (F6) | TESCO STORES · sorted here 2 times · Make rule → Rule added. It also sorted 1 more. |

## 7. Testing and checks

Every PR ships with tests for its domain helpers and screens, and a before-and-after screenshot at both sizes.

- **Domain tests:** use the synthetic baseline fixture, never real exports, and pass `today` explicitly, because pace and `potBalance` depend on it.
- **Screen tests:** jsdom has no `matchMedia`, so component tests render the phone layout. Desktop-only layout (the Needs a look strip, the select text) is checked by screenshot.
- **Local check:** `npx eslint . --ignore-pattern 'docs/audit-3/**' --max-warnings 0 && npm test && npm run build`. `npm run check` trips on the untracked audit helpers.
- **Screenshots:** the local-only dev server on :5174, seeded from `scripts/baseline-seed.html`, captured at 390 px and 1440 px with the Playwright helper.
- **Copy guard:** `copy.vocabulary.test.ts` runs in CI and catches retired phrases.
- **Live check after the setup:** read-only on the live site. Groceries has its own row, Home's heads-up names Tesco, and a Tesco transaction links to the Groceries page.
- **Merging:** never stage `docs/` wholesale, and merge only when `gh pr checks` all pass.

## 8. Not in this plan

These canvas options are left out. Real pots make some of them unnecessary; the rest are bigger changes for later.

| Option | Why it's out |
| --- | --- |
| Spending lines on an account (A1) | Real Monzo pots do the same job with no new idea in North. |
| Monzo Joint card capture: add by hand, bring in, check-in, Apple Pay (B1–B4) | The Monzo Joint card is barely used. |
| One-off re-sort when pots arrive (D4's pass) | November's few Monzo Joint transactions are moved by hand in the existing sort sheet (§2 step 5). |
| Month split view (D2 layout) | Its parts (Needs a look, Where it went, rules) arrive on the pot page instead. Revisit if the pot page feels like a dead end. |
| A By pot tab in Spending (D3, M5) | It would show pace in two places. Revisit once F1 to F3 have been used for a month. |
| Pace for personal Going out | Not tracked, by choice. |

## 9. Decisions

Agreed with Nick on 14 and 15 November 2026. The canvas column names the board each answer was checked against.

| # | Question | Decision | Canvas |
| --- | --- | --- | --- |
| L1 | Lines on an account, or real pots? | Real Monzo pots: Groceries and Going out in Joint; the Spending pot stays for discretionary spend. | A1, A2 |
| L2 | When do the new pots start? | Now, in November 2026. November's transactions are moved by hand; D4's one-off pass isn't built. | D4 |
| L3 | Discretionary amount | No figure yet: £0 in the Spending pot, so it shows "nothing planned". Set one after a full month. | M3 |
| L4 | Reason line | "Mostly [merchant] £X" when one merchant is at least 50% of Spent, else "Biggest: [merchant] £X". | M3, D2 |
| L5 | Phone Needs a look | Top only. A pot in Needs a look isn't repeated in its group. | M3 |
| L6 | Desktop pot picker | The native select, with Left and pace in each option's text. A custom list like D4's would add about a PR. | D4 |
| L7 | Rule suggestions | "Make rule" after 2 hand-sorts of the same merchant into a pot. | D2, M1 |
