# Amex pot check: build plan

**Status:** agreed with Nick on 15 November 2026. Figures here are made up. The contract for what ships is the "Checking the Amex pot" section of [card-tracker-rules.md](card-tracker-rules.md).

North could already set money aside in an Amex pot (#138–#141): the Move sheet records which transactions have moved, each pot's balance falls and the Amex pot's rises. But nothing said what the Amex pot *should* hold. Check balances only compared the bank with North's own running total, and saving the bank's figure folded any difference into the new starting point, so extra money was absorbed, not explained. This plan adds that check.

## Decisions

| # | Question | Answer | What it means for North |
| --- | --- | --- | --- |
| R1 | How is money moved? | One total per pot into the Amex pot, from a spreadsheet | The Move sheet gives the same per-pot totals, so the spreadsheet can retire |
| R2 | Moved before a purchase reaches North? | Sometimes; that stops | Only what's in North is moved, so Should hold is exact. Early moves show as extra until they arrive |
| R3 | Where does extra go? | Joint's buffer | The card's Buffer for overspends (Q1) |
| R4 | Where's the Amex pot? | Monzo Joint | Joint pots move within Monzo Joint; the Move sheet adds Send to Monzo Joint for personal pots |
| R5 | The statement before the switch? | Already paid | The set-aside setting starts with the open statement |
| Q1 | Extra: the buffer, or a separate setting? | The card's buffer | One setting: `bufferDestination`, else the pay-from account's main balance |
| Q2 | Ignore a small gap? | No | Exact to the penny |
| Q3 | Offer Top up when short? | Yes | Under "make the missing transfer and check again" |
| Q4 | Nudge to check the Amex pot? | No | It's checked whenever balances are checked |
| Q5 | Repo copy? | Yes | This document, with made-up figures |

## The check

- **Should hold** = what has moved in for every statement paid from the pot without a Pay tick. North works it out from the moves themselves, never from a balance check.
- **Holds** = the Amex pot's balance: the last check plus every move and payment since.
- **Gap** = Holds − Should hold. It needs a check: before the first one, the pot page asks for one.

Every move and payment North records shifts both figures together, so the gap only changes with something North doesn't know about: a transfer that wasn't made, a rounded-up transfer, an early move, a top-up, a fee.

| Gap | North says | What you can do |
| --- | --- | --- |
| £0 | Matches | Nothing |
| More | £42.10 extra | **Move £42.10 to Monzo Joint** (the card's buffer): a step with a copyable amount; recording it evens the pot up |
| Less | £31.85 short | See the recent moves, each with Undo. Make the missing transfer and check again, or **Top up £31.85 from Monzo Joint** |

**Example.** £1,850.00 has moved in for November and Monzo shows £1,892.10: £42.10 extra. Once it's moved to the buffer, the pot holds £1,850.00 and matches. When November is paid, Should hold drops by what moved in for it and Holds by what was paid; any difference shows as extra or short.

## Screens

| Where | Today | With the check |
| --- | --- | --- |
| Amex pot page (Month › Amex) | Balance line, then Statements it pays | A lead block: Should hold, In Monzo, the gap. With extra, the steps to move it and **Moved**, with Undo. Short lists the recent moves. Unchecked asks for a check |
| Check balances | "North: £X · checked …", then "£X more than North worked out" | The Amex row reads "Should hold £1,850.00". Typing says Matches, "£42.10 extra" or "£31.85 short". It warns when something is still to move. Saving says "The Amex pot has £42.10 extra" with **Open Amex pot** |
| Settle up (a statement paid from the pot) | Move the rest, then Pay Amex from the Amex pot | Above Pay: "The Amex pot covers the £2,262.60 bill", or "£51.85 short of the bill: top up before you pay". Money already moved for the next statement doesn't count |
| Month › Pots, the Amex row | "£X still to move for November" or "All moved in" | "£42.10 extra" or "£31.85 short" takes over the status when there's a gap |
| Home | "Set aside in the Amex pot" with the amount | Also "Move £42.10 extra out of the Amex pot" or "The Amex pot is £31.85 short", opening the pot page |

## Edge cases

| Case | What happens | Design |
| --- | --- | --- |
| Moved in the bank, checked, then pressed Moved | North counts the transfer twice and shows false extra | Check balances warns on the Amex row when anything is still to move |
| Bill paid, Pay not ticked | The paid statement still counts in Should hold, so the pot reads short | Short lists the closed statement with no Pay tick, with a link to it |
| Paid more than moved in (unsorted items, fees) | Short by the difference after paying | Settle up's coverage line warns before you pay |
| Moved early, before the purchase reached North | Extra until it arrives | The extra message says to leave it. When it arrives, tick only it, press Moved, make no transfer. The pot it came from is off by that amount until its next check |
| Refund | The Move sheet already moves it back out of the Amex pot; Should hold drops with it | No change. A refund left in the pot becomes extra once the bill is paid |
| Re-sort or split after moving | The Move sheet moves only the difference between pots | No change |
| Purchase sorted to the Amex pot itself | Paid from what's in the pot: Should hold rises, Holds doesn't | No change |
| A personal pot's transfer marked Moved but not made | Short | The recent moves show each account's part |
| Money left in the pot from before the switch | Extra at the first check | Move it to the buffer |

## Build

**Data model.** `CardTracker.gapMoves?: GapMove[]`, where `GapMove = { id, cardId, at, pence, destination }`: positive is extra moved out to the destination, negative a top-up from it. Validated like `moves`; Undo removes the record. Should hold comes from `moves` and the statements' Pay ticks; Holds stays `potBalance`, which gains a `gap` flow.

**Functions** (`src/domain/setAsideCheck.ts`, its own module because `potBalances.ts` already imports `setAside.ts`): `shouldHold`, `setAsideCheck` (state, gap, still to move, closed statements with no Pay tick, recent moves), `gapDestination`, `gapSteps`, `recordGapMove`, `undoGapMove`, `billCover`.

| PR | Branch | What |
| --- | --- | --- |
| C1 | `amex-check/1-model` | The model and functions above, the `gap` flow and its labels, validation, this plan and the rules section, unit tests for every edge case |
| C2 | `amex-check/2-pot-page` | The Amex pot page's lead block in all four states, the extra and top-up steps with Undo, recent moves, the closed-statement and early-move hints, the Amex row's status on Month |
| C3 | `amex-check/3-everywhere` | The Check balances row, settle up's coverage line, Home's tasks |

**Checks:** jsdom page tests, the copy vocabulary guard ("short" is fine; "shortfall" and "outstanding" are retired), a Playwright capture of each state at both sizes, and CI green before each squash-merge.
