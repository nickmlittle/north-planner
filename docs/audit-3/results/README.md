# Audit 3 · Phase A results (12 Nov 2026)

Before/after evidence for the five Phase A PRs, all merged. Comparisons put `main` before the PR on the left and the PR on the right.

| PR | Folder | What to look at |
| --- | --- | --- |
| #142 · 01 tokens | `01-tokens/` | Eight screens at 375 and 1440: lighter 800→700 headings, darker field edges, 36px desktop controls, links without underlines. `focus-rings-desktop.png`: the one pine ring (cream on the sidebar). |
| #143 · 05 split | `05-split-budget-page/` | `state-diff-report.txt`: 25 Plan/Transfers states × 2 sizes, DOM and focus identical apart from moved overlays. `transfers-desktop-*.png`: the one visible change, Transfers 12px higher (now level with Plan). |
| #144 · 03 Sheet | `03-sheet/` | Phone sheets now bottom sheets with a handle; desktop confirm with its footer; a tall sheet scrolling under a fixed header. |
| #145 · 04 StepRow | `04-step-row/` | Payday (phones gain account bands), Settle up (one Monzo Joint group, Pay last), the Close October cover as a step row, the Move sheet. |
| #146 · 02 UI parts | `02-ui-primitives/` | The dev gallery (`?view=ui-gallery` on the dev server) at 1440 and 375. |

## Phase B (D1, D2, D3 and D12 approved 12 Nov)

| PR | Folder | What to look at |
| --- | --- | --- |
| 06 nav shell | `06-nav-shell/` | `transfers-to-month-*` and `thismonth-to-month-full-*`: Month is Payday then Pots. `household-to-settings-*`: Settings. `sidebar-1280/1100`: expanded vs collapsed, the Spending count. `month-phone-scrolled`, `settings-phone-scrolled`, `account-sheet-phone`: the phone header's account button. `state-diff-report.txt`: Plan's DOM is unchanged apart from its h1, "Plan options" and "Back to Month"; Transfers states are now Month. |
| 07 keyboard | `07-keyboard-core/` | `plan.png`: hints (G M in the sidebar, N on Add item, / in search). `skip.png`: the skip link on the first Tab. `pending.png`: “G …” waiting for the second key. `sheet-month.png`, `sheet-spending.png`: the ? sheet per page (Spending lists To sort's table keys). |

To see it live: `npm run dev -- --port 5174 --strictPort --mode localonly`, seed with `http://localhost:5174/scripts/baseline-seed.html`.
