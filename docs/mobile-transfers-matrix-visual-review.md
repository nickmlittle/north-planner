# Mobile Transfers matrix — Phase 3 visual review

Status: **visual direction approved by the user after review**. The running opt-in preview is available on the mobile Transfers page through **Preview matrix**. This review uses the spreadsheet image attached to the Phase 3 request as the benchmark. The user's follow-up requested expand/collapse and shorter account labels in Phase 4; it did not approve changing the default view.

## Spreadsheet compared with the two mobile views

| Aspect | Attached spreadsheet | Existing mobile account view | Revised matrix preview |
| --- | --- | --- | --- |
| Columns | Two contributors and total, aligned across every row | Contributions displayed as text in each account card; no aligned contributor totals | Contributors and allocated total aligned in a semantic table |
| Initial hierarchy | Bold destination or group, indented purposes, total footer | Real accounts grouped by owner; allocations require opening each account | Real account totals and indented direct/pot allocations are visible together; footer follows all accounts |
| Purpose detail | Compact purpose names such as Bills, Holidays and Spending | Account screen opens direct and pot subtotals | Pot name, direct label and short item context where useful; multi-item allocations show a count, not their complete item lists |
| Amounts | Whole pounds | Whole pounds, with a rounding explanation in detail | Whole pounds, with an explicit independent-rounding note; exact calculation remains in pence |
| Totals across accounts | Personal Monzo and ISAs combine multiple accounts | No such financial subtotals | No inferred cross-account subtotals; each actual receiving account remains identifiable |
| Density | 21 financial rows including the total in the supplied image | At the inspected 932px height, approximately four complete account cards appear before the bottom navigation, with allocations behind detail screens | At the same height and top scroll position, approximately eight financial rows are visible below the page summary; more appear after scrolling the summary away |

The matrix is closer to the spreadsheet's aligned comparison, but remains taller: its labels include actual provider, account and owner information, its rows use larger spacing, and the app retains month controls and the summary. A one-item direct account is shown once with its purpose underneath the account name, rather than repeating the same financial values in a second row. Multiple-item pots show counts to avoid listing a long run of item names in every row. The current prototype does not offer a full item list or item amounts in the matrix; disclosure is a later interaction.

The grouping difference is substantive. “Personal Monzo” in the image spans two real accounts, while “ISAs” spans multiple receiving accounts and providers. The attachment establishes that these are useful spreadsheet groups, but does not by itself define a general rule for selecting their members, especially for future accounts. The preview deliberately retains real-account rows and does not silently create group totals. Decide whether to add explicit, separately labelled groups and what their membership rules should be before relying on those subtotals.

## Comparable live-data checks

The same November 2026 budget was viewed in Safari's responsive design mode, first in the existing account overview and then in the revised matrix. The viewport height was 932 CSS pixels. These observations are the visual evidence; no screenshots containing household financial data were saved into the repository.

| Width | Existing view | Revised matrix |
| --- | --- | --- |
| 375px | Account names, total and individual contribution text fit; around four complete cards are visible, without pot breakdowns | Both contributor columns and the total fit together for the current budget. About eight account/allocation rows fit beneath the summary, with additional rows below the fold. |
| 390px | Same structure and visible-card count | All three numeric columns fit; the account labels wrap and their allocation rows remain aligned. |
| 430px | Same structure; cards have more room | All three numeric columns fit with more space around them; bold green account rows are distinguishable from indented allocation rows. |

The attached spreadsheet and the live app are comparable examples, not the same verified snapshot. Their household totals and some allocation amounts differed. The difference cannot be treated as a display-rounding result or as proof of a calculation defect; the inputs and spreadsheet date have not been reconciled. Exact household figures are omitted from this public-repository review. Separately, independently rounded contributor cells can differ from their independently rounded total by a pound; the preview says so explicitly.

## Stress and accessibility observations

- A synthetic three-contributor fixture with very long names and £123,456,789 allocated shows the horizontal-scroll cue. At 375px, keyboard arrows reveal the last column while the receiving-account label stays visible. A partially visible neighbouring column is expected during scrolling; the user must scroll to view each whole value. Long labels wrap and make rows tall.
- A synthetic positive unresolved item shows a clear incomplete warning with exact planned and unallocated pence, plus incomplete markers on the relevant account, allocation and total. Explicit zero allocations remain visible without an incomplete marker. An empty budget displays a distinct empty state.
- One Safari “Make Text Bigger” step was checked on the synthetic long-label fixture. Text grew, labels wrapped, and scrolling remained available, at the cost of substantial row height. This is a spot check, not a complete zoom or Dynamic Type assessment.
- The table has a caption, column headers, row headers and a focusable scroll region; child row headers include their receiving account for context. Keyboard arrows were exercised in Safari for the overflowing fixture. Automated component tests check headings, contribution values and the scroll cue. VoiceOver and other screen readers were not exercised.
- Column headings currently scroll away vertically when the page is scrolled down. The total footer is at the end of the table, not pinned. These are deliberate prototype limitations to assess in the later responsive and interaction work.
- Safari responsive emulation does not establish touch behaviour, browser-chrome effects, or safe-area behaviour on a physical iPhone. These remain Phase 5 checks.

## Changes made in the visual iteration

- Reduced cell padding and the minimum numeric-column width while preserving readable text and complete amounts.
- Switched the matrix from exact-pence display to independently rounded whole pounds, matching the reference's density. Incomplete warnings retain exact pence. No financial calculations changed.
- Reduced redundant direct-account rows and replaced long lists of multi-item pot names with counts. The matrix remains read-only; no disclosure, editing, copy, persistence or navigation interaction was added.
- Show the horizontal-scroll instruction only when the table actually overflows. Larger values, more contributors and enlarged text can still require scrolling.

## Review decisions

1. Is the whole-pound matrix, with exact pence available through a later interaction, the desired visual direction?
2. Should a future version add cross-account “Personal Monzo” and “ISAs” groups? If so, agree their membership and label them as subtotals while retaining the actual receiving-account rows.
3. Is the compact allocation overview acceptable with full multi-item details deferred to disclosure, and are the visible account/pot distinctions clear enough?

The user subsequently approved the visual direction and requested disclosure and shorter labels for Phase 4. See the Phase 4a review for those changes.
