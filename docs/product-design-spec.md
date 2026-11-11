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

The selected calendar month resolves the applicable saved budget and income. An edit can affect the selected month and subsequent months up to the next relevant saved boundary. Earlier months remain editable. Plan and Transfers use the same resolved data. The dedicated rule documents define inheritance, rounding, incomplete allocations, migration and exceptions; do not reconstruct those rules from a screen.

1. **Set up:** name the household and adults, then add income and budget structure as needed. Clearly explain missing or invalid information and how to correct it.
2. **Plan:** choose a month, understand the budget balance and effective date, find items by browsing or searching, and add or edit them. Show affected months and any relevant impact before save, then give clear feedback.
3. **Understand funding:** inspect each person's position and destination totals. Account funding already includes its pot allocations; pot movements are subsequent allocations, not additional contributions. Explanations must preserve that distinction.
4. **Maintain shared structure:** manage accounts, pots and categories with clear all-month implications. Confirm consequential removal and explain dependencies.
5. **Recover:** communicate local/cloud save status and conflicts; make a failure visible and provide a clear next step. Do not imply that an unsaved change is safely stored.

## Visual identity

The interface is quiet and functional: deep pine navigation and primary actions, a warm cream canvas, soft off-white surfaces, muted green-gray secondary text, fine borders and modest rounding. Use the current CSS variables as the starting palette; check contrast in the actual foreground/background combination.

| Role | Current token | Value |
| --- | --- | --- |
| Primary / navigation | `--pine` | `#203e32` |
| Page background | `--cream` | `#f3eedf` |
| Surface | `--card` | `#fbf8ef` |
| Main text | `--charcoal` | `#29312a` |
| Secondary text | `--muted` | `#59665a` |
| Border | `--line` | `#d6d2c3` |
| Subtle selection | `--soft-fern` | `#e7e9dc` |
| Accent / common focus outline | `--orange` | `#bc653d` |

The app uses Manrope, loaded in weights 500 and 600, with system sans-serif fallbacks. Use hierarchy, weight, whitespace and alignment to distinguish headings, labels and amounts. Avoid treating the font download as a prerequisite for legibility. Currency benefits from aligned or tabular numerals and an explicit GBP context. Small secondary copy must remain readable at enlarged text sizes.

The defined spacing variables are 8, 16, 24 and 32 px; existing screens also use intermediate values. Prefer that rhythm for new work. Cards commonly have a fine border and roughly 10 px corners; inputs and buttons have smaller radii. Use subtle shadows sparingly. Lucide line icons support labels and actions; icons alone require accessible names. The compact desktop sidebar can reveal the `north.` wordmark when expanded. There is no separate logo, illustration or photography system established here.

## Interface patterns

### Navigation and layout

Desktop uses a collapsible pine sidebar with the same five destinations as the phone's bottom nav: Home, Plan, Spending, Transfers and Household. Opening the app lands on Home; a link that names a screen (or Plan/Transfers) goes straight there, and a budget link without a view returns to the one used last on the device. Plan and Transfers are separate screens at every width, so a link means the same screen on any device. On desktop, both share the month, summary and page controls; below them, Plan shows the item table and Transfers shows people and the destination comparison, each at full width. Its viewport-oriented shell gives the page body or bounded workspace regions control of scrolling, with sticky context where useful. Page titles and essential controls belong in the shared page frame; modal content must scroll independently.

Mobile uses a compact page heading and labeled bottom navigation for Home, Plan, Spending, Transfers and Household (five 48 px targets at 375 px). Plan and Transfers share the selected month. The account/save-status control opens a utility sheet; it shows a status mark only when there is something to know (saving, unsaved, a version to choose, or a failure), never for Saved. A save failure also appears visibly on the page. Editing flows take priority over persistent navigation. The mobile layout applies at widths up to 767 px and also to short, coarse-pointer landscape screens covered by the existing media query. Other component-specific breakpoints exist; do not assume one breakpoint governs every layout.

**Direction:** Keep the primary content reachable above safe areas and persistent controls, allow page scrolling on short screens, and avoid horizontal overflow or clipping at narrow widths and increased text sizes. Preserve logical focus and browser Back/Forward behavior when changing navigation.

### Home

Home is this month at a glance: “This month” over the month as its title, then the per-person summary from Plan (“November plan”), with “Review Immy's items” (Plan filtered to that person's accounts) and Open Plan. Desktop adds Open Transfers and Open Plan beside the title. Below the summary, a pine “You're up to date for November” banner appears once every payday step is ticked. **To do** has one card per adult (side by side on desktop): an “£X over this month” warning that opens their items on Plan (a heads-up, not counted), and Payday transfers (“4 to fund · 4 moves · 3 of 8 done” with a bar, “1 changed since ticked · send £50.00 more”, or struck through when all ticked), which opens Transfers on that person. Accounts that need review add an “Either of you” card. **Coming up** names what's new in the month's budget, or which month's budget it uses, and any income change.

### Plan

Present the selected month and whether its budget is saved or inherited near the top. The scope of an edit is shown where it is saved. The balance reads “£X left”, “£X over” or “Balanced”. With two or more adults the summary has one bar per person (Planned of their Available) and the worst figure leads: if anyone is over (“Immy is £187.22 over”), the card says so even when the household still has money left, and a hatched end on their bar marks the part their Available doesn't cover. The household balance follows on its own line, with a hint when one person's money left covers another's. “Review Immy's items” filters the Plan to that person's accounts and opens their groups. Item rows keep one Monthly column; the per-person split stays in the summary and on Transfers. The docked mini meter on phones shows the same worst figure and a thin bar per person. Desktop shows a wider summary, actions and grouped table; mobile puts the compact summary above item discovery, with category or destination group headings and visible item rows. Groups have a second level: by Category, whose account the money goes to (Joint accounts, then each adult's, then any needing an owner); by Destination, each account's Direct items and then each pot. A level with only one entry is skipped, so the items show directly. The second level is a heading with its subtotal (and share on desktop), not another disclosure, so a phone never needs a third tap. Search results stay flat.

Search matches item names, categories, owners and destination account/provider/type/pot text. Owner, category and destination filters constrain matches where available. A nonblank search shows direct matching rows with context and a matching count and total. Clearing returns to the prior browsing context and focus; search and filters persist while switching mounted views but reset on reload. Keep item editing and amounts discoverable in both browse and search states.

Quick amount editing and the full editor must make the affected date range clear. Full editing includes destination, funding and amount, with additional details and an impact preview; adding supports multiple items. Errors should identify the relevant field and recovery action. Use confirmation for removal and show successful changes without obscuring the work.

### Transfers

Desktop Transfers puts everyone's payday steps side by side: one card per person headed by their progress (“3 of 10 done”, a bar, “£X from £Y available · 4 to fund · 4 moves”, any changed steps and an over-available warning), with a band per account (“Monzo Joint · Joint · you each move your share”) above its steps. A pine banner says “You're both up to date” when every step is ticked. Below, the Funding by account table compares people and destinations, including account totals, direct allocations and pots. Mobile asks once per device whose transfers to show (each adult, or Both) and leads with that person's total and what there is to do (“4 to fund · 4 moves”: bank transfers and in-app pot moves counted apart). Below it is one ordered step list per person: fund an account, then the pot moves out of that account, indented beneath it. Each step has a circle to tick once the money has moved; the switch shows each person's progress (“3/10”, ✓ when done), the hero a “Ticked off · 3 of 10 done” bar, and a pine banner (“Ada is up to date for November”) when every step is ticked. A step whose amount changed after it was ticked keeps its tick but shows the difference (“Changed since ticked: you sent £959.00, it's now £1,009.00. Send £50.00 more.”); its amount reads “+£50.00” and copies just the difference, the hero counts “1 changed since ticked”, and tapping the circle accepts the new amount. When someone's steps add up to more than they have available, the hero warns and links to Plan with that person's items. Tick rules are in [transfer-calculation-rules](transfer-calculation-rules.md#ticking-off-steps). Captions name cross-person dependencies ("Includes £436.70 from Ben", "Ada moves it into Spending"). Tapping a step's amount copies the plain number (“2215.45”) for the banking app and briefly confirms “Copied £2,215.45”. The amount is itself the button (tinted, no copy icon); a one-line hint explains it until the first copy on the device. Each account offers "See N items", which opens Plan filtered to that account; Back to Transfers returns to the same step. Accounts that need review have their steps withheld and are listed afterwards with any known amounts, "Not calculated" where there are none, and the reason. There is no separate destination detail screen. Ticks record what people did; they never change the plan, and the app doesn't verify payments. The only standing caveat is “Planned amounts, not payments.” with an ⓘ.

Zero and unresolved allocations are different states. Do not imply that a missing calculation is a completed zero. Show warnings and the route to fix missing input near the affected information. Transfers show planned funding and movements, ticked off by hand; not payment execution or automatic-payment detection.

### Spending

The card tracker, built in the `card/` PR series from the [build plan](card-tracker-build-plan.md); behaviour is in [card-tracker-rules](card-tracker-rules.md).

**Cards (Household).** Below Adults, a Cards section lists each card (“Closes on the 24th · due 25 days later · paid from Monzo Joint”, and whose card ends in what) with Edit, and “Add a card”. The form asks for the name (Amex), the statement closing day and the days until payment is due, both required with no defaults, and previews the result (“Statements run from the 25th to the 24th. The 24 Nov statement is due 19 Dec.”). Paid from defaults to the joint account and the buffer to its main balance. “Whose card is whose” maps each card ending to an adult. Without any accounts it asks for one on the Plan first.

**The Spending tab** (`view=spending`, with `spendingView` for its section) sits between Plan and Transfers, with a card icon. Without a card it says “Add your card first” and links to Household. Otherwise a summary card names the card and “Last brought in Mon 9 Nov” (or “Nothing brought in yet”), with Bring in transactions and Add a transaction. Below it, **To sort** lists purchases and refunds with no pot or account yet, newest first: the description, the amount (refunds “−£24.99”), and “Sun 8 Nov · Ada ··41001”. Payments never appear there. Empty, it reads “Nothing to sort. Bring in new transactions to start.”, or “Everything is sorted.” once there are transactions. Sections are tabs (To sort, then This month and Statements as they ship; Rules on desktop and under ⋯ on phones); a section that hasn't shipped falls back to To sort.

**Bring in** is a dialog: “Download the Excel version of your transactions from Amex online, then choose the file here.” and one Choose the Excel file button (`.xlsx` only). Afterwards it names the file and statement (“15 transactions · 25 Oct – 24 Nov statement”), four counts (Already here, New, Sorted by your rules, To sort), and the summary check: “All 15 transactions match Amex's summary”, or what's missing (“£12.34 of charges in Amex's summary aren't in this file…”). It asks “Whose card ends 41009?” for an unknown ending, offers to change the card's closing day when the period ends on another day, and notes a final export. It ends with “Sort N transactions” (or Done) and “Bring in another file”. A file that isn't the Excel export gets “This doesn't look like an Amex Excel export. Download the Excel version of your transactions.”

**Add a transaction** is a dialog with Date, Description, Amount, “It's a refund” and Whose card. Its statement comes from its date.

**Sorting.** Each To sort row is a button with a Choose pill; it opens the **sort sheet**: the amount and “Sun 8 Nov · Ada ··41001”, then up to six suggestions as one-tap buttons (“Treats · Starling Ada” with “Suggested · Used last time”, the cardholder's own pots as “Ada's card”, joint pots, the joint account as “One-offs”, and the buffer), “All pots and accounts” (grouped like Plan, with a filter), and “Move back to To sort” for one already sorted. Above the suggestions, “Always put GREEN GROCER in this pot” makes a rule from the tap, with editable Matching text and “Only on Ada's card”; it also sorts anything else waiting that matches. A transaction sorted by a rule says “Sorted by your rule “GREEN GROCER”.” and offers “Change the rule too”. Below To sort, **Sorted by rules · N** has a Check disclosure listing the rule sorts nobody has checked (each shows its pot and a Rule tag), and “They all look right” clears them. **All transactions** lists everything except payments, newest first, with where each went (or To sort); any row can be sorted again. **Rules** lists each rule as plain text (“GREEN GROCER” → Groceries · Monzo Joint, “Only Ben ··41009 · Sorted 3 transactions”) with Edit, Move up, Move down and Delete; “The first rule that matches sorts a transaction.” On desktop All transactions and Rules are tabs; on phones they sit under ⋯ (“More Spending sections”) with Back to To sort.

### Controls, overlays and feedback

Use a filled pine primary button for the main action, outlined secondary buttons for alternatives, and restrained text actions for lower-priority operations. Form controls need persistent labels, clear validation, and visible focus. Tables and grouped lists should expose their hierarchy and totals rather than rely on color alone. Use disclosures for secondary detail without hiding critical warnings.

Dialogs and sheets need an accessible title, keyboard containment, Escape/close behavior, background isolation, independent scrolling and focus restoration. Preserve context when returning from detail. Status changes, validation and failures should be announced appropriately and remain understandable without color or icons. Ensure tap targets are comfortably usable; the mobile navigation is designed around at least 48 px targets and common controls around 44 px, but existing controls should be checked rather than assumed compliant.

### Language

Use plain, concise British English and familiar household finance terms. Label actions with verbs (“Edit income”, “Add item”) and name amounts with the glossary below. Explain scope in calendar months. State what needs attention and how to resolve it without blame. Avoid implying a payment has happened or that an account owner necessarily funds every item.

Name a destination one way everywhere it is shown (Plan rows, the item editor, Transfers): the pot, then the account's short name, as in “Bills · Monzo Joint”. The short name is the account's nickname, or else bank and owner; `shortAccountLabels` in `budgetLabels` is the one place it is built. Pickers and Manage, which choose between accounts, keep the fuller bank · type labels.

Keep text to what changes a decision: the scope and impact above Save, real warnings, and empty states. Don't explain what a label or number already says, and don't repeat a caveat that is already on the screen. Put secondary detail behind one ⓘ.

#### Glossary

These four words are the only names for these concepts in the UI. `src/copy.vocabulary.test.ts` fails CI on the retired ones.

| Word | Means | Not |
| --- | --- | --- |
| **Available** | Income for the month, for the household or for one person. | Available income, available money |
| **Planned** | The total of the month's items. The balance against Available reads “£X left”, “£X over” or “Balanced”. | Planned budget, Budget balance, remaining, left to allocate, shortfall |
| **Funding** / **Fund** | What one person pays into one account, including its pots. A fixed-rule item has **Fixed amounts**, and its remainder is “unassigned”. | Funding total, contributions, allocations, Transfers by destination |
| **Move** | Money moved from an account into one of its pots. It is already inside the account's funding. Money leaving a pot is “Out of <pot>”, and account to account is “Send to <account>”. | Pot movements as an extra amount, “Ada moves” for a funding total |

“Transfers” is only the name of the screen.

The card tracker (Spending) adds these words. Its rules are in [card-tracker-rules](card-tracker-rules.md).

| Word | Means | Not |
| --- | --- | --- |
| **Spending** | The tab where card spending is brought in, sorted, tracked and settled. | Card tracker, Transactions |
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
