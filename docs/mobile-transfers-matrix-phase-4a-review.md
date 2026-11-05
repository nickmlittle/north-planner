# Mobile Transfers matrix — Phase 4a disclosure review

Status: **approved by the user**. The user approved the Phase 3 visual direction and requested expand/collapse and less repeated account text for Phase 4. This slice covers disclosure only; the existing mobile account view remains the default and fallback.

## Interaction

- The matrix opens with real account totals and their direct/pot allocation rows visible. An account with one direct item opens as a compact single financial row. Account disclosure hides or shows its breakdown.
- Each direct/pot allocation can show or hide its individual items. Item rows display the existing item name, category and independently rounded contributor and household amounts. The account and allocation context is included in the accessible row header. The receiving destination is established by the parent account/pot row; no new purpose or destination is inferred.
- Disclosure buttons expose expanded state and reference their controlled rows. Collapsing an account also hides any open item rows. Reopening it restores the item choices previously opened within that account. Totals and underlying amounts do not change when rows are toggled.
- Account labels use owner and account name. Provider is shown only where two visible accounts would otherwise have the same owner/name; identical qualified names receive a stable numbered suffix. Account type is omitted from the matrix label.
- A short note says that indented rows break down the total above and must not be added again. The matrix still represents planned contributions, not completed payments.

## Verification

- Component tests cover account and item disclosure, accessible state and controlled rows, keyboard focus retention, nested row context, unchanged totals, compact single-item direct accounts, duplicate account labels, empty and incomplete states, and variable contributor counts.
- The live November 2026 budget was inspected in Safari responsive design mode at 430 CSS px. The compact account labels and disclosure chevrons were visible; opening the 10-item Bills pot displayed its item amounts and categories in aligned columns. No household screenshot was committed.
- Typecheck, lint and relevant regression tests are reported in the handoff. Safari emulation does not establish physical iPhone touch behaviour or VoiceOver announcements; those remain Phase 5 checks.

## Next review boundary

Phase 4b would add a contextual path into the selected-month Plan editor and address compatibility with existing account detail links, browser history and focus. It is not part of this slice.
