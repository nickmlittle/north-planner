UI & UX audit · 9 November 2026 · main @ bd8a92b

> **Status:** round 1 (polish) shipped in #101–#106, 9 Nov 2026. The header rework (#108–#110) covers R1, most of P1 and part of T9. The Plan table rework (#111–#113) covers the rest of P1, plus P2, P3 and P4. Rounds 2–6 are otherwise open, and decisions T1, T2 and S1/S5 are still needed.

# North is correct and calm. It isn't yet quick to *do* things in.

The first review (#70–#100) fixed honesty, wording and structure. This audit asks a different question: does North feel like a slick app for two jobs, **planning the month** and **actioning the transfers**? Mostly the answer is "it's a careful web page". Three things hold it back:
- The payday list doesn't know where money comes from, and doesn't help you keep your place.
- Every screen spends its first third on chrome.
- Settings are spread over three places.

**Method:** Playwright with Chromium at 375×812 (touch, mobile) and 1440×900, plus 800, 1100 and 1280 wide. Local-only mode against `plan-transfers-baseline.json` (Ada + Ben, 40 items, Nov 2026). Edge states were checked too: no income, one person's income, a one-adult household, an account with no owner, long names and £12k amounts, and a fresh setup through to the first item. Positions and sizes are read from the live DOM.

**Not covered:** sign-in, cloud save, real on-screen keyboards, screen readers.

---

## What's already good

- The vocabulary is consistent, and copy is short. Warnings sit next to the thing they're about.
- The phone payday list really is one ordered list: fund, then the pot moves beneath, with honest "Not calculated" states.
- The impact preview sits above every Save. Confirm dialogs show the balance change.
- No horizontal page scroll anywhere on phones, and no text under 13px.
- First-run is clean: three setup steps, then "Start your plan".

---

## The five themes

1. **Payday steps don't say *from where*, so some steps aren't real transfers.** The rules make the source account unknown (`transfer-calculation-rules.md` §Routing). So Ada's list says "Fund Ada · Starling · Current account £698.72" even if her pay lands in Starling, which means moving nothing. "8 steps" mixes 4 bank transfers with 4 in-app pot moves. Nothing is copyable, and nothing helps you keep your place when you switch to your banking app and back.
2. **Desktop has no payday list at all.** `.payday` is hidden at ≥768px (`styles.css:816`, shown only in the phone block at `:882`). Desktop Transfers is the per-account table only. You can plan on the laptop, but you can't action from it.
3. **Chrome before content.**
   - On the phone, Plan's first item starts at **y≈505 of 812**: header, month, date note, summary, "Budget items" + Add, search, two filter selects, then a table header. That leaves 4 items visible.
   - Transfers with a person chosen starts its first step at y≈420.
   - The desktop shares one header across Plan and Transfers, so Transfers shows "Add item" and the Plan's Available/Planned/Balance.
4. **Settings are in three places.**
   - Income is under Plan ▸ Month & income ▸ Edit income on phones (two taps, from a link).
   - Accounts, pots and categories are in the same dialog.
   - **Household** takes a whole bottom-nav slot for two name fields and a "Continue to Plan" button.
5. **It doesn't feel like an app yet.**
   - There's no web manifest, icon or theme colour, so on a phone it's a browser tab.
   - Only Manrope 500 and 600 are loaded, but the stylesheet asks for 650 (28 times), 700 (15), 750 and 400. Heavy weights all render the same, so the type hierarchy goes flat.
   - There are two different select styles.
   - Item names are underlined like web links.
   - Every row has three separate 36px-tall targets.

---

## Findings

Severity: **High** blocks or slows a core job · **Med** friction or inconsistency · **Low** polish. Effort: **S** < ½ day · **M** 1–3 days · **L** model or rules change. Items marked ⚑ need a product decision.

### Transfers and payday actioning

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| T1 ⚑ | Steps, both widths | No source account, so steps can't say "from X to Y". Funding the account your pay lands in shows up as a step. | Ada step 6 "Fund Ada · Starling £698.72"; rules: "The source is unknown (`null`)" | Add **"Pay lands in"** per adult (or per employment income source). Steps become "Starling → Monzo Joint · £2,215.45". Funding your own pay account is dropped or shown as "already there". Needs a rules change. | High | L |
| T2 ⚑ | Steps | Nothing helps you keep your place across 8 steps and an app switch. | No state on steps. Earlier decision: no tick-off, because the rules forbid payment status. | A per-device, per-month **checklist**: tap a step to grey it out. It resets each month, is never synced, and says "Your checklist, not payment status". If the answer stays "no", at least keep scroll position and the expanded state on return. | High | M |
| T3 | Desktop Transfers | No step list. The only view is the table. | `.payday{display:none}` outside the ≤767 block | Desktop Transfers leads with steps in one column per person (Ada · Ben), with the per-account table below as a collapsible "By account" view. | High | M |
| T4 | Steps | Amounts and payees can't be copied. Account labels wrap: "Fund Joint · Monzo · Current account" takes 2 lines on every fund step. | 375px screenshots | Tap an amount to copy it ("Copied £2,215.45"). Use a short account name everywhere on steps (nickname, or "Monzo Joint"). | Med | S |
| T5 | Step summary | "8 steps" treats bank transfers and in-app pot moves the same. | Ada: 4 fund + 4 move | Write "4 transfers · 4 pot moves". The person heading in Both reads the same. | Med | S |
| T6 | Phone Transfers top | The month row, the "Using budget from October 2026" note, a 70px person switch and the hero come before step 1 (y≈420). | 03-transfers-ada | Drop the budget-date note on Transfers. Make the person switch a compact segmented control in the header row. Put the hero on one line: "Ada · £4,429.66 · 4 transfers". | Med | S |
| T7 | Steps | "See N items" sits on every fund step ("See 26 items" ×2 in Both). | 04-transfers-both | Make the whole fund step tappable to show its items, and drop the link. | Low | S |
| T8 | Transfers note | The ⓘ on "Planned amounts, not payments." is 17×20. | metrics | Make it a 44×44 target, like the other ⓘ buttons. | Low | S |
| T9 | Desktop Transfers header | Shows Plan's Available/Planned/Balance, Edit income, Manage… and **Add item**. | 11-transfers | Give Transfers its own header: month, then per-person funding totals. Keep Add item on Plan. | Med | S |

### Plan

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Phone Plan top | First item at y≈505, so only 4 rows are visible. The page is 3,307px for 40 items. | 01-plan-cold | Search plus one **Filter** button (a sheet holding Owner and Category, with an active count). Drop the table header and the "Budget items" heading on phones. Move Add item into the header as a + button. Target: first item at y≈300. | High | M |
| P2 | Rows, phone | Each row has three targets, each 36px tall: name 175×36, amount 84×36, ⋯ 44×36. Names are underlined like links. | metrics | Make the whole row the tap target for the editor (≥48px). Keep the amount chip for quick edit and ⋯ for the menu. No underline. | Med | S |
| P3 | Rows, desktop | Rows are 63px tall for one line, so 40 items ≈ 2,500px. The Destination column repeats "Bills · Joint · Monzo · Current account" 26 times. | 01-plan | Make rows about 44px. Destination becomes the short form (E3). Consider grouping by destination as an option. | Med | S |
| P4 | Row actions, desktop | "Edit" appears three times: the name link, the Edit link, and More ▸ Edit. More holds only Edit and Remove. | 11-row-menu | Row click opens the editor. Keep a single ⋯ with **Duplicate** and Remove, and drop the Edit link. | Med | S |
| P5 | Quick edit | Desktop inserts a 210px panel and pushes the rows down. On phones, Save lands at y≈718, under a real keyboard. | 03-quick-edit, 10b | Inline edit: Enter saves and Esc cancels. Show the impact as one line under the field, and update the summary live. The full impact stays in the editor. | Med | M |
| P6 | Amount column | Fixed-amount items have no chip, so amounts misalign. A £12,345.67 amount pushes the pencil outside its chip. | 01-plan, m-long-plan | Same chip for every row (disabled style for fixed). Fix the chip's min-width/overflow. | Low | S |
| P7 | Destination filter | "Showing 26 items for Joint · Current account · November 2026" in a card with empty padding. "Matching total" appears in each group band. | 06-see-items | Use a chip: "Monzo Joint ×" plus Back. Bands show the plain total. | Low | S |
| P8 | Month picker | The selected month isn't marked. The legend "● Budget updated · • Income updated" uses two near-identical dots. | 16-month-picker | Fill the selected month and outline today. Use clearer markers (e.g. a dot vs a ring) with labels. | Low | S |
| P9 | Plan details dialog | After #97 it's just two rows that could sit in the summary card. | 01-plan | Show "Available £6,500 · Planned £7,641.87" in the card and retire the dialog. | Low | S |

### Editing

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Add item | The order is Category, then Destination (owner ▸ account ▸ pot), then Name. Adding one item takes about 8 interactions. On first run you also have to create a category and an account inline first. | 14-add, m-first-add | Put Name and Amount first. Remember the last destination and category, show them as editable chips, and pre-fill them. Make "Add another" secondary. | Med | M |
| E2 | Editor | No close × in the header, and no Remove inside the editor. | 12-editor-top | Add × and a "Remove item" text action in the footer. | Med | S |
| E3 | Destination labels | Four formats for one thing: "Bills · Joint · Monzo · Current account" (desktop Plan), "Joint · Monzo · Current account · Bills" (editor), "Bills pot" (phone row), "Joint · Monzo · Current account" (Transfers). | screens | Pick one: **"Bills · Monzo Joint"** (the pot, then a short account name). One helper in `budgetLabels`. | Med | S |
| E4 | Add footer | "Save item" is enabled while it says "Nothing added yet". | 14-add | Disable it until a row is valid. | Low | S |
| E5 | Desktop editor | A single 660px column needs a scroll at 900px tall. | 04-editor | Two columns at ≥1100: details on the left, funding and impact on the right. | Low | M |

### Household, income and setup

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Information architecture | Income and Manage live behind "Month & income" on phones. Household is a nav tab for two names. | 17-month-income, 22-household | Turn the **Household** tab into the settings hub: People & pay · Accounts & pots · Categories. The Month & income dialog goes, and "Remove budget date" moves into the month control's menu. | High | M |
| S2 | Income | The "Add recurring income source" form is always open and takes half the sheet. Amounts show as "4000.00". "Classification" is jargon. | 18-income | Add an **Add income** button that reveals the form. Show "£4,000.00". Type options: "Salary (sets the split)" / "Other income". | Med | S |
| S3 | Manage | Both "Done" and ×. Every account says "Needs account type", but nothing explains why it matters. | 07-manage | Keep ×. Drop the account-type nag, or say what the type changes. | Low | S |
| S4 | Household page | It's the only page with a large visible h1. "Remove" links sit centred under fields on phones. "Continue to Plan" is odd on a settings page. | 12-household | Folds into S1. Use inline remove (trash icon), and save on blur. | Low | S |
| S5 ⚑ | Setup | Setup creates no accounts, so the first item forces inline account creation. | m-first-add | Add an optional **Accounts** step ("Where does money go? A joint account, each person's own"). This is also where "Pay lands in" (T1) would be asked. | Med | M |

### Tablet and in-between widths

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 768–1099 | At 800px the Plan table is wider than the screen: Destination is cut off, and the Actions column and group totals are off to the right. The summary sits above the month control with a 70px gap, and the three toolbar buttons wrap. | 13-plan-800, 13-transfers-800 | Use the phone row layout (or a 3-column table: Item · Amount · ⋯) below 1100. Put the month first, then the summary, then the actions in one row. | High | M |
| R2 | 1100 | The balance "£1,141.87 over" wraps onto two lines. | 13-plan-1100 | `white-space:nowrap` on the summary values, and let the summary column flex. | Low | S |

### App feel and visual polish

| # | Where | Issue | Evidence | Fix | Sev | Eff |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | Type | Only Manrope 500 and 600 are loaded, but the CSS asks for 400, 550, 650, 700 and 750. Weights above 600 render as 600, so bold labels look the same as regular ones. | `index.html`, `styles.css` | Load Manrope variable `wght@400..800`. Optionally self-host it so the app works offline. | High | S |
| V2 | Controls | Two select styles: native (Plan filters, Income, Manage) and a custom chevron (editor). | screens | One `.select` style everywhere. | Med | S |
| V3 | Shell | Not installable: no manifest, icons, `theme-color` or apple-touch-icon. The document title is always "North Planner". | `index.html` | Add a manifest (standalone, pine theme), icons and per-screen titles ("Transfers · Nov 2026"). Later, a service worker so a local-first app opens offline. | Med | M |
| V4 | Header | An unlabelled ✓ opens a sheet that just says "Saved". | 08-header-account | Show status only when it isn't "Saved" (Saving… / Not saved). Keep the account icon. | Low | S |
| V5 | Sidebar | The desktop sidebar is collapsed to icons by default and the brand mark is hidden. | 01-plan | Expand it by default at ≥1280. | Low | S |

---

## Decisions needed

1. **T1, source account.** Should North learn where each person's pay lands, so steps read "from → to" and drop no-op steps? This changes `transfer-calculation-rules.md`, where the source is currently always unknown. **Recommended.** It's the biggest single step towards "actioning".
2. **T2, keeping your place.** A per-device monthly checklist that is explicitly not payment status? You declined tick-off in §6.1. This would be local, unsynced and reset each month. **Recommended**, given the goal.
3. **S1 and S5, the settings hub and an Accounts setup step.** Household becomes settings, and the Month & income dialog goes. **Recommended.**

## Suggested rounds

1. **Polish (S) — ✅ shipped:**
   - #101: V1 fonts, V2 one select style, R2
   - #102: P6 chips, P8 month picker, P9 (Plan card shows Available · Planned)
   - #103: E2 editor × and Remove, E4
   - #104: S2 income form, S3 Manage, V4 quiet saved status (also fixed "Choose a version" showing as Saved)
   - #105: E3 one destination label, "Bills · Monzo Joint". It's the nickname, else bank and owner. In a clash, a lone current account keeps the plain name ("Monzo Joint Savings" for the other).
   - #106: T4 tap-to-copy amounts, T5 "4 to fund · 4 moves" (glossary wording, not "transfers"), T8

   Left over: "Fund Monzo Joint Savings" still wraps once at 375 because of the copy icon. The phone table header's "Actions" overflows by 4px, which predates round 1 (P1 removes the header).
   **Header rework (allocation meter) — ✅ shipped 9 Nov 2026,** chosen from a clickable mockup (option A over a three-figure card):
   - #108: on desktop and tablet the month is the page title, with ⋯ (Edit income, Manage…) and Add item on the same row. An allocation meter ("£X over / £X left", a bar of Planned against Available, "£X planned of £Y available ✎ (basis)") replaces the three figures. Transfers shows the month and ⋯ only (part of T9). The two-column top row is gone, which fixes **R1**.
   - #109: desktop Owner and Category become chips (filled when active) with Clear filters. Phones get Search, **Filter** (a sheet, "Filter · 1") and **+** on one row (**P1** filters).
   - #110: on phones, the month and ⋯ move into the app header. ⋯ opens "Budget and account" (income, Manage, go back, save status, Sign out). The meter becomes the phone's Plan card, and a slim copy docks above the bottom nav once the card scrolls away. The first phone row moves from y≈488 to y≈324.

   Left over: the phone table header ("Item · Amount · Actions") is still there (the rest of P1), and the carried-over note takes a line above the card. T9's per-person totals on desktop Transfers are still to do.
   **Plan table rework (direction A) — ✅ shipped 9 Nov 2026,** chosen from a wireframe canvas (https://claude.ai/artifact/PzHNFq7jEk7VRfWwud72rc). The per-person split stays on Transfers only.
   - #111: the items sit in a "Budget items" card. Desktop columns are Category | Share of plan | Monthly | ⋯, and the bands line their share bar and total up with the columns. A pine Total row closes the table, and the header has Expand all. Groups start closed on every screen size and are remembered for the session; saving an item, or arriving from Transfers, opens its group. Phones lose the owner bands and get two-line category bands. Item rows carry "Funding · Destination" under the name, with no underline (**P3**).
   - #112: a Category / Destination switch, remembered per device. Destination bands follow Transfers' order, and their items read "Funding · Category".
   - #113: phone rows are Item | Amount. The whole row opens the editor, and there's no ⋯ and no visible header (**P1**, **P2**). Duplicate goes in the editor and the desktop ⋯ (Duplicate, Remove), and the separate Edit link is gone (**P4**).
2. **Actioning (M):**
   - T3 desktop steps
   - T6 and T7 phone Transfers top
   - T9 Transfers header
   - T2 checklist (if agreed)
3. **Plan density (M):**
   - P1 phone filters into a sheet
   - P2 and P3 rows
   - P4 actions
   - P5 inline quick edit
   - P7 filter chip
4. **Structure (M):**
   - S1 Household hub
   - E1 add flow
   - S5 Accounts step
   - R1 tablet layout
   - E5
5. **Model (L):** T1 "Pay lands in", once decided. It builds on round 4's settings hub and Accounts step.
6. **Shell (M):** V3 manifest, icons, titles and offline. Also V5.
