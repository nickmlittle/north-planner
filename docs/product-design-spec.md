# North Planner: product, brand and interface specification

**Audience:** future developers, designers and coding agents. **Updated:** 11 November 2026.

This is the shared direction for new work and a description of the current interface. The financial contracts in [recurring and monthly budget rules](recurring-monthly-budget-rules.md) and [transfer calculation rules](transfer-calculation-rules.md) govern the detailed behavior. When changing behavior, update the relevant contract and this guide together. Where this guide says **Direction**, it describes a goal for future work, not a claim that every existing screen meets it.

## Purpose and product principles

North helps our household make a coherent recurring budget, understand how its members fund it, and work out where money needs to be allocated each month. It supports two frequent jobs: adjusting a plan as life changes, and checking the resulting funding and pot movements. The intended audience is our household; make common routines efficient and understandable for the people actually using them.

North should feel **calm, practical and reassuring**. It should be credible without feeling like a banking dashboard or a game. Favor a clear answer and a useful next action over decoration, persuasive messaging or unexplained numbers.

- **Make money legible.** Name the amount, person, destination and period; preserve pennies where they matter. Show the difference between what is planned, what is allocated and what remains.
- **Expose consequences before commitment.** Make the months affected by an edit and its financial impact visible before saving. Shared names, accounts, pots and categories can affect all months.
- **Be honest about uncertainty.** Mark incomplete allocations and save failures clearly. Transfer instructions are derived planning information; they are not proof of payment or an instruction to move money from a known source.
- **Support both overview and detail.** Put the immediate decision first; reveal contribution breakdowns, calculations and less common settings when needed. Keep the user's place when returning.
- **Fit the device and the task.** Desktop supports comparison across a wider workspace. Mobile prioritizes scanning, touch and one task at a time. Both must preserve the same underlying financial meaning.
- **Respect attention.** Use restrained surfaces and familiar controls; emphasize exceptional states with words as well as color. Do not add celebratory or alarming language to routine financial work.

## Product model and journeys

A household has a name and adults. Setup must be complete before using the budget. Income, categories, accounts and pots supply context for budget items; account ownership and the person funding an item are distinct. A new budget starts empty.

The selected calendar month resolves the applicable saved budget and income. An edit can affect the selected month and subsequent months up to the next relevant saved boundary. Earlier months remain editable. Plan and Month use the same resolved data. The dedicated rule documents define inheritance, rounding, incomplete allocations, migration and exceptions; do not reconstruct those rules from a screen.

1. **Set up:** name the household and adults, then add income and budget structure as needed. Clearly explain missing or invalid information and how to correct it.
2. **Plan:** choose a month, understand the budget balance and effective date, find items by browsing or searching, and add or edit them. Show affected months and any relevant impact before save, then give clear feedback.
3. **Understand funding:** inspect each person's position and destination totals. Account funding already includes its pot allocations; pot movements are subsequent allocations, not additional contributions. Explanations must preserve that distinction.
4. **Maintain shared structure:** manage accounts, pots and categories with clear all-month implications. Confirm consequential removal and explain dependencies.
5. **Recover:** communicate local/cloud save status and conflicts; make a failure visible and provide a clear next step. Do not imply that an unsaved change is safely stored.

## Visual identity

The interface is quiet and functional: deep pine navigation and primary actions, a warm cream canvas, soft off-white surfaces, muted green-gray secondary text, fine borders and modest rounding. All values are tokens in the `:root` block of `src/styles.css`; `styles.tokens.test.ts` keeps raw values out of every other rule and stylesheet, and `styles.contrast.test.ts` checks the combinations below.

New and touched code uses the **semantic tokens**. The palette names stay as their source values.

| Role | Semantic token | Palette token | Value |
| --- | --- | --- | --- |
| Page background | `--bg` | `--cream` | `#f3eedf` |
| Surface (cards) | `--surface` | `--card` | `#fbf8ef` |
| Sunken surface | `--surface-sunken` | `--surface-subtle` | `#f5f7f2` |
| Selected / subtle selection | `--surface-selected` | `--soft-fern` | `#e7e9dc` |
| Main text | `--text` | `--charcoal` | `#29312a` |
| Secondary text | `--text-muted` | `--muted` | `#59665a` |
| Primary, navigation, links, positive | `--accent`, `--positive` | `--pine` | `#203e32` |
| Divider | `--border` | `--line` | `#d6d2c3` |
| Field edge (inputs, selects, textareas) | `--border-field` | — | `#80887a` (3.2–3.7:1) |
| Over / error | `--critical`, `--critical-bg` | `--status-error`, `--status-error-bg` | `#a54232`, `#fbf0ed` |
| Pace / needs review | `--warning`, `--warning-bg` | `--status-review`, `--status-review-bg` | `#8a5a14`, `#fff3db` |
| Focus ring | `--focus` (`--focus-on-pine` on pine) | `--pine` (`--cream`) | |

Red marks only an amount that is over; amber only pace and needs-review. Never rely on colour alone: always a word too.

**Type.** Manrope (variable, 400–800) with system sans-serif fallbacks; tabular numerals everywhere. Sizes are `--text-xs` 12 (eyebrow labels, picker captions), `--text-sm` 13 (meta), `--text-md` 14 (body, rows, buttons), `--text-lg` 16 (section headings), `--text-xl` 20 (key figures) and `--text-2xl` 28 (page titles); the 42px display size is for the setup wizard only. **Three weights:** `--weight-regular` 400, `--weight-medium` 600 and `--weight-bold` 700. Only the `north.` wordmark may use 800. Use hierarchy, weight, whitespace and alignment to distinguish headings, labels and amounts, and don't treat the font download as a prerequisite for legibility. Small secondary copy must remain readable at enlarged text sizes.

**Space, size and shape.** Spacing is `--space-1` to `--space-7` (4, 8, 12, 16, 24, 32, 48). Inputs, selects and buttons share one height, `--control-h`: 36px on desktop and 44px (`--control-h-touch`) in the phone layout. List rows use `--row-h` (44px, 56px on phones). Radii are `--radius-sm` 4 (keys), `--radius-md` 8 (controls), `--radius-lg` 12 (cards) and pill. Use subtle shadows sparingly.

**Focus.** One ring everywhere: `outline: 2px solid` the focus colour with a 2px offset, or `-2px` inside rows and tables where an outside ring would clip. On pine surfaces (the sidebar, the phone header and tab bar) the ring is cream. Never remove an outline without a replacement; the only exceptions are elements focused by script (`h1`, the error summary, `tabindex="-1"` regions).

**Links and text buttons** are pine at the medium weight with no underline, underlined on hover. Destructive text actions keep the error colour.

Lucide line icons support labels and actions; icons alone require accessible names. The compact desktop sidebar can reveal the `north.` wordmark when expanded. There is no separate logo, illustration or photography system established here.

## Interface patterns

### Navigation and layout

The app has four destinations, **Home · Month · Plan · Spending**, plus **Settings** (audit 3, plan §2.1). Home is what to do; Month is the month's money (fund it, watch it, close it); Plan is the budget; Spending is the card. Opening the app lands on Home; a link that names a screen goes straight there. Every older link still works and is rewritten in place to today's form (`view=home|month|plan|spending|settings`, with `month`, `section` for Spending's tab or a Settings area, `pot` and `close` on Month, `statement` on Spending, and `planDestination` on Plan): Transfers opens Month, This month opens Month (a pot or Close <Month> included), Rules and Household open Settings. The browser tab names the screen and, where the screen follows the selected month, the month: “Month · November 2026 · North”, “Groceries · November 2026 · North”, “October statement · North”. Each screen has exactly one h1.

Desktop uses a pine sidebar with the four destinations and Settings at its foot, above the account and save status. It starts expanded (216 px, icon and label) on windows 1280 px and wider and collapsed (icons, with the name on hover) below; its toggle overrides that, remembered on the device. Spending shows how many transactions are left to sort (a count when expanded, a dot when collapsed). Its viewport-oriented shell gives the page body or bounded workspace regions control of scrolling, with sticky context where useful. Page titles and essential controls belong in the page header; modal content must scroll independently.

Mobile uses a pine header and labeled bottom navigation for Home, Month, Plan and Spending (four 48 px targets at 375 px). Month, Plan and Home share the selected month. The right-most button in the header is always the account button (“Account and settings”), which opens a sheet with Settings, save status and Sign out; it shows a status mark only when there is something to know (saving, unsaved, a version to choose, or a failure), never for Saved. A page's own ⋯ (Plan's options) sits to its left. A save failure also appears visibly on the page. Editing flows take priority over persistent navigation. The mobile layout applies at widths up to 767 px and also to short, coarse-pointer landscape screens covered by the existing media query. Other component-specific breakpoints exist; do not assume one breakpoint governs every layout.

Home shows a one-time, dismissible note after the move: “Transfers is now Payday, on Month. Household is in Settings.”

**Direction:** Keep the primary content reachable above safe areas and persistent controls, allow page scrolling on short screens, and avoid horizontal overflow or clipping at narrow widths and increased text sizes. Preserve logical focus and browser Back/Forward behavior when changing navigation.

### Home

Home answers “where do we stand, and what do we do next?” in one screen. Its header is the month (“November”; the h1 reads “Home, November”), a stage chip (“In progress · 19 days left”) and today’s date (“Wednesday 11 November”). No actions: Home’s action is its first task. Everything below comes from `domain/homeInbox.ts`, which maps `homeMonths()` and the payday plans into rows and doesn’t recompute stage, settle or pace rules.

**Strip.** Three figures in one card (stacked rows on phones; each opens its screen): **Plan** (“£1,141.87 over” in red, “£X left” or “Balanced”, with each person’s figure below), **Spent this month** (“£272.59 of £5,262.33”, with the pot furthest ahead of pace, or “On track”), and the card (“Amex · £649.23 this statement”, “£312.85 set aside · closes Tue 24 Nov”). Without a card, only Plan shows. On a first run it says “Nothing planned for November yet”, and To do holds “Plan November”.

**To do.** One list holds every task type, in this order: settle a closed statement (“Settle the October statement · All 12 sorted · matches Amex’s summary · £646.88 · due Wed 18 Nov”) or bring in its final export; close an ended month (“Close October · Groceries £88.58 over · 3 pots with money left”, chip “Ended 31 Oct”); fund the month (“Fund November · Ada 0 of 9 · Ben 0 of 9 · 18 steps”, with a small bar per person and “1 changed since ticked”; next month joins a week before its money arrives, or once a step is ticked); “Sort 4 Amex transactions”; “Set aside in the Amex pot”; “Bring in Amex transactions” once the last bring-in is 3 or more days old; “Bring the plan back to Available” (the only red row, opening Plan on the person furthest over); and accounts that need review. **Heads-up** rows follow: pots ahead of pace or over (“Groceries is £62 ahead of pace · At this rate it runs out around Fri 20 Nov · £143.57 left”). The count beside To do, and on Home in the nav, is every row, heads-ups included. A statement that hasn’t closed is never a task. With nothing to do: “Nothing to do. You’re set for November. Next: Ada’s pay arrives Fri 27 Nov.”

**Coming up** (beside To do from 1100px, below it on phones) lists the next 45 days by date: statement close dates (“£649.23 so far”, or “Tomorrow”), each salary’s payday (“Ada’s pay arrives · December’s money”), due dates of open statements, and next month’s budget only when it changes. **Done** lists finished steps struck through (“All October transactions sorted”, “November funded”). The one-time “Transfers is now Payday…” note sits above the strip until dismissed.

### Month

Month gathers the month's money in one place (it replaces Transfers and Spending › This month). Its header is the month title (‹ November 2026 ⌄ ›) with a stage chip: “In progress · 19 days left”, “Money arrives Fri 27 Nov” or “Funding · 3 of 18” before the month starts, “Closing · ended Sat 31 Oct”, then “To settle” and “Settled”. Its actions are Check balances (in ⋯ on phones) and ⋯: “Funding by account” (phones), “How funding is worked out” (a Sheet explaining shares, account funding and pot moves) and “Plan for this month”. There's no primary action while the month is in progress. The sections follow the month's stage: **Payday** comes first while any step is unticked or the month hasn't started. Once every step is ticked, **Pots** comes first and Payday folds to one line after it (“Payday · 18 of 18 done · last ticked Fri 30 Oct”), which expands on click. A pot's page and Close <Month> take the sections' place.

#### Payday

The section heading counts the steps (“Payday · 0 of 18 done”). On desktop its aside holds a one-time hint (“Click an amount to copy it”, gone after the first copy) and a **Steps | By account** switch. On phones it holds the person switch (“Ada 0/9 | Ben 0/9 | Both”, ✓ when done), remembered per device; it starts on Both, and the count follows the person shown.

Steps puts one card per person side by side from 1100px (stacked below that). Each card head has three lines: the name with “0 of 9 · 4 to fund · 5 moves”; a progress meter; and “£4,429.66 from £4,000.00 available”, followed when over by “· **£429.66 over** · Review on Plan” (red text, no box) and by “· 1 changed since ticked · send £50.00 more” when a step changed. Under Both, everyone's lines show. A band per account follows (“Monzo Joint”, aside “Joint · 26 items ›”, where the items link opens Plan filtered to that account and Back to Month returns to the same band). Each band holds its funding step, then the pot moves out of it, indented.

Every money move in the app (payday, setting aside, settling up, covering an overspend) uses the same step row. Each step has a circle to tick once the money has moved, and its amount is the copy button: it copies the plain number (“2215.45”) and briefly confirms “Copied £2,215.45”. A step whose amount changed after it was ticked keeps its tick but shows the difference (“Changed since ticked: you sent £959.00, it's now £1,009.00. Send £50.00 more.”); its amount reads “+£50.00” and copies just that, and ticking accepts the new amount. Tick rules are in [transfer-calculation-rules](transfer-calculation-rules.md#ticking-off-steps). Captions name cross-person dependencies (“Includes £436.70 from Ben”, “Ada moves it into Spending”). Accounts that need review have their steps withheld and are listed at the end with any known amounts, “Not calculated” where there are none, and the reason.

By account shows the Funding by account table, which compares people and destinations, including account totals, direct allocations and pots. With no items: “Nothing to fund yet. Add items on the Plan and each person's payday steps appear here.” with Open Plan. Ticks record what people did; they never change the plan, and the app doesn't verify payments. The standing caveat under the section is “Planned amounts, not payments.” with an ⓘ.

Zero and unresolved allocations are different states. Do not imply that a missing calculation is a completed zero. Show warnings and the route to fix missing input near the affected information. The payday steps show planned funding and movements, ticked off by hand; not payment execution or automatic-payment detection.

#### Pots

The **Pots** section heading says what's spent (“Pots · £272.59 spent of £5,262.33”), and on desktop its aside says when balances were last checked (“Checked against Monzo Sat 31 Oct”, or “Not checked yet”). On desktop it's one table: Pot · Spent · Planned · Left · Pace · In Monzo, with band rows for Joint, each adult and Accounts (one-offs). The Pace cell holds a meter of spent against planned, with a tick where even spending would be, and a status line: “On track”, “£63 ahead · runs out ~Fri 20 Nov” (warning), “£12.50 over · covered when November closes” (critical), “No pace”, plus “£35.00 taken by October” after a next-month cover. Carry-over pots read “Bills · carries over” with Left as “£1,185.02 free”. The set-aside pot reads “Amex · set aside · £336.38 still to move for November”. In Monzo is the worked-out balance, or “—”. Paced pots with a plan always show; others show once something is spent, and “3 more pots with nothing spent ›” shows the rest. On phones each group is a card with three lines a pot: the name and “£143.57 left” (or “£12.50 over”, “£1,185.02 free”), the meter, and the status. Each pot's name opens its page. With nothing planned or spent: “No pot spending yet. Bring in Amex transactions to see each pot against the plan.” with Open Spending.

A **pot's page** (`pot`) has a breadcrumb (“Month › Groceries”), its title and “Joint · monthly · November 2026 · day 12 of 30”, Check against Monzo, and ⋯ › Pot settings (Settings › Accounts & pots). Its sections are:
- **Lead card:** “Left this month · £143.57 for 18 days” and “About £8 a day · you've averaged £15”, then the chart of spending so far against the planned pace (with an accessible description of the same figures). One warning line under the chart says when it runs out: “At this rate it runs out around Fri 20 Nov, 10 days before the month ends.”
- **Balance:** one line (“In Monzo £609.75 · £244.05 free · checked Sat 31 Oct”), with “How it's worked out” folding the sums.
- **Transactions:** rows with “Sun 8 Nov · Ada ··41001”, “on December statement” when the statement is another month's, and the amount.

The sort sheet shows “£181.40 left” (or “£12.50 over”) beside each planned pot.

**Carry-over pots** (Bills) lead with **Free in the pot** and how it's worked out: “In Monzo · checked Mon 9 Nov”, the moves since, one “Waiting to settle · October statement” line per unsettled statement, and the Free total. “Check against Monzo” (the pot's bank) asks “What's in Bills now?”. “Annual costs from the Plan” lists the pot's yearly items (“Car insurance £612.00 a year”). The **Amex pot** page is titled “Amex pot”, “Pays the Amex from the November statement”, with its balance line and **Statements it pays** (“November statement · £312.85 moved in · £336.38 still to move · £649.23”).

#### Stages and Close <Month>

**Month stages** show as the header's chip (see Month). An ended month that isn't closed is its own close checklist, in order, with **Close October** as the header's primary action. The button is disabled while anything is waiting, with the reason in its title and on a line below the header (“Waiting for late October transactions to post.”). The sections are:
- **Waiting** (only while not ready): “4 transactions to sort” with Sort them, or “Last brought in Mon 2 Nov · Late October transactions can take a few days to post.” with Bring in transactions and “All October transactions are in”.
- **Cover overspends · 1:** each overspent pot is a step row with its amount to copy (“Move from Monzo Joint into Groceries · £88.58”, or “Out of Treats, then into Eating out”). Its caption reads “Groceries · Monzo Joint is £88.58 over · covered from Monzo Joint ▾”, an inline choice of the buffer, pots with money left (“Holidays · £1,406.36 left”) or “November's Groceries (moves no money)”; that last one adds “Leaves Groceries £88.58 short in November.”
- **Money left · stays in the pot:** a table of Pot, Left and Built up. A pot past its limit gets “Move £100.00…” (records the move) and Keep it, and the line “Car has built up £180.00, more than £160.00 (2× its £80.00 monthly plan). Move some?”
- **Carry-over pots:** what's free in each.

Then Pots, then Payday. `close=1` (Home's “Close October”) scrolls to and focuses these sections. Once closed, the chip reads “To settle · closed Thu 3 Dec” and the sections fold to one line (“October closed · Tue 3 Nov · 1 cover · 3 pots with money left”) that expands. A closed month whose spending has changed says “Changed since closed: Groceries · Monzo Joint £500.00 → £511.80.” with Close again in the header.

### Plan

Present the selected month and whether its budget is saved or inherited near the top. The scope of an edit is shown where it is saved.

**Figures.** One card, figure first, with no headline sentence. Desktop is one 84px row: “Plan”, the household balance (“£1,141.87 over”, “£X left” or “Balanced”; red only when over) and “£7,641.87 planned of £6,500.00”; then one bar per person (their Planned of their Available, a hatched end for the part their Available doesn't cover) with their own figure (“£429.66 over” in red, or “£X left”); then “Available £4,000.00 + £2,500.00”, the basis when it isn't all salary (“£6,000.00 salary + £500.00 other”), **Edit income** and, when someone is over, **Review Ben's items** (the Plan filtered to that person's accounts, their groups open). With one adult, one bar and the share (“· 25%”). On phones it's two lines, “£1,141.87 over” and “£7,641.87 of £6,500.00”, then a thin bar per person with their figure, and the two links. The docked mini meter on phones shows the worst figure and a thin bar per person.

**Toolbar.** One row above the table: **Search items** (<kbd>/</kbd>; × or Esc clears it), **Category | Destination**, **Filter** (a sheet with Owner and Category; “Filter · 1” when one is on), the active filters as removable chips with Clear filters, then the count (“40 items”, or “26 items · £3,767.72” while searching or narrowed) and **Collapse all** / **Expand all**. Search and Filter appear from five items. Arriving from Month's “26 items ›”, a “← Back to Month” link and a removable “Monzo Joint ×” chip lead the toolbar. On phones it's search, a Filter icon button and +; the sheet also holds Group by and Expand all.

**Table.** Item · Share of plan · Monthly, with a 40px band per group (“▾ Home · 7 items”, its share and total) and 44px rows (name, then “Equal split · Groceries · Monzo Joint”). Groups start open on desktop and closed on phones; opening and closing is remembered for the session, so a new session opens them again on desktop. The amount is plain text; the pencil and ⋯ (Duplicate, Remove) appear on hover and focus (always on touch). Fixed amounts show a lock: “Fixed amounts: edit in the item”. Groups have a second level: by Category, whose account the money goes to (Joint accounts, then each adult's, then any needing an owner); by Destination, each account's Direct items and then each pot. A level with only one entry is skipped, so the items show directly. The second level is a heading with its subtotal (and share on desktop), not another disclosure, so a phone never needs a third tap. Search results stay flat. A Total row ends the table.

**Editing an amount in place.** Click the amount: it becomes a 120px field with its text selected, and one line under the row reads “Changes November 2026–February 2027 · Plan £1,141.87 over → £1,166.40 over · Ada +£12.26 · Ben +£12.27”, updated as you type, with **↵ Save**, **Esc Cancel** and **⇧↵ Open editor** (the full editor with the typed amount). Leaving the row without Enter cancels. A save confirms in a toast, “Groceries saved”, with **View affected Payday steps** when the change moves money.

Search matches item names, categories, owners and destination account/provider/type/pot text. Owner, category and destination filters constrain matches where available. A nonblank search shows direct matching rows with context. Clearing returns to the prior browsing context and focus; search and filters persist while switching mounted views but reset on reload. Keep item editing and amounts discoverable in both browse and search states.

**The item editor.** Adding and editing use one short form in a Sheet (“Add item” or “Edit item”, with the month under the title; full height on phones), in the order people think: **Name** (focused on open); **Amount** and **Every** (Month or Year, with the monthly equivalent for a yearly amount); **Goes to**, up to five chips for the destinations this month's items use most (this device's last-used first, the selected one filled), then **Other…** for the full picker (owner › account › pot, and creating an account or pot inline; on a first run with no accounts it reads **Add an account…**); then **Category** and **Funding** side by side, with the funding-specific fields (one person, fixed amounts, relative weights) under them and one muted line of the split (“Ada £9.23 · Ben £5.77”). Adding remembers this device's last destination, category and funding. The footer states the scope and the plan balance before → after, with Funding changes folded. Adding offers **⌘↵ Add and start another**, which adds the item, keeps Goes to, Category and Funding, clears Name and Amount and confirms in a toast (“Netflix added”); Add item is off until something is entered. Editing has Duplicate (a new item, “Netflix (copy)”) and Remove item (which confirms with its impact). Errors sit under their field, and the first one takes focus. Leaving with unsaved changes asks “Discard this item?”.

### Spending

The card tracker, built in the `card/` PR series from the [build plan](card-tracker-build-plan.md); behaviour is in [card-tracker-rules](card-tracker-rules.md).

**Spending** (`view=spending`, with `section` for its tab) is the card's own workspace. Its header is the card's name (“Amex”) with the open statement as context (“November statement £649.23 · closes Tue 24 Nov · £312.85 in the Amex pot”), ⋯ (Add a transaction, Sorting rules and Card settings in Settings) and one primary action, **Bring in** (<kbd>I</kbd>; an icon button on phones). Three tabs follow on every layout: **To sort** (with its count), **Transactions** and **Statements** (with a “1 to settle” badge when a closed statement is ready). Without a card it's an empty state, “Add your card first”, with Set up a card. **To sort** lists purchases and refunds with no pot or account yet, newest first; its heading's aside says “Brought in Mon 9 Nov · sorted to 8 Nov”. Payments never appear there. Empty, it's “Nothing to sort. Bring in the Excel export from Amex to start.” with Bring in, or “Everything is sorted.” once there are transactions. This month moved to Month, and Rules to Settings.

**Bring in** is a dialog: “Download the Excel version of your transactions from Amex online, then choose the file here.” and one Choose the Excel file button (`.xlsx` only). Afterwards it names the file and statement (“15 transactions · 25 Oct – 24 Nov statement”), four counts (Already here, New, Sorted by your rules, To sort), and the summary check: “All 15 transactions match Amex's summary”, or what's missing (“£12.34 of charges in Amex's summary aren't in this file…”). It asks “Whose card ends 41009?” for an unknown ending, offers to change the card's closing day when the period ends on another day, and notes a final export. It ends with “Sort N transactions” (or Done) and “Bring in another file”. A file that isn't the Excel export gets “This doesn't look like an Amex Excel export. Download the Excel version of your transactions.”

**Add a transaction** is a dialog with Date, Description, Amount, “It's a refund” and Whose card. Its statement comes from its date.

**Sorting.** On phones each To sort row is the tap target (“TRAIN TICKETS ONLINE · Sun 8 Nov · Ada · Suggested: Spending · Starling Ada · £112.81 ›”, or “refund of £89.97”); it opens the **sort sheet**: the amount and “Sun 8 Nov · Ada ··41001”, then up to six suggestions as one-tap buttons (“Treats · Starling Ada” with “Suggested · Used last time”, the cardholder's own pots as “Ada's card”, joint pots, the joint account as “One-offs”, and the buffer), “All pots and accounts” (grouped like Plan, with a filter), and “Move back to To sort” for one already sorted. Above the suggestions, “Always put GREEN GROCER in this pot” makes a rule from the tap, with editable Matching text and “Only on Ada's card”; it also sorts anything else waiting that matches. A transaction sorted by a rule says “Sorted by your rule “GREEN GROCER”.” and offers “Change the rule too”. Under To sort, **Sorted by rules · N · Check** is a disclosure listing the rule sorts nobody has checked (each shows its pot and a Rule tag), and “They all look right” clears them. **Transactions** lists everything except payments, grouped by the month it happened (newest first), and any row can be sorted again. A toolbar leads: **Search transactions** (<kbd>/</kbd>), which matches the merchant, where it went, the card ending, the person and the amount (“62.40”); **Filter**, a sheet of checkbox groups (Pot or account, grouped like the sort sheet; Person; Statement; Status: To sort, Sorted by rule, Moved to the set-aside pot, Split, Refund), any value within a group and every group together; a muted count (“26 transactions · £1,450.64”); and Clear when anything is on. Active filters show as removable chips. On desktop it's one table, Date · Merchant · Card · Amount · Pot or account · Tags, with a band per month (“November 2026 · 14 transactions · £…”): the refund or purchase link sits under the merchant, a split shows “Split · 2 pots” with its lines as indented sub-rows, To sort is a warning chip, and the tags are Rule, Moved (or Changed since moved) and Refund. Rows take focus; ↑/↓ move and Enter (or a click) opens the sort sheet. On phones it's month headings over list rows (“Sun 8 Nov · Ada · Groceries · Monzo Joint”, the amount and tags on the right, split lines beneath), with Filter as an icon button. With no matches: “No transactions match “groc” with these filters” and Clear filters; with nothing brought in: “Nothing brought in yet” and Bring in.

**Splits.** “Split across pots” in the sort sheet (“Change the split” for one already split) opens the split editor: the amount and card, then By amount or Receipt items. By amount lists lines (Pot or account, Amount, an optional Note) with Add a line, plus Half each and “Split by your 60/40 funding share” shortcuts that put each person's part in one of their own pots, for them to change. Receipt items lists typed items (Item, Amount, Pot or account) and an Everything else line that takes the rest, with where it goes. A live line says “Left to place £12.81” (by amount) or the items' total, a By pot list totals the lines, and Save split (or “Save 3 items”) only works when the lines add up. A split row in a list says “Split · 2 pots” (or “Split · 3 ways” when an account is one of them) with its lines beneath: “Spending · Starling Ada · Kettle £34.99”.

**Refunds and payments.** A refund's sort sheet names its purchase (“Matches BOOK NOOK £30.00 on 20 Oct. It counts in November, the month it arrived.”) and leads with where the purchase went (“Suggested · Where the purchase went”); it has no Always. For a split purchase it asks “Which part came back?”, listing each line (item name, “Exact match” where the amount matches, the pot and amount) and “Spread across the split · In proportion to each line”. Rows show the link both ways: “Refund of COSTCO £186.40 · 24 Oct” and “Refunded −£14.99 · 6 Nov”. A refund matched on import shows under Sorted by rules with a Refund tag. Payments to Amex are listed apart at the foot of Transactions, folded (“Payments to Amex · never sorted”), never in To sort.

**Statements** (a tab on both layouts) lists each statement newest first as a row: its name by the month it closes in (“November statement”), “25 Oct – 24 Nov · due Sat 19 Dec”, its total, and a chip for where it is: “Open · closes Tue 24 Nov”, “3 to sort”, “Needs the final export”, “Ready to settle · due Sat 19 Dec” (warnings), “4 of 10 done” or “Settled Mon 23 Nov”. With none: “No statements yet” with Bring in.

A **statement's page** (`statement`) has a breadcrumb back to the list (focus returns to its row), its title with the state chip, “25 Sep – 24 Oct · due Wed 18 Nov”, and ⋯ with “Bring in the final export” and “Settle without the final export” when that applies. A summary card says “To Amex by Wed 18 Nov · £646.88”, the checks as chips (“✓ All 12 sorted”, “✓ Matches Amex's summary”, “✓ Final export in”, or warnings such as “4 to sort” or “£12.34 of charges missing”), and, once there are steps, “0 of 8 done” with a meter. Until it can be settled, **Before you can settle up** lists what it's waiting for: “4 transactions to sort” (Sort them), “Closes Tue 24 Nov”, “Bring in the final export” (Bring it in, Settle without it), with the Amex pot “£312.85 of £649.23 is in the Amex pot · £140.59 sorted and still to move” (Set aside), and any payment Amex shows.

Once it's ready, the **Settle up** steps are on the page itself. One card per account (“Starling Ada · Ada”, “Monzo Joint · Either of you”, side by side on wide screens) holds the payday step rows, pot moves indented: a tick circle, “Out of Treats”, “Into Car”, “Send to Monzo Joint”, the amount to tap and copy, “Ticked Wed 18 Nov”, and “Changed since ticked: it was £186.75, it's now £176.75. £10.00 less is needed.” The paying account's card comes last, with “Pay Amex from Monzo Joint” (tinted), “Includes £95.00 of one-offs already in Monzo Joint”, and, when Amex shows a matching payment, “Amex shows a payment of £350.00 on 8 Nov” with “Tick Pay Amex”. From the Amex pot it starts with “Move the rest to the Amex pot” and pays from the pot. When every step is ticked the chip reads Settled and the steps fold to one line (“Settle up · 8 of 8 done”). Underneath, two disclosures stay closed until opened: “Which months it counts in” (“October £646.88”) and “Shares by account” (“Starling Ada £27.39 · …”, with each pot's share and “One-offs, already in Monzo Joint”).

**Set aside** is the last step of sorting. Whenever sorted spending hasn't been moved into the Amex pot yet, a **Set aside in the Amex pot** section follows To sort (or leads the tab once nothing is left to sort): “£140.59 · 3 transactions sorted since Fri 6 Nov”, with “What it covers”. On desktop it lists the moves to copy, banded by account and side by side (“Out of Spending £58.20”, “Send to Monzo Joint £58.20”, “Into Amex £140.59”), then two secondary buttons: “Not all of it” opens the checklist sheet to untick what hasn't moved yet, and “Mark £140.59 moved” records it with Undo. On phones it's one card with “Review and mark moved”, which opens the sheet.

**Desktop To sort** (board 7) is a full-width table built for the keyboard: Date, Merchant (with a refund's “Matches … £89.97, 2 Nov”), Card, Amount, “Pot or account” (preset to the suggestion, with a “Suggested” or “Same as purchase” chip), Always and Split. There's no Place column: Enter places the focused row, and for the mouse the hovered or focused row shows a ✓ beside its pot (“Place TRAIN TICKETS ONLINE in Spending · Starling Ada”). Clicking a row's date or merchant focuses it. <kbd>J</kbd>/<kbd>K</kbd> (or ↑/↓) move between rows, / jumps to the pot list, A ticks Always, S opens the split editor, and focus moves to the next row once one is placed. The keys sit in the table's footer, beside “Sorted by rules · 15 · Check”. There's no side rail; Month and Statements hold that. Settle up lays its account cards out in columns, like desktop Payday.

**Pot settings** sit in Settings › Accounts & pots, in each pot's editor: “Carries over from month to month”, “Show pace (for steady spending like groceries)” and “Flag a build-up over (months' worth)”, default 2.

### Settings

Settings (at the sidebar foot, <kbd>G</kbd> <kbd>,</kbd>; from the account button on phones) holds everything that sets the budget up, one section per area: **Household**, **Pay & income**, **Accounts & pots**, **Categories**, **Cards**, **Sorting rules** and **Account & sync**. On desktop a section nav sits on the left (each item with a muted count: “4 · 7” accounts and pots, “2” rules), and the right shows one section at a time; `section` in the URL names it and reload keeps it. With no `section`, desktop shows Household. On phones Settings is a list of the sections, each with a summary (“Ada, Ben”, “1 card”, “2 rules”); a section is its own page with a breadcrumb (“Settings › Cards”) and the browser’s Back returns. Editors open in the shared Sheet. Until the household is set up, Settings shows only Household. Spending’s ⋯ links to Sorting rules and Card settings.

**Household.** The household name saves on blur or Enter, with a “Saved” toast; a blank name or adult is flagged in place. Each adult is a name field with a remove button (“Remove Ada”), which confirms and explains that anyone who owns an account, has income or pays a fixed amount can’t be removed until that is reassigned. “+ Add an adult” adds a row.

**Pay & income.** The month is the section’s context (‹ November 2026 ›, from the app’s month), because amounts change from a month on. Each source is a row: “Ada · Salary”, “£4,000.00 a month · paid on the 28th (or the working day before)”, with Edit under ⋯. The editor (a Sheet) has the amount for that month with its scope (“Changes apply: December 2026 onward.”; £0 stops a source) and, for salary, the payday, which every month shares. “Add income source” adds a recurring source from the month shown (“New income applies: …”). Income changes never create a budget date. With none: “No income yet”, and Add income source. Plan’s ⋯ “Edit income”, the meter’s pencil, first-run “Add income” and Payday’s “Edit income” all open this section for the month in view.

**Accounts & pots.** “Shared by every month.” One list, ordered by owner (Joint, then each adult, then any needing an owner): each account (“Monzo Joint”, “Monzo · Current account · Joint”, or a “Needs owner” chip; “4 pots”) with its pots under it, indented. A pot’s meta says its settings in words (“Monthly · shows pace · flags over 2 months’ worth”, “Carries over”, “Set-aside pot · pays Amex from the November statement”), and its balance shows when it’s known (“£609.75 in Monzo”). Edit opens the account form or the pot form (name, parent account, and Spending: carries over, show pace, build-up limit) in a Sheet. “Add pot” adds a pot to one or several accounts at once and skips any that already have it. Plan’s ⋯ “Accounts, pots & categories” opens this section.

**Categories.** How Plan groups items: each category with its item count for the month (“7 items in November”), Rename under ⋯, and “Add category”. Names are unique, ignoring case.

**Cards.** One row per card: “Closes on the 24th · due 25 days later · paid from Monzo Joint · Ada ··41001 · Ben ··41009”, with Edit under ⋯ (and Remove while the card has no transactions or statements). “Add a card” is below the list; with none, “No cards yet”. The form, in a Sheet, asks for the name (Amex), the statement closing day and the days until payment is due, both required with no defaults, and previews the result (“Statements run from the 25th to the 24th. The 24 Nov statement is due 19 Dec.”). Paid from defaults to the joint account and the buffer to its main balance. “Whose card is whose” maps each card ending to an adult. Without any accounts it asks for one first.

**Sorting rules.** “The first rule that matches sorts a transaction.” Each rule is a row in plain text (“GREEN GROCER” → Groceries · Monzo Joint, “Only Ben ··41009 · Sorted 3 transactions”) with Edit (in a Sheet), Move up, Move down and Delete under ⋯; <kbd>⌥↑</kbd> and <kbd>⌥↓</kbd> move the row that has focus. Delete confirms. With none: “No sorting rules yet”, and how to make one.

**Account & sync.** The save status and any warning, the signed-in email and Sign out; signed out (this device only), “Saved on this device”.

### Controls, overlays and feedback

Use a filled pine primary button for the main action, outlined secondary buttons for alternatives, and restrained text actions for lower-priority operations. Form controls need persistent labels, clear validation, and visible focus. Tables and grouped lists should expose their hierarchy and totals rather than rely on color alone. Use disclosures for secondary detail without hiding critical warnings.

Dialogs and sheets need an accessible title, keyboard containment, Escape/close behavior, background isolation, independent scrolling and focus restoration. Preserve context when returning from detail. Status changes, validation and failures should be announced appropriately and remain understandable without color or icons. Ensure tap targets are comfortably usable; the mobile navigation is designed around at least 48 px targets and common controls around 44 px, but existing controls should be checked rather than assumed compliant.

#### Keyboard

North can be driven from the keyboard, as an enhancement: every action stays clickable. One registry (`src/state/shortcuts.ts`) owns one `keydown` listener; a screen registers its keys while it is mounted. Nothing fires while typing in a field, during IME composition, or while a dialog is open (Escape still closes it), and a key a component has already handled (To sort's table keys) is left alone. The first Tab on every screen is “Skip to content”.

| Keys | Does |
| --- | --- |
| G then H, M, P, S or , | Go to Home, Month, Plan, Spending or Settings (the second key within a second; “G …” shows while it waits) |
| / | Focus the page's search (Plan) |
| N | The page's new thing: Add item (Plan), Add a transaction (Spending) |
| I | Bring in transactions (Spending) |
| [ and ] | Previous and next month (Month, Plan) |
| ⌘\ (Ctrl+\ elsewhere) | Show or hide the sidebar |
| ⌘K (Ctrl+K elsewhere) | Search North: jump to any screen, item, pot, statement, month or transaction, or run an action |
| ? | Keyboard shortcuts: everything this page offers |

Hints show where there is a hovering pointer and room: “G M” beside sidebar items without a count, N on Add item, I on Bring in, / in Plan's search. Phones show none.

**Search North (⌘K).** Also the sidebar's **Search** (⌘K hint) and, on phones, a search icon in Home's header. A panel near the top on desktop (full height on phones) with “Search North…” focused: results in groups, at most six each and thirty in all: **Go to** (every screen and Settings section), **Actions** (Add item, Bring in transactions, Add a transaction, Previous and Next month, Keyboard shortcuts, with their keys), **Items** (“Groceries · £325.47 · Home · Groceries · Monzo Joint”, opening Plan with the row focused and its group open), **Pots** (the pot page), **Statements** (“October statement · £646.88 · Ready to settle”), **Months** (six back, two ahead) and **Transactions** (from three letters; Transactions searching that merchant). Word prefixes rank above substrings, then initials; an amount (“325”) matches items and transactions; groups order by their best match. An empty query shows **Recent** (the last five run), then Go to and Actions. ↑/↓ move, ↵ runs, Esc closes and focus returns. An action does what its button does: on its own page in place, else on the way there (Add item from Home opens Plan with the editor up). The input is a combobox over a listbox, with the active option announced.

**Lists.** Every list moves and acts the same way (`src/state/useListNavigation.tsx`). A list is one Tab stop, landing on the last row you were on (else the first); the controls inside a row leave the Tab order because the keys reach them. J or ↓ and K or ↑ move, Home and End jump, ↵ opens, Esc leaves to the list, and the focused row shows the selected surface with an accent bar. Each key clicks the row's own visible control, so nothing is keyboard-only. A visually hidden sentence names the keys once on entering the list, ? lists them while the list is on screen, and desktop headings show them as keys (“J K move · ↵ open”).

| List | ↵ | Also |
| --- | --- | --- |
| Home › To do | Open the task | |
| Plan › items | Edit the item | E edit the amount in place, D duplicate, Delete remove (asks first) |
| Month › Payday steps (every person's, in order) | | X tick or untick (accepts a change), C copy the amount |
| Month › Pots | Open the pot | |
| Month › Cover overspends | | X, C |
| Spending › To sort | Place it | / pot, A always, S split (its own table keys) |
| Spending › Set-aside moves | | C |
| Spending › Transactions | Open the sort sheet | |
| Spending › Statements, and a statement's Settle up steps | Open the statement | X, C on steps |
| Settings › sections | Open the section | |

### Language

Use plain, concise British English and familiar household finance terms. Label actions with verbs (“Edit income”, “Add item”) and name amounts with the glossary below. Explain scope in calendar months. State what needs attention and how to resolve it without blame. Avoid implying a payment has happened or that an account owner necessarily funds every item.

Name a destination one way everywhere it is shown (Plan rows, the item editor, the payday steps): the pot, then the account's short name, as in “Bills · Monzo Joint”. The short name is the account's nickname, or else bank and owner; `shortAccountLabels` in `budgetLabels` is the one place it is built. Pickers and Manage, which choose between accounts, keep the fuller bank · type labels.

Keep text to what changes a decision: the scope and impact above Save, real warnings, and empty states. Don't explain what a label or number already says, and don't repeat a caveat that is already on the screen. Put secondary detail behind one ⓘ.

#### Glossary

These four words are the only names for these concepts in the UI. `src/copy.vocabulary.test.ts` fails CI on the retired ones.

| Word | Means | Not |
| --- | --- | --- |
| **Available** | Income for the month, for the household or for one person. | Available income, available money |
| **Planned** | The total of the month's items. The balance against Available reads “£X left”, “£X over” or “Balanced”. | Planned budget, Budget balance, remaining, left to allocate, shortfall |
| **Funding** / **Fund** | What one person pays into one account, including its pots. A fixed-rule item has **Fixed amounts**, and its remainder is “unassigned”. | Funding total, contributions, allocations, Transfers by destination |
| **Move** | Money moved from an account into one of its pots. It is already inside the account's funding. Money leaving a pot is “Out of <pot>”, and account to account is “Send to <account>”. | Pot movements as an extra amount, “Ada moves” for a funding total |

The screens are named **Home**, **Month** (its sections **Payday** and **Pots**), **Plan**, **Spending** and **Settings**. “Transfers” is retired as a screen name (it was Month's payday steps until audit 3 PR 06); keep it only in historical notes and in “Funding by account”.

The card tracker (Spending) adds these words. Its rules are in [card-tracker-rules](card-tracker-rules.md).

| Word | Means | Not |
| --- | --- | --- |
| **Spending** | The tab where card spending is brought in, sorted and settled. | Card tracker, Transactions |
| **Spent** | Card spend sorted to a pot or account in a month: “£338.60 of £520.00 spent”. | Used, actual |
| **Left** | Planned minus Spent for a pot: “£181.40 left”. Negative is “£12.50 over”. | Remaining, balance |
| **Bring in** | Import the Amex Excel export: “Bring in transactions”, “Last brought in Mon 9 Nov”. | Upload, sync |
| **Sort** / **To sort** / **Sorted** | Give a transaction a pot or account. “Sorted by rules”. | Assign, categorise |
| **Split** | A transaction with more than one line. | |
| **Pace** | “On track”, “£131 ahead of pace”, “Runs out around Thu 19 Nov”. | Burn rate |
| **Close <Month>** | The month-end step: cover overspends, note leftovers. | Finalise, lock |
| **Settle up** | Paying a statement. Steps: “Out of Treats”, “Send to Joint Monzo”, “Pay Amex”. | Pay off |
| **Built up** | The leftover total in a monthly pot. | Surplus, savings |
| **Free** | A carry-over pot's balance minus card spend not yet settled. | Available (that is income) |
| **Set aside** | Moving what was sorted since the last move into the card's pot, so the statement is covered when it comes: “Set aside in the Amex pot”, “Mark moved”. | Reserve, ring-fence |

**Tone.** Lead with the figure, not the person: “£1,141.87 over”, “Ada £429.66 over”, “Groceries · Monzo Joint £40 ahead of pace”, never “You're both over” or “Ada is over”. A finished section folds to its count (“Payday · 18 of 18 done”) instead of congratulating. Verbs name actions. Nothing says “fits”, “left” or “up to date” when nothing is planned. Empty lists use one EmptyState where the content would be: what's missing, one sentence, one action. A failed save is a critical Notice under the page header on every screen (“Your changes aren't saved. Check your connection, then try again.” with Try again and Details); loading shows the page's skeleton.

## Review checklist for future changes

- Does the change help one of the household's real tasks and preserve the distinction between plan, funding and payment?
- Are selected month, effective range, ownership and calculation uncertainty clear where relevant?
- Have desktop and mobile flows, empty and populated states, long labels, large amounts, errors and save status been considered?
- Are keyboard focus, accessible names, contrast, touch targets, zoom, safe areas and dialog/back behavior usable?
- Have the rule contracts, this specification and meaningful automated tests been updated when behavior changes?

## Observations and follow-up opportunities

**Current review:** desktop Safari was visually inspected with the repository's synthetic 40-item household on an isolated local origin, including setup and the populated Budget workspace. Mobile Plan and Transfers were visually inspected in an existing iPhone 17 simulator session; its existing local data was not altered, and the separate synthetic origin could not be loaded reliably through the simulator controls. The mobile presentation was cross-checked against the current source and earlier fixture-based reviews. This is not a physical-device, screen-reader, full interaction or multi-width audit; not every editor, state or screen was visually exercised in this pass.

**Recommendations, not shipped requirements:**

- Consolidate layered CSS overrides and define consistent semantic tokens for status, typography and controls, checking contrast and current screenshots before changing the look.
- Test narrow phones, short landscape, larger text, on-screen keyboards and physical safe areas. Earlier reviews identified potential long-value clipping and an iOS category picker opening on editor entry; recheck whether they still occur.
- Review the desktop Transfers comparison and mobile transfer explanation for scanability with real household tasks. Preserve access to precise breakdowns and the existing calculation semantics.
- Validate focus, screen-reader announcements and recovery from save conflicts across both layouts. Prioritize observed friction over a broad redesign.
