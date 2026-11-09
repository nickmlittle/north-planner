const TRANSFER_PERSON_KEY = 'north.transferPerson'

/** Whose transfers this device shows: an adult id or 'both'. Null when never chosen. */
export function readTransferPerson(): string | null {
  try { return window.localStorage.getItem(TRANSFER_PERSON_KEY) } catch { return null }
}

export function rememberTransferPerson(value: string) {
  try { window.localStorage.setItem(TRANSFER_PERSON_KEY, value) } catch { /* Per-device convenience only. */ }
}

/** The effective choice for a household: one adult needs no choice; a removed adult means ask again. */
export function resolveTransferPerson(stored: string | null, adultIds: readonly string[]): string | 'both' | null {
  if (adultIds.length === 1) return adultIds[0]!
  if (stored === 'both' && adultIds.length > 1) return 'both'
  return stored && adultIds.includes(stored) ? stored : null
}
