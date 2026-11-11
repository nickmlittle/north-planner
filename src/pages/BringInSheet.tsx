import { useEffect, useId, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import { Check, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import { AmexImportError, importAmexExport, readAmexExport, type ImportResult } from '../domain/amexImport'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, saveCard, type CardAccount } from '../domain/cardTracker'
import { ordinal, shortDate } from './cardLabels'
import { plural, pounds } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  onClose: () => void
  /** "Sort N transactions": close and show To sort. */
  onSort: () => void
  /** The import time; tests pass a fixed one. */
  now?: () => Date
}

/** The summary check in words: matches, or what's missing. */
function summaryText(result: ImportResult) {
  const { missingChargesPence: charges, missingCreditsPence: credits } = result.summary
  if (result.summary.matches) return `All ${plural(result.rows, 'transaction')} match Amex’s summary`
  const parts = [
    charges > 0 ? `${pounds(charges)} of charges in Amex’s summary aren’t in this file` : charges < 0 ? `this file has ${pounds(-charges)} more charges than Amex’s summary` : '',
    credits < 0 ? `${pounds(-credits)} of payments and credits in Amex’s summary aren’t in this file` : credits > 0 ? `this file has ${pounds(credits)} more payments and credits than Amex’s summary` : '',
  ].filter(Boolean).join(', and ')
  return `${parts.charAt(0).toUpperCase()}${parts.slice(1)}. Download the export again if it was taken before everything posted.`
}

/** Bring in: choose the Amex Excel export, see what came in and whether it matches Amex's summary, then sort. */
export function BringInSheet({ document, setDocument, onClose, onSort, now = () => new Date() }: Props) {
  const id = useId()
  const cards = cardTracker(document).cards
  const [cardId, setCardId] = useState(cards[0]?.id ?? '')
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'reading'; fileName: string } | { kind: 'error'; message: string } | { kind: 'done'; fileName: string; result: ImportResult }>({ kind: 'idle' })
  const [owners, setOwners] = useState<Record<string, string>>({})
  const card = cards.find(row => row.id === cardId)
  // The file input goes once a result shows, so focus moves to the result to stay in the dialog.
  const resultRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (state.kind === 'done') resultRef.current?.focus() }, [state.kind])

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !card || state.kind === 'reading') return
    setState({ kind: 'reading', fileName: file.name })
    try {
      const parsed = await readAmexExport(new Uint8Array(await file.arrayBuffer()))
      const at = now()
      // Worked out on the document as it is now, then applied to the latest one (it may have changed while reading).
      const { result } = importAmexExport(document, card.id, parsed, file.name, at)
      setDocument(current => importAmexExport(current, card.id, parsed, file.name, at).document)
      setState({ kind: 'done', fileName: file.name, result })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof AmexImportError ? error.message : 'North couldn’t read that file. Download the Excel version of your transactions and try again.' })
    }
  }

  const saveOwners = (target: CardAccount, suffixes: string[]) => {
    const cardholders = [...target.cardholders, ...suffixes.filter(suffix => owners[suffix]).map(suffix => ({ suffix, personId: owners[suffix]! }))]
    setDocument(current => saveCard(current, { ...target, cardholders }))
  }
  const changeCloseDay = (target: CardAccount, closeDay: number) => setDocument(current => saveCard(current, { ...target, closeDay }))

  const result = state.kind === 'done' ? state.result : null
  // Endings still unknown after any saved here.
  const unknown = result && card ? result.unknownSuffixes.filter(suffix => !card.cardholders.some(row => row.suffix === suffix)) : []
  const mismatchDay = result?.closeDayMismatch !== undefined && card && card.closeDay !== result.closeDayMismatch ? result.closeDayMismatch : undefined

  return <ModalDialog title="Bring in transactions" onClose={onClose} className="bring-in-sheet">
    {!result && <>
      <p className="bring-in-lead">Download the Excel version of your transactions from Amex online, then choose the file here.</p>
      {cards.length > 1 && <label className="bring-in-field">Card<select value={cardId} onChange={event => setCardId(event.target.value)}>{cards.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <label className="primary-button bring-in-file">
        <FileSpreadsheet aria-hidden="true"/>Choose the Excel file
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden" data-autofocus onChange={event => void choose(event)}/>
      </label>
      {state.kind === 'reading' && <p role="status" className="bring-in-status">Reading {state.fileName}…</p>}
      {state.kind === 'error' && <p role="alert" className="bring-in-error"><TriangleAlert aria-hidden="true"/>{state.message}</p>}
    </>}
    {result && card && <div className="bring-in-result" aria-labelledby={`${id}-result`}>
      <p ref={resultRef} tabIndex={-1} id={`${id}-result`} className="bring-in-file-name" role="status"><strong>{state.kind === 'done' && state.fileName}</strong><span>{plural(result.rows, 'transaction')} · {shortDate(result.period.from)} – {shortDate(result.period.to)} statement</span></p>
      <dl className="bring-in-counts">
        <div><dt>Already here</dt><dd>{result.alreadyHere}</dd></div>
        <div><dt>New</dt><dd>{result.added}</dd></div>
        <div><dt>Sorted by your rules</dt><dd>{result.sortedByRules}</dd></div>
        <div><dt>To sort</dt><dd>{result.toSort}</dd></div>
      </dl>
      <p className={`bring-in-check${result.summary.matches ? ' is-ok' : ' is-warn'}`}>{result.summary.matches ? <Check aria-hidden="true"/> : <TriangleAlert aria-hidden="true"/>}<span>{summaryText(result)}</span></p>
      {result.final && <p className="bring-in-check is-ok"><Check aria-hidden="true"/><span>This is the final export for the {shortDate(result.period.to)} statement.</span></p>}
      {unknown.length > 0 && <fieldset className="bring-in-owners"><legend>Whose {unknown.length === 1 ? 'card is this' : 'cards are these'}?</legend>
        {unknown.map(suffix => <label key={suffix} className="bring-in-field">Whose card ends {suffix}?<select value={owners[suffix] ?? ''} onChange={event => setOwners({ ...owners, [suffix]: event.target.value })}><option value="">Choose</option>{document.household.adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>)}
        <button type="button" className="secondary-button" disabled={!unknown.some(suffix => owners[suffix])} onClick={() => saveOwners(card, unknown)}>Save</button>
      </fieldset>}
      {mismatchDay !== undefined && <div className="bring-in-check is-warn"><TriangleAlert aria-hidden="true"/><span>This export’s statement ends on the {ordinal(mismatchDay)}, but {card.name} is set to close on the {ordinal(card.closeDay)}. <button type="button" className="text-button" onClick={() => changeCloseDay(card, mismatchDay)}>Change it to the {ordinal(mismatchDay)}</button></span></div>}
      <div className="bring-in-actions">
        <button type="button" className="secondary-button" onClick={() => setState({ kind: 'idle' })}>Bring in another file</button>
        {result.toSort > 0 ? <button type="button" className="primary-button" onClick={onSort}>Sort {plural(result.toSort, 'transaction')}</button> : <button type="button" className="primary-button" onClick={onClose}>Done</button>}
      </div>
    </div>}
  </ModalDialog>
}
