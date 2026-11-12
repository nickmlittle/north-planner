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

With a card set up, Home also has **month cards** (below the per-person summary, above To do): the current month (“November”, chips “In progress · 18 days left”, “Funded” or “Funding · 3 of 8”, “Sorted to 10 Nov”, “2 pots need care”; “£939.48 of £1,420.00 spent”; a row per pot needing care, “Groceries · Monzo Joint is £131 ahead of pace · At this rate it runs out around Thu 19 Nov” or “… is £12.50 over · Covered when November closes”, which opens the pot; “Bring in Amex transactions · Last done Mon 9 Nov” once the last bring-in is 3 or more days old; “Statement closes tomorrow” the day before; “Bring in the final October statement” once a statement has closed without it). Each past month that isn't settled gets a checklist card (“October · Closing”: All transactions in and sorted, Close October with “Groceries £88.58 over · 3 pots with money left”, and “Settle the October statement · £646.88 by Wed 18 Nov” for each statement holding its transactions). Next month's card says “December · money arrives Fri 27 Nov · Mon 30 Nov” from each salary's payday, becomes “Funding · 3 of 8” with “Finish December's payday steps” once a step is ticked, and says “January's money has arrived early. It's for January, which starts on 1 Jan.” when a step is ticked more than 3 days before the earliest payday. The last settled month folds to “October · settled Mon 23 Nov” until the month after it settles.

Home is this month at a glance: “This month” over the month as its title, then the per-person summary from Plan (“November plan”), with “Review Immy's items” (Plan filtered to that person's accounts) and Open Plan. Desktop adds Open Month and Open Plan beside the title. Below the summary, a pine “You're up to date for November” banner appears once every payday step is ticked. **To do** has one card per adult (side by side on desktop): an “£X over this month” warning that opens their items on Plan (a heads-up, not counted), and Payday transfers (“4 to fund · 4 moves · 3 of 8 done” with a bar, “1 changed since ticked · send £50.00 more”, or struck through when all ticked), which opens Month's payday steps on that person. Accounts that need review add an “Either of you” card. **Coming up** names what's new in the month's budget, or which month's budget it uses, and any income change.

### Month

Month gathers the month's money in one place (it replaces Transfers and Spending › This month). Its header is the month title with the stage chip and Check balances; below it come **Payday** and **Pots**, in that order. A pot's page and Close <Month> take the sections' place. This first version hosts the earlier panels; audit 3 PRs 11 and 12 redesign it.

#### Payday

Desktop puts everyone's payday steps side by side: one card per person headed by their progress (“3 of 10 done”, a bar, “£X from £Y available · 4 to fund · 4 moves”, any changed steps and an over-available warning), with a band per account (“Monzo Joint · Joint · you each move your share”) above its steps. A pine banner says “You're both up to date” when every step is ticked. Below, the Funding by account table compares people and destinations, including account totals, direct allocations and pots. Mobile asks once per device whose steps to show (each adult, or Both) and leads with that person's total and what there is to do (“4 to fund · 4 moves”: bank transfers and in-app pot moves counted apart). Below it is one ordered step list per person, banded by account like desktop (“Monzo Joint · Joint · you each move your share”): fund the account, then the pot moves out of it, indented beneath. Every money move in the app (payday, setting aside, settling up, covering an overspend) uses the same step row. Each step has a circle to tick once the money has moved; the switch shows each person's progress (“3/10”, ✓ when done), the hero a “Ticked off · 3 of 10 done” bar, and a pine banner (“Ada is up to date for November”) when every step is ticked. A step whose amount changed after it was ticked keeps its tick but shows the difference (“Changed since ticked: you sent £959.00, it's now £1,009.00. Send £50.00 more.”); its amount reads “+£50.00” and copies just the difference, the hero counts “1 changed since ticked”, and tapping the circle accepts the new amount. When someone's steps add up to more than they have available, the hero warns and links to Plan with that person's items. Tick rules are in [transfer-calculation-rules](transfer-calculation-rules.md#ticking-off-steps). Captions name cross-person dependencies ("Includes £436.70 from Ben", "Ada moves it into Spending"). Tapping a step's amount copies the plain number (“2215.45”) for the banking app and briefly confirms “Copied £2,215.45”. The amount is itself the button (tinted, no copy icon); a one-line hint explains it until the first copy on the device. Each account offers "See N items", which opens Plan filtered to that account; Back to Month returns to the same step. Accounts that need review have their steps withheld and are listed afterwards with any known amounts, "Not calculated" where there are none, and the reason. There is no separate destination detail screen. Ticks record what people did; they never change the plan, and the app doesn't verify payments. The only standing caveat is “Planned amounts, not payments.” with an ⓘ.

Zero and unresolved allocations are different states. Do not imply that a missing calculation is a completed zero. Show warnings and the route to fix missing input near the affected information. The payday steps show planned funding and movements, ticked off by hand; not payment execution or automatic-payment detection.

#### Pots

**Pots** follows Payday: a summary card (“Spent on Amex so far · £939.48 of £1,420.00 planned · 2 pots need care · 18 days left · sorted to 10 Nov”), then cards grouped like Plan: Joint, each adult, Accounts. Each pot row has “£338.60 of £520.00”, a bar with a tick where even spending would be, and a status: “£131 ahead of pace · £181.40 left”, “On track · £86.00 left”, “£61.80 left” (no pace), “£12.50 over · covered when November closes”, plus “£35.00 taken by October” after a next-month cover. Carry-over pots read “£41.97 this month · Carries over”; accounts read “£112.81 one-offs”. Paced pots with a plan show even before anything is spent; other pots and accounts show once something is spent. A pot row opens its **page** (`pot`), with Back to the month: “Left this month £181.40 for 18 days”, “About £10 a day. You've averaged £28.”, a chart of spending so far against the planned pace with today and “Runs out ~19 Nov” (with an accessible description of the same figures), “At this rate Groceries runs out around Thu 19 Nov, 11 days before the month ends.” when ahead, and the pot's transactions with “on December statement” when the statement is another month's. The sort sheet shows “£181.40 left” (or “£12.50 over”) beside each planned pot.

**Carry-over pots** (Bills) read “Bills · carries over”, “£41.97 this month” and “£1,134.01 free in the pot” (or “Check the balance to see what's free”) on Month. Their page leads with **Free in the pot** and how it's worked out: “In the pot · checked Mon 9 Nov”, “Moved in since”, “Out of Bills since”, one “Waiting to settle · October statement” line per unsettled statement, and the Free total. “Check against Monzo” (the pot's bank) asks “What's in Bills now?”. “Annual costs from the Plan” lists the pot's yearly items (“Car insurance £612.00 a year”).

#### Stages and Close <Month>

**Month stages** show as a chip beside the month title: “In progress · 18 days left” (with “Funded” or “Funding · 3 of 8” beside it), “Closing”, “To settle · closed Thu 3 Dec” or “Settled”. A month that has ended but isn't closed leads with “October has ended. Cover any overspends and note what's left, then close it.” and Close October. A closed month whose spending has changed says “Changed since closed: Groceries · Monzo Joint £500.00 → £511.80.” with Close again.

**Close <Month>** (`close`) heads “Close October · 1 Oct – 31 Oct · all transactions in and sorted”, or lists what it's waiting for: transactions to sort (Sort them), or the late postings (“Last brought in Mon 2 Nov. Late October transactions can take a few days to post.” with Bring in transactions and “All October transactions are in”). **Over plan** lists each overspent pot (“Groceries · Monzo Joint £88.58 over”) with “Covered from” (the buffer first, then pots with money left, “£45.00 left”, then “November's Groceries (moves no money)”) and its cover step to tick, a step row with the amount to copy (“Move from Monzo Joint into Groceries · £88.58”, or “Out of Treats, then into Eating out · £35.00”); a next-month cover says “Leaves Groceries £88.58 short in November.” **Money left · stays in the pot** lists each monthly pot's Left and Built up, and a pot past its limit gets “Car has built up £180.00, more than £160.00 (2× its £80.00 monthly plan). Move some?” with “Move £100.00…” (records the move) or Keep it. **Carry-over pots** list what's free. The one button is Close October (Close October again once closed), and a banner confirms “October is closed”.

### Plan

Present the selected month and whether its budget is saved or inherited near the top. The scope of an edit is shown where it is saved. The balance reads “£X left”, “£X over” or “Balanced”. With two or more adults the summary has one bar per person (Planned of their Available) and the worst figure leads: if anyone is over (“Immy is £187.22 over”), the card says so even when the household still has money left, and a hatched end on their bar marks the part their Available doesn't cover. The household balance follows on its own line, with a hint when one person's money left covers another's. “Review Immy's items” filters the Plan to that person's accounts and opens their groups. Item rows keep one Monthly column; the per-person split stays in the summary and on Month's payday steps. The docked mini meter on phones shows the same worst figure and a thin bar per person. Desktop shows a wider summary, actions and grouped table; mobile puts the compact summary above item discovery, with category or destination group headings and visible item rows. Groups have a second level: by Category, whose account the money goes to (Joint accounts, then each adult's, then any needing an owner); by Destination, each account's Direct items and then each pot. A level with only one entry is skipped, so the items show directly. The second level is a heading with its subtotal (and share on desktop), not another disclosure, so a phone never needs a third tap. Search results stay flat.

Search matches item names, categories, owners and destination account/provider/type/pot text. Owner, category and destination filters constrain matches where available. A nonblank search shows direct matching rows with context and a matching count and total. Clearing returns to the prior browsing context and focus; search and filters persist while switching mounted views but reset on reload. Keep item editing and amounts discoverable in both browse and search states.

Quick amount editing and the full editor must make the affected date range clear. Full editing includes destination, funding and amount, with additional details and an impact preview; adding supports multiple items. Errors should identify the relevant field and recovery action. Use confirmation for removal and show successful changes without obscuring the work.

### Spending

The card tracker, built in the `card/` PR series from the [build plan](card-tracker-build-plan.md); behaviour is in [card-tracker-rules](card-tracker-rules.md).

**The Spending tab** (`view=spending`, with `section` for its tab) comes after Plan, with a card icon. Without a card it says “Add your card first” and links to Settings › Cards. Otherwise a summary card names the card and “Last brought in Mon 9 Nov” (or “Nothing brought in yet”), with Bring in transactions and Add a transaction. Below it, **To sort** lists purchases and refunds with no pot or account yet, newest first: the description, the amount (refunds “−£24.99”), and “Sun 8 Nov · Ada ··41001”. Payments never appear there. Empty, it reads “Nothing to sort. Bring in new transactions to start.”, or “Everything is sorted.” once there are transactions. Sections are tabs: To sort and Statements, with All transactions on desktop and under ⋯ on phones. This month moved to Month, and Rules to Settings.

**Bring in** is a dialog: “Download the Excel version of your transactions from Amex online, then choose the file here.” and one Choose the Excel file button (`.xlsx` only). Afterwards it names the file and statement (“15 transactions · 25 Oct – 24 Nov statement”), four counts (Already here, New, Sorted by your rules, To sort), and the summary check: “All 15 transactions match Amex's summary”, or what's missing (“£12.34 of charges in Amex's summary aren't in this file…”). It asks “Whose card ends 41009?” for an unknown ending, offers to change the card's closing day when the period ends on another day, and notes a final export. It ends with “Sort N transactions” (or Done) and “Bring in another file”. A file that isn't the Excel export gets “This doesn't look like an Amex Excel export. Download the Excel version of your transactions.”

**Add a transaction** is a dialog with Date, Description, Amount, “It's a refund” and Whose card. Its statement comes from its date.

**Sorting.** Each To sort row is a button with a Choose pill; it opens the **sort sheet**: the amount and “Sun 8 Nov · Ada ··41001”, then up to six suggestions as one-tap buttons (“Treats · Starling Ada” with “Suggested · Used last time”, the cardholder's own pots as “Ada's card”, joint pots, the joint account as “One-offs”, and the buffer), “All pots and accounts” (grouped like Plan, with a filter), and “Move back to To sort” for one already sorted. Above the suggestions, “Always put GREEN GROCER in this pot” makes a rule from the tap, with editable Matching text and “Only on Ada's card”; it also sorts anything else waiting that matches. A transaction sorted by a rule says “Sorted by your rule “GREEN GROCER”.” and offers “Change the rule too”. Below To sort, **Sorted by rules · N** has a Check disclosure listing the rule sorts nobody has checked (each shows its pot and a Rule tag), and “They all look right” clears them. **All transactions** lists everything except payments, newest first, with where each went (or To sort); any row can be sorted again. On desktop All transactions is a tab; on phones it sits under ⋯ (“More Spending sections”) with Back to To sort.

**Splits.** “Split across pots” in the sort sheet (“Change the split” for one already split) opens the split editor: the amount and card, then By amount or Receipt items. By amount lists lines (Pot or account, Amount, an optional Note) with Add a line, plus Half each and “Split by your 60/40 funding share” shortcuts that put each person's part in one of their own pots, for them to change. Receipt items lists typed items (Item, Amount, Pot or account) and an Everything else line that takes the rest, with where it goes. A live line says “Left to place £12.81” (by amount) or the items' total, a By pot list totals the lines, and Save split (or “Save 3 items”) only works when the lines add up. A split row in a list says “Split · 2 pots” (or “Split · 3 ways” when an account is one of them) with its lines beneath: “Spending · Starling Ada · Kettle £34.99”.

**Refunds and payments.** A refund's sort sheet names its purchase (“Matches BOOK NOOK £30.00 on 20 Oct. It counts in November, the month it arrived.”) and leads with where the purchase went (“Suggested · Where the purchase went”); it has no Always. For a split purchase it asks “Which part came back?”, listing each line (item name, “Exact match” where the amount matches, the pot and amount) and “Spread across the split · In proportion to each line”. Rows show the link both ways: “Refund of COSTCO £186.40 · 24 Oct” and “Refunded −£14.99 · 6 Nov”. A refund matched on import shows under Sorted by rules with a Refund tag. Payments to Amex are listed apart under All transactions (“Payments to Amex · Never sorted”), never in To sort.

**Statements** (a tab on both layouts) lists each statement newest first, named by the month it closes in (“November statement · 25 Oct – 24 Nov · due Sat 19 Dec”), with its total and where it is: “Open · closes Tue 24 Nov”, “3 to sort”, “Needs the final export”, “Ready to settle · due Sat 19 Dec”, “4 of 10 done” or “Settled Mon 23 Nov”. A statement (`statement`) shows “To pay Amex £1,278.75”, then checks: “All 112 transactions sorted” (or “3 to sort” with Sort them), “Matches Amex's summary” (or what's missing), “Bring in the final export…” with Bring it in and Settle without the final export, and “Amex shows a payment of £350.00 on 8 Nov” with “Tick Pay Amex” when it matches the Pay step. Then “Which months it counts in” (“Counts in October £1,181.87”) and Shares per account (“Starling Ada · Ada £258.05”, each pot, and “One-offs, already in Monzo Joint”). The button reads Settle up once it's ready, “Sort 3 first” while anything's unsorted, or says when it closes.

**Settle up** heads with “£1,278.75 to Amex by Sat 19 Dec” and “4 of 10 done” with a bar, then one card per account (“Starling Ada · Ada”, “Monzo Joint · Either of you”) with the payday step rows (pot moves indented): a tick circle, “Out of Treats”, “Into Car”, “Send to Monzo Joint”, the amount to tap and copy, “Ticked Wed 18 Nov”, and “Changed since ticked: it was £186.75, it's now £176.75. £10.00 less is needed.” The paying account's card comes last, with its pot moves and then “Pay Amex from Monzo Joint” (tinted) with “Includes £95.00 of one-offs already in Monzo Joint”. When every step is ticked a pine banner says “The October statement is settled”.

**Desktop Spending** (board 7) puts every section in one tab row (To sort, Statements, All transactions) and adds “sorted to 8 Nov” to the summary. To sort is a table built for the keyboard: Date, Merchant (with a refund's “Matches … £89.97, 2 Nov”), Card, Amount, “Pot or account” (preset to the suggestion, marked “(suggested)”), Always, Place and Split. ↑/↓ move between rows, / jumps to the pot list (type a pot's name), Enter places it, A ticks Always, S opens the split editor, and focus moves to the next row once one is placed; the keys are listed under the table. Beside To sort and All transactions a side panel keeps “November so far” (spent of planned, each pot's left or over, linking to its page on Month) and the statement to act on (its total, due date and state, Open statement). Settle up lays its account cards out in columns, like desktop Payday. Phones keep the list and sort sheet.

**Pot settings** sit in Manage → Pots, under Spending: “Carries over from month to month”, “Show pace (for steady spending like groceries)” and “Flag a build-up over (months' worth)”, default 2.

### Settings

Settings (at the sidebar foot, <kbd>G</kbd> <kbd>,</kbd>; from the account button on phones) holds everything that sets the budget up, one section per area: **Household**, **Pay & income**, **Accounts & pots**, **Categories**, **Cards**, **Sorting rules** and **Account & sync**. On desktop a section nav sits on the left (each item with a muted count: “4 · 7” accounts and pots, “2” rules), and the right shows one section at a time; `section` in the URL names it and reload keeps it. With no `section`, desktop shows Household. On phones Settings is a list of the sections, each with a summary (“Ada, Ben”, “1 card”, “2 rules”); a section is its own page with a breadcrumb (“Settings › Cards”) and the browser’s Back returns. Editors open in the shared Sheet. Until the household is set up, Settings shows only Household. Spending’s ⋯ links to Sorting rules and Card settings.

**Household.** The household name saves on blur or Enter, with a “Saved” toast; a blank name or adult is flagged in place. Each adult is a name field with a remove button (“Remove Ada”), which confirms and explains that anyone who owns an account, has income or pays a fixed amount can’t be removed until that is reassigned. “+ Add an adult” adds a row.

**Pay & income, Accounts & pots, Categories.** For now these open Edit income and the Manage panel; audit 3 PR 09 gives them their own lists.

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
| ? | Keyboard shortcuts: everything this page offers |

Hints show where there is a hovering pointer and room: “G M” beside sidebar items without a count, N on Add item, I on Bring in, / in Plan's search. Phones show none.

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
