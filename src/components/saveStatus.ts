/** The header's words for a save status. "Choose a version" is a conflict, not a save. */
export function saveStatusLabel(saveStatus: string, warning = '') {
  if (warning || /fail|not saved|error/i.test(saveStatus)) return 'Save failed'
  if (saveStatus === 'Choose a version') return 'Choose a version'
  if (saveStatus === 'Saving…') return 'Saving…'
  if (saveStatus === 'Loading budget…') return 'Loading…'
  if (saveStatus === 'Unsaved changes') return 'Unsaved changes'
  return 'Saved'
}
/** A one-character mark for a status that isn't Saved: ◌ while it settles, ! when it needs you. */
export const statusMark = (status: string) => status === 'Saving…' || status === 'Loading…' || status === 'Unsaved changes' ? '◌' : '!'
