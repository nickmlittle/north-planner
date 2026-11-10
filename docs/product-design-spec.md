# North Planner: product, brand and interface specification

**Audience:** future developers, designers and coding agents. **Updated:** 9 November 2026.

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

Desktop uses a collapsible pine sidebar with the same three destinations as the phone's bottom nav: Plan, Transfers and Household. Plan and Transfers are separate screens at every width, so a link means the same screen on any device. On desktop, both share the month, summary and page controls; below them, Plan shows the item table and Transfers shows people and the destination comparison, each at full width. Its viewport-oriented shell gives the page body or bounded workspace regions control of scrolling, with sticky context where useful. Page titles and essential controls belong in the shared page frame; modal content must scroll independently.

Mobile uses a compact page heading and labeled bottom navigation for Plan, Transfers and Household. Plan and Transfers share the selected month. The account/save-status control opens a utility sheet; it shows a status mark only when there is something to know (saving, unsaved, a version to choose, or a failure), never for Saved. A save failure also appears visibly on the page. Editing flows take priority over persistent navigation. The mobile layout applies at widths up to 767 px and also to short, coarse-pointer landscape screens covered by the existing media query. Other component-specific breakpoints exist; do not assume one breakpoint governs every layout.

**Direction:** Keep the primary content reachable above safe areas and persistent controls, allow page scrolling on short screens, and avoid horizontal overflow or clipping at narrow widths and increased text sizes. Preserve logical focus and browser Back/Forward behavior when changing navigation.

### Plan

Present the selected month and whether its budget is saved or inherited near the top. The scope of an edit is shown where it is saved. The balance reads “£X left”, “£X over” or “Balanced”. With two or more adults the summary has one bar per person (Planned of their Available) and the worst figure leads: if anyone is over (“Immy is £187.22 over”), the card says so even when the household still has money left, and a hatched end on their bar marks the part their Available doesn't cover. The household balance follows on its own line, with a hint when one person's money left covers another's. “Review Immy's items” filters the Plan to that person's accounts and opens their groups. Item rows keep one Monthly column; the per-person split stays in the summary and on Transfers. The docked mini meter on phones shows the same worst figure and a thin bar per person. Desktop shows a wider summary, actions and grouped table; mobile puts the compact summary above item discovery, with category or destination group headings and visible item rows. Groups have a second level: by Category, whose account the money goes to (Joint accounts, then each adult's, then any needing an owner); by Destination, each account's Direct items and then each pot. A level with only one entry is skipped, so the items show directly. The second level is a heading with its subtotal (and share on desktop), not another disclosure, so a phone never needs a third tap. Search results stay flat.

Search matches item names, categories, owners and destination account/provider/type/pot text. Owner, category and destination filters constrain matches where available. A nonblank search shows direct matching rows with context and a matching count and total. Clearing returns to the prior browsing context and focus; search and filters persist while switching mounted views but reset on reload. Keep item editing and amounts discoverable in both browse and search states.

Quick amount editing and the full editor must make the affected date range clear. Full editing includes destination, funding and amount, with additional details and an impact preview; adding supports multiple items. Errors should identify the relevant field and recovery action. Use confirmation for removal and show successful changes without obscuring the work.

### Transfers

Desktop Transfers compares people and destinations in a table, including account totals, direct allocations and pots. Mobile asks once per device whose transfers to show (each adult, or Both) and leads with that person's total and what there is to do (“4 to fund · 4 moves”: bank transfers and in-app pot moves counted apart). Below it is one ordered step list per person: fund an account, then the pot moves out of that account, indented beneath it. Each step has a circle to tick once the money has moved; the switch shows each person's progress (“3/10”, ✓ when done), the hero a “Ticked off · 3 of 10 done” bar, and a pine banner (“Ada is up to date for November”) when every step is ticked. Tick rules are in [transfer-calculation-rules](transfer-calculation-rules.md#ticking-off-steps). Captions name cross-person dependencies ("Includes £436.70 from Ben", "Ada moves it into Spending"). Tapping a step's amount copies the plain number (“2215.45”) for the banking app and briefly confirms “Copied £2,215.45”. The amount is itself the button (tinted, no copy icon); a one-line hint explains it until the first copy on the device. Each account offers "See N items", which opens Plan filtered to that account; Back to Transfers returns to the same step. Accounts that need review have their steps withheld and are listed afterwards with any known amounts, "Not calculated" where there are none, and the reason. There is no separate destination detail screen. Ticks record what people did; they never change the plan, and the app doesn't verify payments. The only standing caveat is “Planned amounts, not payments.” with an ⓘ.

Zero and unresolved allocations are different states. Do not imply that a missing calculation is a completed zero. Show warnings and the route to fix missing input near the affected information. Transfers show planned funding and movements, ticked off by hand; not payment execution or automatic-payment detection.

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
| **Move** | Money moved from an account into one of its pots. It is already inside the account's funding. | Pot movements as an extra amount, “Ada moves” for a funding total |

“Transfers” is only the name of the screen.

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
