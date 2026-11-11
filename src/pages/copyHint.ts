const COPY_HINT_KEY = 'north.copyHint.seen'

/** The "tap an amount" hint shows until the first copy on this device (Transfers and settling up share it). */
export function copyHintSeen() { try { return window.localStorage.getItem(COPY_HINT_KEY) === '1' } catch { return false } }
export function rememberCopyHint() { try { window.localStorage.setItem(COPY_HINT_KEY, '1') } catch { /* Per-device convenience only. */ } }

/** The plain number a banking app wants: "2215.45". */
export const copyText = (pence: number) => (pence / 100).toFixed(2)
