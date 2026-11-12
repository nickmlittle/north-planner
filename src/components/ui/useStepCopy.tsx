import { useEffect, useRef, useState } from 'react'
import { formatGBP } from '../../formatting/money'
import { copyHintSeen, copyText, rememberCopyHint } from '../../pages/copyHint'

const pounds = (pence: number) => formatGBP(pence / 100)

/**
 * Copying amounts for the banking app, for one list of steps: tap an amount to copy the plain number ("2215.45"),
 * "Copied £2,215.45" is announced once in the list's status line, and the first copy retires the hint.
 */
export function useStepCopy() {
  const [copied, setCopied] = useState('')
  const [hintSeen, setHintSeen] = useState(copyHintSeen)
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clear.current), [])
  const copy = async (pence: number) => {
    let message = `Copied ${pounds(pence)}`
    try { await navigator.clipboard.writeText(copyText(pence)) } catch { message = 'Couldn’t copy' }
    setCopied(message)
    if (!hintSeen) { rememberCopyHint(); setHintSeen(true) }
    clearTimeout(clear.current)
    clear.current = setTimeout(() => setCopied(''), 2500)
  }
  return { copy, hintSeen, status: <p className="step-copied" role="status">{copied}</p> }
}
