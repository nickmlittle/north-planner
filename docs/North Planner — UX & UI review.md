UX & UI review · 9 November 2026

# North feels clunky because it answers the household’s question, not yours.

Six jobs walked end to end at 1440 px and 375 px against the 40-item synthetic household. Thirty-nine findings, two outright bugs, and one flow that cannot be completed without losing data.

**Build** main @ 91eaee5 **Data** plan-transfers-baseline.json · Ada + Ben · Nov 2026 **Mode** browser-local (Supabase off) **Not covered** sign-in, cloud save, conflict chooser, screen readers

> ### Status · updated 9 November 2026 (main @ bd8a92b)
>
> **Everything is shipped: both bugs, every quick win and small fix, and all ten structural items in §6.**
>
> | Round | PRs | What it covered |
> | --- | --- | --- |
> | The two bugs | #70 | Destination picker state loss; income form overlap |
> | §5 quick wins | #72–#75 | Shared wording and Plan summary · item editor and inline edit · Plan list behaviour · Transfers |
> | Remaining small fixes + audit | #76–#79 | Compact mobile rows · confirm dialogs and quick-edit consequence · "Not calculated" and payday-first detail · cold open, setup nav, income editor, contrast CI |
> | Structural §6.4 | #80 | One `ImpactPreview` above the button in the quick edit, the full editor's footer and both removal confirmations |
> | Structural §6.2 | #81 | Person switch (asked once, remembered per device), "Ada moves £4,429.66 · 8 steps" hero, Transfers grouped by who pays |
> | Structural §6.1 | #82 | Payday step list: fund, then pot moves indented beneath, numbered per person; "See N items" opens filtered Plan; destination detail screen retired |
> | Structural §6.5 | #83–#87 | Design tokens: dead CSS out, colour/status/shadow/radius tokens, type scale with a 14px floor, spacing scale, three breakpoints. A CI guard keeps the stylesheet on them |
| Structural §6.3 | #88–#89 | Desktop sidebar is Plan · Transfers · Household; Plan and Transfers are separate full-width screens at every width; desktop Plan grouped by category only; desktop Category filter now filters |
| Structural §6.9 | #90 | Matrix dropped on phones: phone Transfers is the person switch and the step list; desktop keeps the destination table |
> | Structural §6.6 | #91–#93 | `MonthlyBudget.tsx` split into `TransfersPanel`/`TransferTable`, `MonthControl`, `IncomeDialog`, `PlanFilters`, `PlanTable` and a pure `planRows`; no visible change |
> | Structural §6.8 | #94 | Manage as ARIA tabs (Accounts / Pots / Categories): accounts flat in owner order with an owner chip, pots A–Z |
> | Structural §6.7 | #95–#96 | Setup is Household → Adults → Pay (pay per adult, skippable), and it lands on a Plan that says “Start your plan” and offers Add income when there is none |
> | Structural §6.10 | #97–#100 | Four words on screen: Available · Planned · Funding · Move, with the balance as “£X over / £X left / Balanced”. Explanatory text cut hard on every screen. `src/copy.vocabulary.test.ts` fails CI on retired terms |
>
> Of the 39 findings: **37 fixed** and **2 partly fixed**. None are open. The contrast pass is now enforced in CI. The *Status* column in §2 has the detail. A post-#75 audit found 9 further issues, some caused by the first round; all are fixed (see *Found after the review*, below §5).
>
> **Next:** nothing planned from this review.

01

## The five things making it feel clunky

1. ### The app opens on the wrong screen for the job you do most

   A cold open lands on **Plan**. Payday — the routine where you just want to know what to move where — starts one tap behind, then hands you £7,641.87 “Funding total” as the hero. Nobody transfers £7,641.87. It is the one number on the screen that cannot become an action.

   From there, assembling Ada’s actual list takes **four round trips into four destination screens** — roughly 9 taps and 8 scrolls to collect 7 numbers — because her account amounts live in the list, her pot movements live only inside each detail screen, and nothing holds the result together.

   > **Now:** fixed. A cold open returns to the last view used (#79). The person switch and a personal hero are in (#81). The round trips are gone: every step is on one screen, in order, and the destination detail screen is retired (#82). New users still default to Plan.
2. ### Desktop has no Transfers screen — the nav is lying

   `budgetView=plan` and `budgetView=transfers` render **byte-identical pages** at 1440 px. The sidebar only offers Household and Budget; Plan/Transfers is a mobile-only concept that the URL still carries. So a link you send from your phone silently means something else on the laptop.

   Worse, the merged workspace puts the dense payday table in the left column inside its own 762 px scroller with 1168 px of content, while the right 45% of a 1440 px screen sits empty below three collapsed rows. The widest screen gives the most important content the least room.

   > **Now:** fixed. The desktop sidebar offers Plan · Transfers · Household, like the phone, and the two URLs are two screens at every width (#88). Each gets the full width: no boxed-in payday table.
3. ### “See the consequence before you commit” is the product’s best idea, and it’s below the fold

   Measured on the quick amount edit at 375×812: Save sits at y=691, the impact block starts at y=801. The affected month range and the −£1,141.87 → −£1,316.40 balance change are off-screen at the exact moment you decide. The full editor does the same thing inside its 611 px dialog body.

   You built the honest-about-consequences machinery and then put it where nobody looks.

   > **Now:** fixed. The quick edit shows its impact above Save (#77). The full editor now shows scope and impact in its sticky footer, directly above Save, at both widths: at 375×812 the impact is at y=616–742 and Save at y=752 (#80). Both removal confirmations show the balance change (#80).
4. ### Disclaimers outrank data everywhere

   “After account funding: … Included in account funding, not an extra contribution.” appears **five times verbatim** on one desktop screen. Those note rows are 355px of the transfer table’s 739px — **48% of its height is repeated boilerplate**. On mobile a 36-word “Sources are unspecified…” paragraph sits between the summary and the first number on every single visit, and again inside every detail screen.

   The caveats are all true. Saying them every time is what makes the app feel heavy, and it trains people to skip the one place a caveat actually matters.

   > **Now:** fixed. One line under the table replaces the five note rows (#75). The disclaimer is "Planned amounts, not payments." with an ⓘ, and it's hidden when a real warning is showing (#75). Matrix view no longer repeats it (#78).
5. ### There is no design system, so nothing can be consistent

   110 distinct hex colours against 8 colour tokens. 19 distinct breakpoints across 65 media queries in one 1,279-line stylesheet. No spacing, radius, type-scale or status tokens exist at all — and **the three most-used font sizes in the entire app are 12px, 13px and 11px**, with 8px and 9px also in play.

   That’s why the same action is “Add item” in one place and “Add budget item” six inches away, why Owner and Category selects on mobile Plan have different widths, heights and background colours, and why three destructive actions still use a raw `window.confirm`.

   > **Now:** the symptoms are fixed: one "Add item" (#72), matching selects (#74), `ConfirmDialog` instead of `window.confirm` (#77). Contrast is locked into CI (#79). The tokens are in (#83–#87): one `:root` block, three breakpoints, a 14px body floor, and `src/styles.tokens.test.ts` failing CI on any raw colour, radius, shadow, font size, spacing value or breakpoint.

02

## Findings

Ordered by flow. Severity is impact on the household actually getting the job done; effort is S (\<½ day), M (1–3 days), L (≥1 week). Figures are in §3.

### Payday run-through

| Screen / flow | Issue | Fix | Fig | Sev | Eff | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Cold open | Lands on Plan. The most frequent job starts a tap behind and on the wrong screen. | Remember the last budget view in `localStorage` and restore it. Default new users to Transfers in the second half of the month. | — | High | S | ◐ #79 restores the last Plan/Transfers view per device. New users still default to Plan (no second-half-of-month rule). |
| Transfers (mobile) | Hero is the household total £7,641.87 — an un-actionable number. There is no “who am I?”, so every row shows both people and you filter mentally. | Add a person switch (`Ada · Ben · Both`) persisted per device. Make the hero “Ada moves £4,429.66 in 6 steps”. | [03](#fig03) | High | M | ✅ #81: Ada · Ben · Both, asked once and remembered per device; hero "Ada moves £4,429.66 · 8 steps" (accounts funded plus pot moves) |
| Transfers (mobile) | Pot movements — stage 2 of the two-stage model and half the actual work — appear nowhere in the list. They exist only inside each account’s detail screen. | Render funding and pot movements as one ordered step list on the main screen, indented under their parent account. | [03](#fig03) [04](#fig04) | High | M | ✅ #82: one numbered list per person; pot moves indented under their account, with captions for money another person moves on |
| Transfers (mobile) | Grouped by *account owner*, which is not who pays. “Ada · Starling · Current account” is funded £436.70 by Ben — the heading actively misleads on this job. | Group by the person who performs the step, not the account owner. Keep ownership as row metadata. | [03](#fig03) | Med | M | ✅ #81: grouped by payer; the owner leads each row label |
| Destination detail | Dead end: “Back to Transfers” is the only exit, bottom nav is hidden, no next/previous destination. Four accounts = four full round trips. | If the step list lands, delete this screen. If it stays, add “Next destination ›” and keep a progress line (“2 of 4”). | [04](#fig04) | Med | M | ✅ #82: screen deleted; “See N items” opens Plan filtered to the account, and Back returns to the step |
| Destination detail | The pot total (Bills £1,291.05) is set larger and bolder than the amount you actually move (Ada £682.36). Hierarchy is inverted. | Promote the per-person amount to the row’s primary figure; demote the pot total to a subtotal caption. | [04](#fig04) | Med | S | ✅ #78: "Ada moves £682.36" leads; the pot total is a caption |
| Matrix preview | A horizontally scrolling 12-row table on a 375px phone, under four stacked headings (“Planned contributions” / “Funding requirements · exact amounts” / an ⓘ / “Scroll sideways…”). Four rows visible, Total column off-screen. | Drop the matrix on phones; it is a desktop comparison tool. Keep it ≥768px. If it must stay, collapse to one heading and freeze the Total column instead of the Destination column. | [05](#fig05) | Med | M | ✅ #90: dropped on phones. Desktop keeps the destination table |
| Matrix preview | Toggle changes label, affordance and position between states: “Preview matrix” (outlined button, above) ⇄ “Account view” (text link, inline right). | One segmented control, fixed position: `List \| Matrix`. | [05](#fig05) | Low | S | ✅ #75: List \| Matrix |
| Matrix preview | Provider name renders twice for sole-owned accounts — “Starling / Starling”, “Nationwide / Nationwide”. | Collapse the provider band when it is the only child of the owner band. | [05](#fig05) | Low | S | ✅ #75 merges the bands; #78 aligns them |

9 findings · now 8 fixed · 1 partly

### Plan a month

| Screen / flow | Issue | Fix | Fig | Sev | Eff | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Item editor → destination | **Bug / dead end.** “Change” then the “Owners” crumb wipes the item’s saved destination with no undo, no cancel, and no record of what it was. The only buttons left are Joint/Ada/Ben. Saving errors with “Choose an account or pot destination.” for something you never intended to change. Escaping means Cancel — losing every other edit. | Don’t clear the selection until a new one is confirmed. Add “Keep current destination” as the first control on every picker step, and show the existing value in the breadcrumb. | [10](#fig10) | High | S | ✅ #70 |
| Quick amount edit | Impact preview renders below the fold (y=801 of 812) while Save sits at y=691. You commit without seeing the affected range or the balance change. | Move the scope line and balance delta above the input; put Save/Cancel last. Or make the inline editor a bottom sheet with the consequence pinned above the buttons. | [08](#fig08) | High | S | ✅ #77: impact above Save; the form scrolls clear of the nav. No bottom sheet. |
| Quick amount edit | Save and Cancel are two identical grey buttons. Every other primary action in the app is filled pine. | Filled pine Save, text-button Cancel. | [08](#fig08) | Med | S | ✅ #73: filled pine Save. Cancel is an outlined secondary button, not a text button. |
| Quick amount edit | The old value £325.47 stays on screen, still underlined, directly above the input holding the new value. Two amounts, one stale. | Replace the amount button with the input in place. | [08](#fig08) | Med | S | ✅ #73: the input replaces the amount in its cell |
| Plan table (desktop) | Two levels of accordion, both collapsed on every load, before a single item is visible. The top level is near-useless: “Joint — 32 items” holds 32 of 40. | Expand everything by default and persist collapse state. Drop owner grouping on desktop — it is already a column — and group by category only. | [02](#fig02) | High | M | ✅ #74: expanded by default, collapse state kept per tab. #89: grouped by category only on desktop; the Category filter now applies there too. |
| Plan rows (mobile) | Every row repeats its destination in full — “Bills · Joint · Monzo · Current account” — seven times in a row, inside a group already headed “Joint · Home”. The meta line is longer than the content. | Show the funding rule only; move destination into a group band, since rows are already grouped by it in practice. The scoped view already does this — make it the default. | [06](#fig06) | Med | S | ✅ #76: "Income ratio · Bills pot". Kept a short destination rather than moving it all to the band. |
| Plan rows (mobile) | \~170px per row for one name and one number — about 4½ items per screen, so 40 items is \~9 screens of scrolling. | With the destination line gone, target \~96px rows. Name and amount on one line, funding rule as a small chip. | [06](#fig06) | Med | S | ✅ #76: 85px → 59px at 375px wide |
| Plan rows | Item name and amount are both underlined and do different things (full editor vs inline edit). Nothing distinguishes them. Item-name hit areas are as narrow as 21×44px (“Vet”). | Make the whole row open the editor; give the amount a visible input affordance (bordered field with a pencil). Stretch the name target to the row width. | [06](#fig06) | Med | S | ✅ #73 widened the name; #76 made the whole row tappable and gave the amount a pencil and border |
| Plan balance (mobile) | The loudest element on the screen is £1,141.87 over budget in red, with no context for what it is over. The spec says don’t add alarming language to routine work. | “Planned £7,641.87 of £6,500.00 available · £1,141.87 over” in normal weight, with the overage in the status colour only. | [06](#fig06) | Med | S | ✅ #72, #79: "Planned … of … · £X over", normal weight |
| Add budget items | Opens with the primary button reading **“Save 0 items”** and the footer reading “0 items · Monthly total £0.00”. The form greets you by telling you you’ve done nothing. | Label it “Save item” until a second row exists, then “Save 2 items”. Footer should read “Nothing added yet”. | [09](#fig09) | Med | S | ✅ #73, #77: "Save item"; footer reads "Nothing added yet" |
| Item editor | Category and Frequency are buried in a disclosure. The amount field is labelled just “Amount”, so you cannot tell whether 325.47 is monthly or annual without opening it. | Promote Category to the main form (it drives the grouping people browse by). Label the field “Monthly amount” / “Annual amount” with a £ prefix. | [10](#fig10) | Med | S | ✅ #73: Category promoted; Frequency stays in More details |
| Item editor | “Estimated monthly contributions” over figures that are exact to the penny by contract (£162.74 / £162.73). | “Monthly contributions”. | [10](#fig10) | Low | S | ✅ #73 |
| Remove item · remove budget date · discard draft | Three raw `window.confirm()` dialogs. Unstyled, unbrandable, and on iOS they read as a Safari system alert in the middle of a careful app. | One `<ConfirmDialog>` component reusing the existing dialog shell, with the scope sentence as body copy. | — | Med | S | ✅ #77: `ConfirmDialog` |
| Empty month | Search box and two filters render above an empty table with nothing to filter — and the screen offers “Add item” and “Add budget item” as two labels for the same action, 400px apart. | Hide search and filters below \~5 items. Pick one label: “Add item”. | — | Low | S | ✅ #72, #74 |
| Plan table (sticky) | The sticky group band overlaps the row beneath it; the top row’s name sits under the band while its amount shows above. | Add `scroll-margin-top` equal to the band height on row elements. | [07](#fig07) | Low | S | ✅ #74: the rule already existed; it now uses the rendered band height |

15 findings · now 15 fixed

### Income, shared structure, setup & cross-cutting

| Screen / flow | Issue | Fix | Fig | Sev | Eff | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Income editor | **Bug.** The sticky action bar (y 722–794) floats over the scrolling body, obscuring the “Add recurring income source” fieldset (y 531–931). Source name and Classification render underneath Cancel/Save. | Add bottom padding to `.budget-v3-panel` equal to the action bar’s height. | [11](#fig11) | High | S | ✅ #70 |
| Income editor | A 40-word paragraph before the first field, then “Changes apply: November 2026 onward.” three times on one short screen. No £ prefix on amounts. | Cut the intro to “Income changes don’t create a budget date.” Show the range once per section, not per field. Add the £ prefix. | [11](#fig11) | Med | S | ✅ #72, #79: short intro with ⓘ, range stated once, £ prefix |
| Income discoverability | Transfers is where you notice income is wrong, but on mobile income is only reachable via a link called “Month options” — which says nothing about income. | Rename the control “Month & income”, or surface “Edit income” directly in the Transfers summary. | [03](#fig03) | Med | S | ✅ #72: "Month & income". #75 also puts Edit income in the Transfers warning. |
| Incomplete allocations | The warning lists all 20 unfunded item names as one comma-separated wall of text — 7 lines you cannot act on. Below it, the generic “Sources are unspecified…” disclaimer competes for the same attention. | “20 items have no funding rule that can be calculated.” + a “Show items” disclosure + the “Edit income” action. Suppress the generic note whenever a real warning is present. | [13](#fig13) | Med | S | ✅ #75, #78: "20 items can't be funded yet." + Show items + Edit income; generic note hidden |
| Incomplete allocations | Unresolved accounts still show a big confident £0.00 (“Ada · Starling”), with “No contribution allocated” in small grey. The rules doc explicitly says a missing calculation must not read as a completed zero. | Render “—” with “Not calculated” in the status colour. Reserve £0.00 for a genuine zero. | [13](#fig13) | Med | S | ✅ #78: "Not calculated" / "—" |
| Manage accounts, pots & categories | Three collapsed rows fill a whole screen. Reaching one account is three levels of disclosure (Accounts → Joint → account). Counts 4/5/6 are unlabelled right-aligned grey digits. Disclosure markers are native `▸` glyphs, far below any touch target guidance. | Open on a tabbed list (Accounts / Pots / Categories) with accounts listed flat and the owner as a chip. Label counts (“4 accounts”). | [12](#fig12) | Med | M | ✅ #72 labels the counts; #94 adds the tabbed flat list (§6.8). |
| Manage… modal | Title says “accounts, pots *and* categories”; the button that opens it says “accounts, pots *&* categories”. Only exit is a secondary “Done”. | Pick one. Add a close ×. | [12](#fig12) | Low | S | ✅ #72 (&); #77 adds a close × beside Done |
| Setup | Ends at “Continue to Budget” and drops you on an empty Plan with no income, no accounts, no categories — the three things you now need. No validation hint that at least one adult is required; nothing explains that adults drive the funding split. | Make it a three-step flow: Household → Adults → First income. Then land on Plan with a “Add your first budget item” prompt. | [14](#fig14) | Med | M | ✅ #95: Household → Adults → Pay, which explains the split and can be skipped. #96: Plan says “Start your plan”, with Add income when there is none. |
| Setup | Disabled Plan and Transfers tabs are visible from the very first screen — a greyed-out promise before you’ve done anything. | Hide the bottom nav until setup completes. | [14](#fig14) | Low | S | ✅ #79: no nav until setup is complete |
| Page frame | Two `<h1>`s on every page: “Plan” (mobile header) and “Budget your month” (page frame). On desktop “Budget your month” is the single largest element on screen — an instruction, not a label, eating the top 110px. `PageFrame` also accepts a `description` prop it never renders, so the copy “Plan the items you want to fund…” is silently discarded. | One h1 per page, naming the screen. Delete the dead prop and the instruction title; give the space to the month and the balance. | [01](#fig01) | Med | S | ◐ #72 removed the title and the dead prop. On phones, screen readers still get two h1s (header "Plan" + hidden "Monthly budget"). |
| Summary tiles (desktop) | “Available this month £6,500.00” and “Employment split basis £6,500.00” are the same number under two names — one of them jargon. The ⓘ explaining it is a 15×13px target. | Fold it into the Available tile: “£6,500.00 available · all from employment”. Make any ⓘ a 44px target. | [01](#fig01) | Med | S | ✅ #72, #78: "all from employment" / "no income yet"; 44px ⓘ |
| Vocabulary | Eleven names for roughly four concepts: Funding total, Transfers by destination, Monthly plan by person, Planned contributions, Account funding, Allocation breakdown, Funding requirements, Available, Planned budget, Budget balance, Employment split basis. | Fix a four-word glossary — *Available, Planned, Funding, Movement* — and use nothing else in the UI. | — | Med | M | ✅ #72 unified "Add item" and "&". #97–#100: Available · Planned · Funding · Move, glossary in the product spec, CI guard on retired terms. |
| Filters | Mobile Plan has Owner *and* Category filters; desktop Plan hides Category — despite grouping by it. The two mobile selects differ in width, height and background colour. | Same filters both widths; one `.filter-select` class. | [06](#fig06) | Low | S | ✅ #74: shared `.budget-v3-filter-select` |
| `src/styles.css` | 1,279 lines, 1,185 rules, 13 `!important`, 110 hex colours against 8 tokens, 19 breakpoints, \~14 radius values, and a type scale whose top three entries are 12px / 13px / 11px (plus 8px and 9px). | Define spacing, radius, type and status tokens; collapse to 3 breakpoints (640 / 768 / 1100); set the body size floor at 14px and secondary at 13px. | — | High | L | ✅ #83–#87: 1,001 lines with 8 `!important`. One `:root` block holds 32 colour tokens (incl. status ok/review/error), 4 shadows, radius 4/8/14/pill, type 11/13/14/16/20/28 + display, and spacing 4–32. Breakpoints are 640/768/1100 plus the landscape-phone query. Enforced by `styles.tokens.test.ts`. |
| `MonthlyBudget.tsx` | 335 lines carrying \~30 pieces of state, with the entire search/owner/category control block duplicated verbatim across the scoped and unscoped branches. `TransferCalculationNotes` emits the same 19-word sentence per pot row. | Extract `<PlanFilters>`, `<TransferTable>`, `<PlanTable>`. Hoist the pot note to one line under the table. | — | Med | M | ✅ #74 removed the duplicate filter block; #75 hoisted the pot note; #91–#93 split the component (§6.6). The page is now 164 lines and 14 `useState`. |
| Contrast | No failures. Every text/background pair passes AA at both widths in both views. | Keep it. Add the check to CI before the token refactor changes colours. | — | Pass | S | ✅ #79: `src/styles.contrast.test.ts` runs in CI |

16 rows · now 14 fixed · 1 partly · contrast pass enforced in CI

39 findings + 1 pass across all three tables · status key: ✅ fixed · ◐ partly fixed · ○ open

03

## Evidence

![North desktop Budget workspace at 1440px: a large heading reading Budget your month, a People and transfers table in the left column, and a mostly empty right column with three collapsed rows.](fig01-desktop-workspace.jpg)

**Fig 01 · 1440px** Transfers URL, Plan URL — identical output. Title dominates; the payday table is boxed into the left column.

![Desktop plan table with the Joint group expanded, showing six collapsed category rows and no budget items.](fig02-desktop-accordion.jpg)

**Fig 02 · 1440px** One accordion expanded. Still zero items visible.

![Mobile Transfers screen showing Funding total £7,641.87, a Preview matrix button, a four-line disclaimer, then account rows.](fig03-mobile-transfers.jpg)

**Fig 03 · 375px** Household total as hero; one and a bit actionable rows above the fold.

![Destination detail screen for Monzo Current account showing funding total, a disclaimer, an allocation breakdown and a pot movement note.](fig04-destination-detail.jpg)

**Fig 04 · 375px** Disclaimer repeated; pot total outweighs the amount you move.

![Mobile matrix preview showing four stacked headings above a horizontally scrolling table with the total column cut off.](fig05-matrix.jpg)

**Fig 05 · 375px** Four headings, then a sideways table with the Total column off-screen.

![Mobile Plan screen with a red over-budget figure, search, two mismatched filter selects and budget rows repeating the same destination string.](fig06-mobile-plan.jpg)

**Fig 06 · 375px** Red hero; mismatched selects; identical destination string on every row.

![Scrolled plan table where the sticky group band overlaps the Electricity row, hiding its name while the amount shows above.](fig07-sticky-clip.jpg)

**Fig 07 · 375px** Sticky band clipping the row beneath it.

![Inline amount edit with the old amount still visible above the input and two identical grey Save and Cancel buttons; the impact preview is off-screen.](fig08-inline-edit.jpg)

**Fig 08 · 375px** Save at y=691. Impact preview begins at y=801.

![Add budget items dialog whose primary button reads Save 0 items and footer reads 0 items, Monthly total £0.00.](fig09-add-item.jpg)

**Fig 09 · 375px** “Save 0 items” on open.

![Edit budget item dialog where the destination has been replaced by a Choose an owner step with only Joint, Ada and Ben buttons and no way back.](fig10-picker-deadend.jpg)

**Fig 10 · 375px** Two taps after opening the editor, the destination is gone with no route back.

![Income dialog where the Cancel and Save income buttons float over the Add recurring income source fieldset, cutting off a field.](fig11-income-overlap.jpg)

**Fig 11 · 375px** Action bar sitting on top of the form it belongs to.

![Manage accounts, pots and categories modal showing only three collapsed rows on an otherwise empty screen.](fig12-management.jpg)

**Fig 12 · 375px** A whole screen for three rows.

![Transfers screen with a seven-line warning listing twenty item names, followed by the generic disclaimer paragraph.](fig13-unresolved.jpg)

**Fig 13 · 375px** Twenty names as prose, then the generic caveat underneath it.

![Setup screen with a household name field, an empty Adults card and a Continue to Budget button, with disabled Plan and Transfers tabs below.](fig14-setup.jpg)

**Fig 14 · 375px** Setup ends here and drops you on an empty Plan.

04

## Before / after — the three worst flows

### A · Payday run-through

Ada opens the app after payday and wants to know what to move, where, in what order.

Before

1. App opens on **Plan** — wrong screen.
2. Tap **Transfers**.
3. Read £7,641.87 — not her number.
4. Read the 36-word disclaimer.
5. Tap **Monzo · Current account**.
6. Scroll past the same disclaimer; find £2,215.45, £682.36 → Bills, £1,000.27 → Holidays, in three different places.
7. **Back to Transfers.**
8. Repeat 5–7 for Savings, Starling, Nationwide.
9. Hold seven numbers in her head. Nothing records what she’s done.

≈9 taps · ≈8 scrolls · 4 dead-end screens · 0 sense of progress

After

1. App reopens on **Transfers**, person switch already on **Ada**.
2. Hero reads **“Ada moves £4,429.66 · 6 steps”**.
3. Every step is on one screen, in order: fund the account, then move into its pots, indented beneath it.
4. Scroll once. Done.

```
November 2026          [ Ada ] Ben  Both

Ada moves  £4,429.66        6 steps
─────────────────────────────────────
① Fund  Monzo · Current      £2,215.45
   └ move to Bills             £682.36
   └ move to Holidays        £1,000.27
② Fund  Monzo · Savings        £704.75
   └ move to Emergency         £704.75
③ Fund  Starling · Current     £698.72
   └ move to Spending        £1,135.42  ⓘ
─────────────────────────────────────
Planned, not paid. Sources unknown.  ⓘ
```

1 tap · 1 scroll · 0 round trips

> **Now (9 Nov):** done (#79, #75, #81, #82). The app reopens on the last view, the switch remembers Ada, and the hero reads “Ada moves £4,429.66 · 8 steps”. Every step is numbered on one screen (1–8, so the count matches; the mockup numbered accounts only). Ada’s Spending move says “Includes £436.70 from Ben”. Accounts that need review are withheld from the steps and listed after them. There is no tick-off: the transfer rules record no payment state.

### B · Change one item’s amount

The most common edit in the app, and the one where consequences matter most.

Before

1. Tap the underlined amount — nothing says it’s editable.
2. Old value stays on screen above the new input.
3. Type the new amount.
4. Two identical grey buttons. Save is not the primary.
5. The affected range and the balance change are **below the fold**.
6. Save blind.

Consequence shown, never seen

After

1. Tap the row’s amount field — it looks like a field.
2. It becomes a bottom sheet; the row stays visible behind it.
3. Scope and balance delta sit *above* the buttons, updating live.
4. Filled pine Save, text Cancel.

```
╭───────────────────────────────────╮
│ Groceries · monthly amount        │
│  £ [ 500.00              ]        │
│                                   │
│  Applies Nov 2026 – Feb 2027      │
│  Balance  −£1,141.87 → −£1,316.40 │
│  Ada +£87.27   Ben +£87.26        │
│                                   │
│  [        Save        ]   Cancel  │
╰───────────────────────────────────╯
```

Same clicks, decision now informed

> **Now (9 Nov):** done, without the bottom sheet. The amount looks like a field, with a border and pencil (#76). Typing replaces it in place (#73). Scope and balance change sit above a filled Save (#73, #77), and the form scrolls clear of the mobile nav, so all three are on screen at 375×812 (#77).

### C · Change an item’s destination

Currently unfinishable without losing data. This is the one to fix first.

Before

1. Open the item. Destination shows “Joint · Monzo · Current account · Bills”.
2. Tap **Change** → lands on step 3 (pots), not the start.
3. To change the account, tap the **Owners** crumb.
4. **The saved destination is wiped.** No undo, no cancel, no record of what it was.
5. Save → “Choose an account or pot destination.”
6. Only escape is Cancel — losing the name and amount edits too.

Dead end · silent data loss · forced restart

After

1. Tap **Change** → the picker opens showing the current value as the selected state at every level.
2. Stepping back never clears the selection; it is only replaced on confirm.
3. “Keep current destination” is always the first control.

```
Destination
Owners › Joint › Monzo · Current

  ← Keep: Bills  (current)
  ─────────────────────────
  Use account directly
  ( Bills )  Holidays   + Add pot
```

No state lost at any step

> **Now (9 Nov):** fixed in #70 as designed. Every step has "← Keep current", current choices are marked, and browsing back never clears the saved destination.

05

## Quick wins

Copy and small UI only. No data model, no navigation, no new components. All of this is a day or two together and it will change how the app feels more than any single structural change.

> **Status:** all shipped across #70 and #72–#75. The review suggested one PR so the vocabulary landed together; it went out as four PRs grouped by screen, with all the shared wording in #72.

#### Copy

✅ #72 · PlanBudget your month → delete the page title entirely — it’s an instruction, and “Plan” already appears above it

✅ #72 · PlanAdd budget item / Add item → Add item everywhere

✅ #72 · PlanEmployment split basis → fold into “Available”: “£6,500.00 available · all from employment”

✅ #72, #79 · Plan£1,141.87 over budget → Planned £7,641.87 of £6,500.00 · £1,141.87 over

✅ #73 · EditorEstimated monthly contributions → Monthly contributions (they’re exact by contract)

✅ #73 · EditorAmount → Monthly amount / Annual amount, with a £ prefix

✅ #73, #77 · EditorSave 0 items → Save item until a second row exists

✅ #73 · EditorMore details · Home · Monthly → move Category out; leave Frequency and notes

✅ #75 · TransfersPreview matrix / Account view → one segmented control: List | Matrix

✅ #75 · TransfersFunding includes the allocations below. Sources are unspecified; money already in the account may not need transferring. Automatic payments and payment status are not recorded. → Planned amounts, not payments. + an ⓘ holding the rest

✅ #75 · TransfersAfter account funding: Ada moves £682.36; Ben moves £608.69 into this pot. Included in account funding, not an extra contribution. (×5) → one line under the table: Pot movements are already inside each account total.

✅ #75, #78 · TransfersIncomplete allocations. Needs funding: Gas, Water, Broadband, … Charity. → 20 items can’t be funded yet. + “Show items” + **Edit income**

✅ #72 · IncomeIncome changes are independent of budget dates. Employment income sets proportional shares; … → Income changes don’t create a budget date.

✅ #72 · IncomeAda · Salary (employment) → Ada — Salary · Employment

✅ #72 · Manageaccounts, pots and categories vs accounts, pots & categories → pick & and use it in both places

✅ #72 · Manage4 / 5 / 6 → 4 accounts / 5 pots / 6 categories

✅ #72 · MonthMonth options → Month & income

#### Small UI

- ✅ #70 (as `scroll-padding-bottom`: the overlap came from focused fields, not the end of the form) · Add bottom padding to `.budget-v3-panel` equal to the sticky action bar height. **Fixes the income form overlap.**
- ✅ #72 · Give the ⓘ buttons a 44px hit area (`15×13px` today).
- ✅ #73 · Make inline-edit Save a `primary-button`.
- ✅ #73 · Replace the amount-button with the input in place, so the stale value disappears.
- ✅ #73 · Stretch the item-name button to row width (`21×44px` today on “Vet”).
- ✅ #74 (the rule existed; it now uses the rendered band height) · `scroll-margin-top` on plan rows equal to the sticky band height.
- ✅ #74 · Expand plan groups by default; persist collapse state in `sessionStorage`.
- ✅ #74 · Hide search and filters when a month has fewer than \~5 items.
- ✅ #74 · Show the Category filter on desktop, or drop it on mobile. Give both selects one class.
- ✅ #75 · Collapse the duplicated provider band in the matrix (“Starling / Starling”).
- ✅ #72 · Delete the unused `description` prop from `PageFrame`, or render it.
- ✅ #75 · Suppress the generic disclaimer whenever a real warning is on screen.

#### Found after the review

A post-#75 audit (code read plus Playwright at 375×812 and 1440×900, including a zero-income month) found these. Some were caused by the first round. All are fixed.

| Issue | Cause | Fixed in |
| --- | --- | --- |
| A zero-income month read "£0.00 · all from employment" | #72's `availableBasis` | #78: "no income yet" / "none from employment" |
| Unfunded warning: loose padding, lost "Show items" marker, bordered Edit income button on desktop | #75 | #78 |
| The quick-edit label sat below the input it names | #73 moved the input into the cell | #77: label is screen-reader only |
| Income intro set larger than body text; ⓘ wrapped onto its own line | #72 | #79 |
| The "X moves …" line repeated the figures above it on the detail screen | #75 | #78: movements became the primary rows |
| Merged matrix bands ("Ada · Starling") indented 22px further than other owners | #75 | #78 |
| Matrix view stacked two caveat lines, each with an ⓘ | #75 | #78 |
| Fixed-contribution amounts sat higher than the item name | existing (button margins) | #76 |
| The compact sticky band dropped its "N items · £X" count | existing | #76 |
| The desktop Category filter was visible but filtered nothing | #69 applied it on mobile only; #74 showed it on desktop | #89 |

Other small fixes from §2 that weren't in this list are also shipped: cold open (#79), `ConfirmDialog` (#77), "Not calculated" (#78), detail hierarchy (#78), compact rows and whole-row tap (#76), setup nav (#79), Manage close × (#77), and contrast in CI (#79).

06
## Structural changes

These need design decisions, not just edits. Listed separately because none of them should be started while the quick wins are outstanding.

> **Status (9 Nov):** the quick wins and small fixes are done, so these are unblocked. All ten are done (#82, #81, #88–#89, #80, #83–#87, #91–#93, #95–#96, #94, #90, #97–#100). Items 8–10 are open M-effort findings from §2, added here so this list is the full backlog.

1. **A real payday view.** One ordered step list per person, funding then pot movements, replacing the account-list → detail-screen round trip. This is the single biggest change to how North feels. *Now:* ✅ done (#82). Steps are numbered per person, pot moves are indented under their account, and the detail screen is gone. “See N items” opens Plan filtered to the account.
2. **A person switch.** Persisted per device. Everything in Transfers filters to “me” by default. Unlocks most of the payday improvement on its own. *Now:* ✅ done (#81). A device is asked once, then remembered. The hero is personal, and the list is grouped by who pays. §6.1 built the ordered step list on it (#82).
3. **Decide what desktop Transfers is.** Either give it its own layout — a full-width comparison table, no Plan — or remove Plan/Transfers from the URL at desktop widths so the nav stops promising something it doesn’t deliver. *Now:* ✅ done, own layout (#88, #89). The sidebar matches the phone's three destinations, Transfers is people plus the destination comparison at full width, and desktop Plan groups by category only.
4. **Consequence-before-commit as a pattern.** One component, always directly above the confirming button, used by the inline editor, the full editor, and the two removal confirmations. *Now:* ✅ done. `ImpactPreview` (#80) is the one component. It sits above Save in the quick edit and in the full editor's footer, and forms the body of the remove-item and remove-budget-date confirmations.
5. **Design tokens.** Spacing (4/8/12/16/24/32), radius (4/8/14), type (11/13/14/16/20/28 with 14 as the body floor), and status (ok/review/error). Collapse 19 breakpoints to 3. *Now:* ✅ done (#83–#87).
   - #83 removed 149 unused classes.
   - #84 added colour, status, shadow and radius tokens, and moved the contrast test onto them.
   - #85 added the type scale. Secondary text is 13, the Plan table and buttons 14, and 11 is only for uppercase labels.
   - #86 added the spacing scale.
   - #87 brought breakpoints down to 640/768/1100, with `src/breakpoints.ts` for script. The two-column monthly page now starts at 1100.

   `src/styles.tokens.test.ts` keeps it this way.
6. **Break up `MonthlyBudget.tsx`.** `<PlanFilters>`, `<PlanTable>`, `<TransferTable>`, `<ConfirmDialog>`. The duplicated filter block goes away for free. *Now:* ✅ done (#91–#93), with no visible change. `TransfersPanel` and `TransferTable` hold the Transfers side. `MonthControl` and `IncomeDialog` stand alone, and Cancel now discards a half-typed new income source. The Plan is `PlanFilters`, `PlanTable` (collapse and quick edit) and a pure, tested `planRows`. `ConfirmDialog` came earlier (#77). The page is down from 54 KB and ~28 `useState` to 23 KB and 14.
7. **Setup as a short wizard.** Household → Adults → First income, landing on a Plan that knows it’s empty. *Now:* ✅ done (#95–#96). Setup is three steps with a progress row: the household name, then the adults (with a line on how shared items are split), then one take-home pay field per adult, saved as Employment income from that month. Pay can be skipped. A reload resumes at the first unfinished step. A household with no items anywhere lands on “Start your plan” with *Add your first budget item*, and *Add income* while there is none. The nav stays hidden until setup is done (#79).
8. **Manage as a flat, tabbed list.** Accounts / Pots / Categories tabs, with accounts listed flat and the owner as a chip, instead of three nested disclosures. *Now:* ✅ done (#94). Tabs sit in the sticky header with their counts. Accounts are one flat list in owner order with an owner chip, and pots are one A–Z list by name, each with its owner chip and account. Counts were labelled in #72 and the close × added in #77.
9. **Matrix on phones.** Drop it below 768px, or collapse it to one heading and freeze the Total column. *Now:* ✅ done, dropped (#90). The matrix only ever rendered on phones, so it is gone. Phone Transfers is the person switch and the step list, and desktop keeps its destination table. The pot-level hand-off into Plan went with it, but the steps' “See N items” remains.
10. **A four-word vocabulary.** *Available, Planned, Funding, Movement*, and nothing else in the UI. *Now:* ✅ done (#97–#100). The UI uses **Available · Planned · Funding · Move**. The balance reads “£X over”, “£X left” or “Balanced” everywhere, including the impact preview. Fixed-rule items have “Fixed amounts”, with the remainder “unassigned”. “Transfers” is only the screen name. Explanatory text was cut hard at the same time: no “Later saved budgets stay unchanged.”, the details dialogs are one or two lines, and confirms don't repeat their titles. The glossary is in `product-design-spec.md`, and `src/copy.vocabulary.test.ts` fails CI on retired terms.

07

## Suggested order

1. Now · ½ day

   #### The two bugs ✅ #70

   Destination picker state loss, income form overlap. One is data loss in the most common editor; the other makes a form partly unusable. Nothing else should go first.
2. Week 1

   #### Every quick win in §5 ✅ #72–#75, then the remaining small fixes ✅ #76–#79

   All copy, plus the twelve small UI fixes. Cheap, independent, and together they remove most of the “heavy” feeling. Do them as one PR so the vocabulary lands consistently.
3. Week 1–2

   #### Consequence above the button ✅ #80

   One impact component, placed above Save in the inline editor and the full editor, and used as the body of both removal confirmations. Replaces the three `window.confirm` calls at the same time.

   *Now:* the `window.confirm` calls are already gone (`ConfirmDialog`, #77), and the inline editor already puts the impact above Save. #80 finished it: one `ImpactPreview` above Save in both editors, and as the body of both removal confirmations.
4. Week 2–3

   #### Person switch ✅ #81, then the payday step list ✅ #82

   Ship the switch first — it is useful on its own and de-risks the step list. Then build the ordered funding-then-pots list and retire the destination detail screen.
5. Week 3–4

   #### Design tokens and the breakpoint collapse ✅ #83–#87

   Do this after the payday work, not before: it touches every screen, and you want the new layouts settled first. Lock the contrast check into CI before you start, since today it passes everywhere.

   *Now:* done. Contrast went into CI first (#79), then the five token PRs.
6. Week 4+

   #### Desktop Transfers ✅ #88–#89, then plan density, setup wizard ✅ #95–#96

   The remaining structural items. Desktop first — it is the clearest broken promise left. Items 8–10 in §6 (Manage, matrix on phones, vocabulary) fit here too.

   *Now:* desktop Transfers, the matrix on phones (#90), the `MonthlyBudget.tsx` split (#91–#93) Manage as a flat, tabbed list (#94) and the setup wizard (#95–#96) are done. The four-word vocabulary (§6.10) finished the list (#97–#100).

### Method & what this doesn’t cover

Chromium via Playwright at 1440×900 and 375×812 (device scale 2, touch emulated), against `npm run dev` with Supabase disabled so no real credentials were used. Data was the repository’s synthetic `plan-transfers-baseline.json` — Ada and Ben, 40 items, snapshots at 2026-10 and 2027-03, so November 2026 is an inherited month. Measurements (y=801, 48%, 355/739px, contrast ratios, touch-target sizes) were read from the live DOM, not estimated.

**Status updates (9 Nov)** were checked against main @ 967ba58: a code read plus the same Playwright set-up and fixture at both widths, including a zero-income month for the unfunded-items states. PR numbers refer to github.com/nickmlittle/north-planner.

**Not covered:** the sign-in screen, cloud save status and the version-conflict chooser (these need a signed-in session); screen readers and keyboard-only navigation beyond focus visibility; real devices, on-screen keyboards, safe areas, and text-zoom above 100%; and the landscape/coarse-pointer breakpoint. Contrast was checked programmatically against computed styles and passed everywhere — that is not a substitute for a manual accessibility audit.

**Also worth knowing:** `docs/fixtures/plan-transfers-baseline.json` was missing and had to be regenerated from `scripts/baseline-fixture.mjs`. And `plan-transfers-ux-implementation-plan.md` and `plan-transfers-baseline-audit.md` no longer exist, but are still linked from five files — the README, both rules contracts, the product spec, and `documentation-audit.md`, which recommends keeping the roadmap. Not UX, but those cross-references are broken.