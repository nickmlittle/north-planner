import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { budgetTransfers } from '../domain/budgetTransfers'
import { parseAmexCsv } from '../domain/amexCsv'
import type { BudgetPot, BudgetStatement, FundingRule } from '../domain/monthlyBudget'
import { resolveMonthBudget, updateMonthBudget } from '../domain/monthlyBudget'
import { formatGBPSummary } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import type { SettingsSection } from '../state/navigation'

type BudgetView = 'planning' | 'amex'
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
type BudgetProps = {
  document: AppDocument
  setDocument: Dispatch<SetStateAction<AppDocument>>
  warning?: string
  saveStatus?: string
  onSelectSettings: (section: SettingsSection) => void
  onSelectView: (view: 'dashboard' | 'household' | 'budget') => void
}

export function MonthlyBudget({ document, setDocument, warning = '', saveStatus, onSelectSettings, onSelectView }: BudgetProps) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [view, setView] = useState<BudgetView>('planning')
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1099px)').matches)
  const [configOpen, setConfigOpen] = useState(false)
  const [newPotName, setNewPotName] = useState('')
  const [newPotKind, setNewPotKind] = useState<BudgetPot['kind']>('spending')
  const [lineName, setLineName] = useState('')
  const [lineAmount, setLineAmount] = useState('')
  const [linePot, setLinePot] = useState('bills')

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 1099px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const adults = document.snapshot.people.filter(person => person.role !== 'child')
  const [selectedYear, selectedMonth] = month.split('-').map(Number)
  const years = Array.from(new Set([...Array.from({ length: 16 }, (_, index) => today.getFullYear() - 5 + index), selectedYear!])).sort((a, b) => a - b)
  const setBudgetMonth = (year: number, monthNumber: number) => setMonth(`${year}-${String(monthNumber).padStart(2, '0')}`)
  const budget = resolveMonthBudget(document.budget, month)
  const transfers = budgetTransfers(budget, adults.map(person => person.id))
  const pounds = (pence: number) => formatGBPSummary(pence / 100)
  const totalIncome = budget.incomes.reduce((sum, income) => sum + income.monthlyNetPence, 0)
  const allocatedSavings = budget.lines.filter(line => budget.pots.find(pot => pot.id === line.potId)?.kind === 'savings').reduce((sum, line) => sum + line.amountPence, 0) + transfers.surplusPence
  const savingsRate = totalIncome > 0 ? Math.round(allocatedSavings / totalIncome * 100) : 0

  const updateIncome = (personId: string, key: 'monthlyNetPence' | 'liveOnPence' | 'mode' | 'surplusPotId', value: number | string) => {
    setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({
      incomes: [...resolved.incomes.filter(income => income.personId !== personId), {
        personId,
        monthlyNetPence: 0,
        mode: 'all-income' as const,
        liveOnPence: 455000,
        surplusPotId: current.budget.pots.find(pot => pot.kind === 'savings')?.id ?? '',
        ...resolved.incomes.find(income => income.personId === personId),
        [key]: value,
      }],
      lines: resolved.lines,
    })) }))
  }

  const updateStatement = (statementId: string, update: (statement: BudgetStatement) => BudgetStatement) => {
    setDocument(current => ({ ...current, budget: { ...current.budget, statements: current.budget.statements.map(statement => statement.id === statementId ? update(statement) : statement) } }))
  }

  async function upload(file?: File) {
    if (!file) return
    const parsed = parseAmexCsv(await file.text())
    if (parsed.error) { window.alert(parsed.error); return }
    if (document.budget.statements.some(statement => statement.period === month && statement.fileName === file.name)) {
      window.alert('This file has already been uploaded for this month.')
      return
    }
    const transactions = parsed.transactions.map((transaction, index) => ({ ...transaction, id: `${file.name}-${transaction.date}-${index}-${crypto.randomUUID()}`, potId: '' }))
    setDocument(current => ({ ...current, budget: { ...current.budget, statements: [...current.budget.statements, { id: crypto.randomUUID(), fileName: file.name, period: month, statementBalancePence: null, transactions }] } }))
  }

  const currentStatements = document.budget.statements.filter(statement => statement.period === month)
  const statementTransactions = currentStatements.flatMap(statement => statement.transactions)
  const statementTotal = statementTransactions.reduce((sum, transaction) => sum + transaction.amountPence, 0)
  const enteredBalances = currentStatements.filter(statement => statement.statementBalancePence !== null)
  const reconciledBalance = enteredBalances.reduce((sum, statement) => sum + (statement.statementBalancePence ?? 0), 0)
  const reconciliationDifference = enteredBalances.length ? reconciledBalance - currentStatements.filter(statement => statement.statementBalancePence !== null).reduce((sum, statement) => sum + statement.transactions.reduce((part, transaction) => part + transaction.amountPence, 0), 0) : null
  const assignedTotals = budget.pots.map(pot => ({ pot, amount: statementTransactions.filter(transaction => transaction.potId === pot.id).reduce((sum, transaction) => sum + transaction.amountPence, 0) })).filter(row => row.amount !== 0)

  return <div className="north-shell dashboard-shell budget-shell">
    <PlannerHeader step={9} go={() => onSelectView('dashboard')} warning={warning} replaceSavedDraft={() => {}} saveStatus={saveStatus} settingsSection="planning" onSelectSettings={onSelectSettings} onSelectView={onSelectView} currentView="budget" />
    <main className="dashboard-main dashboard-container budget-page">
      <div className="route-heading budget-heading"><div><p className="eyebrow">Monthly plan</p><h1>Budget your month</h1><p className="page-description">Plan what each pot needs and review transfers before payday.</p></div></div>

      <div className="budget-layout">
        <details className="budget-config" open={!compact || configOpen} onToggle={event => { if (compact) setConfigOpen(event.currentTarget.open) }}>
          <summary>Income and month setup</summary>
          <div className="budget-config-content">
            <div className="budget-month-control"><p className="eyebrow">BUDGET PERIOD</p><p className="budget-period-help">Choose the month for income and item overrides, and for Amex statements and settlement totals.</p><div className="budget-period-selects"><label>Month<select aria-label="Budget month" value={selectedMonth} onChange={event => setBudgetMonth(selectedYear!, Number(event.target.value))}>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label>Year<select aria-label="Budget year" value={selectedYear} onChange={event => setBudgetMonth(Number(event.target.value), selectedMonth!)}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label></div></div>
            <div className="budget-income-settings"><h2>Household income</h2><p className="muted">Set monthly take-home and choose how much to budget.</p>
              {adults.length ? adults.map(person => {
                const income = budget.incomes.find(row => row.personId === person.id)
                return <section className="budget-person-settings" key={person.id} aria-label={`${person.name || 'Adult'} income settings`}>
                  <h3>{person.name || 'Adult'}</h3>
                  <label>Net income per month<input aria-label={`${person.name || 'Adult'} net income per month`} type="number" min="0" step="0.01" value={income ? income.monthlyNetPence / 100 : ''} onChange={event => updateIncome(person.id, 'monthlyNetPence', Math.round(Number(event.target.value) * 100))} /></label>
                  <label>Budgeting method<select aria-label={`${person.name || 'Adult'} budgeting method`} value={income?.mode ?? 'all-income'} onChange={event => updateIncome(person.id, 'mode', event.target.value)}><option value="all-income">Use all net income</option><option value="live-on">Set a lifestyle amount</option></select></label>
                  {income?.mode === 'live-on' && <>
                    <label>Lifestyle amount<input aria-label={`${person.name || 'Adult'} lifestyle amount`} type="number" min="0" step="0.01" value={income.liveOnPence / 100} onChange={event => updateIncome(person.id, 'liveOnPence', Math.round(Number(event.target.value) * 100))} /></label>
                    <label>Send surplus to<select aria-label={`${person.name || 'Adult'} savings destination`} value={income.surplusPotId} onChange={event => updateIncome(person.id, 'surplusPotId', event.target.value)}>{budget.pots.filter(pot => pot.kind === 'savings').map(pot => <option key={pot.id} value={pot.id}>{pot.name}</option>)}</select></label>
                    <p className="budget-inline-sweep">Monthly sweep <strong>{pounds(Math.max(0, income.monthlyNetPence - income.liveOnPence))}</strong></p>
                  </>}
                </section>
              }) : <p>Add an adult in Household to set up the monthly budget.</p>}
            </div>
          </div>
        </details>

        <section className="budget-workspace" aria-label="Monthly budget workspace">
          <div className="budget-workspace-header">
            <div className="budget-metrics" aria-label="Monthly budget summary">
              <article><span>Household income</span><strong>{pounds(totalIncome)}</strong></article>
              <article><span>Planned allocations</span><strong>{pounds(transfers.plannedPence)}</strong></article>
              <article><span>{transfers.remainingPence < 0 ? 'Monthly shortfall' : 'Monthly surplus'}</span><strong>{pounds(Math.abs(transfers.remainingPence))}</strong></article>
              <article><span>Savings allocation</span><strong>{savingsRate}%</strong></article>
            </div>
            <div className="budget-tabs" role="tablist" aria-label="Budget workspace">
              <button type="button" role="tab" id="budget-planning-tab" aria-selected={view === 'planning'} aria-controls="budget-planning-panel" onClick={() => setView('planning')}>Planning</button>
              <button type="button" role="tab" id="budget-amex-tab" aria-selected={view === 'amex'} aria-controls="budget-amex-panel" onClick={() => setView('amex')}>Amex</button>
            </div>
          </div>

          {view === 'planning' ? <div className="budget-work-grid" role="tabpanel" id="budget-planning-panel" aria-labelledby="budget-planning-tab">
            <section className="budget-editor-card">
              <div className="budget-section-heading"><div><h2>Pots and budget items</h2><p>Set up destinations, then add what you plan to fund this month.</p></div></div>
              <div className="budget-pot-create-row"><label>New pot name<input aria-label="New pot name" value={newPotName} onChange={event => setNewPotName(event.target.value)} placeholder="e.g. Holidays" /></label><label>Pot type<select aria-label="New pot type" value={newPotKind} onChange={event => setNewPotKind(event.target.value as BudgetPot['kind'])}><option value="spending">Spending</option><option value="savings">Savings</option><option value="credit-card">Credit card</option></select></label><button className="secondary-button" onClick={() => { if (!newPotName.trim()) return; setDocument(current => ({ ...current, budget: { ...current.budget, pots: [...current.budget.pots, { id: crypto.randomUUID(), name: newPotName.trim(), kind: newPotKind }] } })); setNewPotName('') }}>Add pot</button></div>
              <div className="budget-pot-grid">{budget.pots.map(pot => {
                const allocated = budget.lines.filter(line => line.potId === pot.id).reduce((sum, line) => sum + line.amountPence, 0)
                const referenced = budget.lines.some(line => line.potId === pot.id) || budget.incomes.some(income => income.surplusPotId === pot.id) || document.budget.statements.some(statement => statement.transactions.some(transaction => transaction.potId === pot.id))
                return <article className="budget-pot-card" key={pot.id}>
                  <label>{pot.name}<input aria-label={`${pot.name} pot name`} value={pot.name} onChange={event => setDocument(current => ({ ...current, budget: { ...current.budget, pots: current.budget.pots.map(row => row.id === pot.id ? { ...row, name: event.target.value } : row) } }))} /></label>
                  <strong>{pounds(allocated)}<span> planned</span></strong>
                  {!referenced && <button className="text-button" aria-label={`Remove ${pot.name} pot`} onClick={() => setDocument(current => ({ ...current, budget: { ...current.budget, pots: current.budget.pots.filter(row => row.id !== pot.id) } }))}>Remove</button>}
                </article>
              })}</div>
              <div className="budget-add-line"><h3>Add a budget item</h3><div className="budget-pot-create-row"><label>Item name<input aria-label="Budget item name" value={lineName} onChange={event => setLineName(event.target.value)} placeholder="e.g. Mortgage" /></label><label>Monthly amount (£)<input aria-label="Budget item amount" type="number" min="0" step="0.01" value={lineAmount} onChange={event => setLineAmount(event.target.value)} /></label><label>Destination pot<select aria-label="Budget item destination pot" value={linePot} onChange={event => setLinePot(event.target.value)}>{budget.pots.map(pot => <option key={pot.id} value={pot.id}>{pot.name}</option>)}</select></label><button className="primary-button" disabled={!budget.pots.length} onClick={() => { if (!lineName.trim() || !Number.isFinite(Number(lineAmount)) || Number(lineAmount) <= 0) return; setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: [...resolved.lines, { id: crypto.randomUUID(), name: lineName.trim(), amountPence: Math.round(Number(lineAmount) * 100), potId: linePot, funding: 'proportional' }] })) })); setLineName(''); setLineAmount('') }}>Add item</button></div></div>
              {budget.lines.length > 0 ? <div className="budget-line-list"><div className="budget-line-header"><span>Budget item</span><span>Amount</span><span>Pot</span><span>Split</span><span /></div>{budget.lines.map(line => <div className="budget-line-row" key={line.id}>
                <strong>{line.name}</strong><span>{pounds(line.amountPence)}</span><span>{budget.pots.find(pot => pot.id === line.potId)?.name ?? 'Unassigned'}</span>
                <label className="budget-split-control"><span className="visually-hidden">Funding split for {line.name}</span><select aria-label={`Funding split for ${line.name}`} value={line.funding} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, funding: event.target.value as FundingRule } : row) })) }))}><option value="proportional">Income ratio</option><option value="equal">Equal</option><option value="custom">Custom</option><option value="single">One person</option></select></label>
                {line.funding === 'single' ? <label><span className="visually-hidden">Funder for {line.name}</span><select aria-label={`Funder for ${line.name}`} value={line.singleFunderId ?? ''} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, singleFunderId: event.target.value } : row) })) }))}><option value="">Choose person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : line.funding === 'custom' ? <div className="budget-custom-split">{adults.map(person => <label key={person.id}>{person.name} %<input type="number" min="0" max="100" value={line.customShares?.[person.id] ?? ''} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, customShares: { ...row.customShares, [person.id]: Number(event.target.value) } } : row) })) }))} /></label>)}</div> : null}
                <button className="text-button" onClick={() => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.filter(row => row.id !== line.id) })) }))}>Remove</button>
              </div>)}</div> : <p className="budget-empty-state">No items planned for {month}. Add a budget item above to start assigning this month’s income.</p>}
            </section>
            <aside className="budget-summary-rail" aria-label="Payday transfer summary">
              <section className="budget-summary-card"><div className="budget-section-heading"><div><h2>Pot funding</h2><p>Monthly transfers into each destination.</p></div></div>{transfers.pots.length ? <ul className="budget-summary-list">{transfers.pots.map(row => <li key={row.potId}><span>{budget.pots.find(pot => pot.id === row.potId)?.name ?? 'Unassigned'}</span><strong>{pounds(row.amountPence)}</strong></li>)}</ul> : <p className="budget-empty-state">Pot transfers will appear here as you add planned items.</p>}</section>
              <section className="budget-summary-card"><div className="budget-section-heading"><div><h2>Payday transfers</h2><p>Contribution by person.</p></div></div>{transfers.people.filter(person => person.pots.length).map(person => <div className="budget-person-transfer" key={person.personId}><h3>{adults.find(row => row.id === person.personId)?.name || 'Adult'}</h3>{person.pots.map(row => <p key={row.potId}><span>{budget.pots.find(pot => pot.id === row.potId)?.name ?? 'Unassigned'}</span><strong>{pounds(row.amountPence)}</strong></p>)}</div>)}{transfers.remainingPence < 0 ? <p className="budget-shortfall" role="status">Planned items exceed the available monthly amount by {pounds(-transfers.remainingPence)}.</p> : <p className="budget-remaining">{pounds(transfers.remainingPence)} left to allocate</p>}</section>
            </aside>
          </div> : <div className="budget-work-grid" role="tabpanel" id="budget-amex-panel" aria-labelledby="budget-amex-tab">
            <section className="budget-editor-card">
              <div className="budget-section-heading"><div><h2>Amex statement</h2><p>Upload a CSV and assign each transaction to the pot it came from.</p></div></div>
              <label className="secondary-button budget-upload-button">Upload statement CSV<input type="file" accept=".csv,text/csv" onChange={event => void upload(event.target.files?.[0])} /></label>
              {currentStatements.length ? currentStatements.map(statement => <article className="budget-statement" key={statement.id}>
                <div className="budget-statement-heading"><h3>{statement.fileName}</h3><label>Statement balance (£)<input aria-label={`Statement balance for ${statement.fileName}`} type="number" step="0.01" value={statement.statementBalancePence === null ? '' : statement.statementBalancePence / 100} onChange={event => updateStatement(statement.id, row => ({ ...row, statementBalancePence: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} /></label></div>
                <div className="budget-line-list"><div className="budget-line-header budget-statement-columns"><span>Date</span><span>Description</span><span>Amount</span><span>Pot assignment</span></div>{statement.transactions.map(transaction => <div className="budget-line-row budget-statement-columns" key={transaction.id}><span>{transaction.date}</span><strong>{transaction.description}</strong><span>{pounds(transaction.amountPence)}</span><label><span className="visually-hidden">Pot for {transaction.description}</span><select aria-label={`Pot for ${transaction.description}`} value={transaction.potId} onChange={event => updateStatement(statement.id, row => ({ ...row, transactions: row.transactions.map(item => item.id === transaction.id ? { ...item, potId: event.target.value } : item) }))}><option value="">Choose a pot</option>{budget.pots.map(pot => <option key={pot.id} value={pot.id}>{pot.name}</option>)}</select></label></div>)}</div>
                <p className="budget-reconciliation" role="status">{statement.transactions.filter(transaction => !transaction.potId).length} unassigned · Imported total {pounds(statement.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0))}{statement.statementBalancePence !== null ? ` · Difference ${pounds(statement.statementBalancePence - statement.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0))}` : ''}</p>
              </article>) : <p className="budget-empty-state">No Amex statement uploaded for {month}. Upload a CSV to assign transactions to pots.</p>}
            </section>
            <aside className="budget-summary-rail" aria-label="Amex settlement summary"><section className="budget-summary-card"><div className="budget-section-heading"><div><h2>Card settlement by pot</h2><p>How much to fund from each pot.</p></div></div><ul className="budget-summary-list">{assignedTotals.map(row => <li key={row.pot.id}><span>{row.pot.name}</span><strong>{pounds(row.amount)}</strong></li>)}</ul><div className="budget-summary-total"><span>Imported statement total</span><strong>{pounds(statementTotal)}</strong></div>{reconciliationDifference !== null && <div className="budget-summary-total"><span>Reconciliation difference</span><strong>{pounds(reconciliationDifference)}</strong></div>}{statementTransactions.length === 0 && <p className="budget-empty-state">Pot settlement totals will appear here after you upload and assign a statement.</p>}</section></aside>
          </div>}
        </section>
      </div>
    </main>
  </div>
}
