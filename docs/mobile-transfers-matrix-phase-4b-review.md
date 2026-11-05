# Mobile Transfers matrix — Phase 4b navigation and editing review

Status: **implemented for review**. Phase 4a disclosure was approved by the user. This slice adds a contextual handoff from a disclosed matrix item to the existing selected-month Plan workflow.

## Interaction

- Each disclosed item has a **Find in Plan** action. Its accessible name includes the item and receiving account or pot. The handoff uses the item's source ID rather than a name match.
- Plan opens for the same selected month, with the item's owner and category expanded and its item button focused and scrolled into view. Selecting that row opens the existing budget item editor. The existing editor retains its cancel, save, validation and focus behaviour; the Plan row menu retains removal.
- The route creates one browser history entry. Back returns to the opt-in matrix and focuses the receiving account, or the preview control if that account disappeared after removing its final item. Forward returns to Plan and focuses the item when it still exists. If a previously linked item has been removed, Plan says it is unavailable and focuses the search field.
- The existing account-detail URL route, its Back/Forward behaviour, dismissal and focus path are unchanged. The matrix remains opt-in and the account overview remains the default fallback.

## Verification and trade-offs

- Integration tests cover source item and account IDs, month and URL preservation, editor cancel and save, Plan removal, Back/Forward, focus targets and the missing-item case. Existing account-detail route tests remain in the regression set.
- The November 2026 live budget was inspected in Safari responsive design mode at 430 CSS px. Opening a Bills item from the matrix showed its matching Plan row in the same month with focus; Safari Back returned to Transfers and focused the receiving account.
- The matrix's item disclosure state resets on the Plan route because the matrix unmounts; Back returns to the correct account row. This is a trade-off for the small navigation slice. The new **Find in Plan** control is compact; physical-device touch target and VoiceOver checks remain Phase 5 work.
- No calculation, schema or persistence code changed. No household screenshot was committed.

## Next review boundary

Phase 4c would provide exact-pence details and copy actions with success and failure feedback. It is not part of this slice.
