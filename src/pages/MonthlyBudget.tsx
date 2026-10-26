import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Fragment, useEffect, useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { budgetTransfers } from '../domain/budgetTransfers'
import { parseAmexCsv } from '../domain/amexCsv'
import type { BudgetFrequency, BudgetPot, BudgetStatement, FundingRule } from '../domain/monthlyBudget'
import { monthlyContributionPence, resolveMonthBudget, updateMonthBudget } from '../domain/monthlyBudget'
import { formatGBPSummary } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import type { SettingsSection } from '../state/navigation'

type BudgetView = 'planning' | 'amex'
type BudgetDialog = 'item' | 'categories' | 'destinations' | null
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
  const [dialog, setDialog] = useState<BudgetDialog>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineName, setLineName] = useState('')
  const [lineAmount, setLineAmount] = useState('')
  const [linePot, setLinePot] = useState('bills')
  const [lineCategory, setLineCategory] = useState('Other Living Expenses')
  const [lineOwner, setLineOwner] = useState('Joint')
  const [lineFrequency, setLineFrequency] = useState<BudgetFrequency>('monthly')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set())
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(() => new Set())
  const [createDestination, setCreateDestination] = useState(false)
  const [newPotName, setNewPotName] = useState('')
  const [newPotKind, setNewPotKind] = useState<BudgetPot['kind']>('spending')
  const [newPotOwner, setNewPotOwner] = useState('')
  const [newPotProvider, setNewPotProvider] = useState('')
  const [newCategory, setNewCategory] = useState('')

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
  const tableCategories = [...budget.categories, ...[...new Set(budget.lines.map(line => line.category))].filter(category => !budget.categories.includes(category))]
  const ownerNames = ['Joint', ...adults.map(person => person.name).filter((name): name is string => !!name && name !== 'Joint')]

  const openAddItem = () => {
    setEditingLineId(null); setLineName(''); setLineAmount(''); setLineCategory(budget.categories.includes('Other Living Expenses') ? 'Other Living Expenses' : budget.categories[0] ?? ''); setLineOwner('Joint')
    setLineFrequency('monthly'); setLinePot(budget.pots[0]?.id ?? ''); setCreateDestination(false); setNewPotName(''); setNewPotKind('spending'); setNewPotOwner(''); setNewPotProvider(''); setDialog('item')
  }
  const openEditItem = (line: typeof budget.lines[number]) => {
    setEditingLineId(line.id); setLineName(line.name); setLineAmount((line.entryAmountPence / 100).toString()); setLineCategory(line.category); setLineOwner(line.ownerName)
    setLineFrequency(line.frequency); setLinePot(line.potId); setCreateDestination(false); setNewPotName(''); setDialog('item')
  }
  const saveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const enteredAmount = Number(lineAmount)
    if (!lineName.trim() || !lineCategory || lineAmount.trim() === '' || !Number.isFinite(enteredAmount) || enteredAmount < 0 || enteredAmount > Number.MAX_SAFE_INTEGER / 100) return
    if (createDestination && !newPotName.trim()) return
    if (!createDestination && !linePot) return
    const entryAmountPence = Math.round(enteredAmount * 100)
    const amountPence = monthlyContributionPence(entryAmountPence, lineFrequency)
    const newPot: BudgetPot | null = createDestination ? { id: crypto.randomUUID(), name: newPotName.trim(), kind: newPotKind, ...(newPotOwner.trim() ? { ownerName: newPotOwner.trim() } : {}), ...(newPotProvider.trim() ? { provider: newPotProvider.trim() } : {}) } : null
    const potId = newPot?.id ?? linePot
    setDocument(current => {
      const base = newPot ? { ...current.budget, pots: [...current.budget.pots, newPot] } : current.budget
      return { ...current, budget: updateMonthBudget(base, month, resolved => {
        const updated = { category: lineCategory, ownerName: lineOwner, name: lineName.trim(), entryAmountPence, frequency: lineFrequency, amountPence, potId }
        return { incomes: resolved.incomes, lines: editingLineId
          ? resolved.lines.map(line => line.id === editingLineId ? { ...line, ...updated } : line)
          : [...resolved.lines, { id: crypto.randomUUID(), ...updated, funding: 'proportional' }] }
      }) }
    })
    setDialog(null)
  }
  const addCategory = () => {
    const category = newCategory.trim()
    if (!category || budget.categories.includes(category)) return
    setDocument(current => ({ ...current, budget: { ...current.budget, categories: [...current.budget.categories, category] } }))
    setNewCategory('')
  }
  const renameCategory = (oldName: string, newName: string) => {
    const category = newName.trim()
    if (!category || (category !== oldName && budget.categories.includes(category))) return
    setDocument(current => ({ ...current, budget: {
      ...current.budget,
      categories: current.budget.categories.map(item => item === oldName ? category : item),
      lines: current.budget.lines.map(line => line.category === oldName ? { ...line, category } : line),
      monthOverrides: Object.fromEntries(Object.entries(current.budget.monthOverrides ?? {}).map(([key, override]) => [key, { ...override, lines: override.lines?.map(line => line.category === oldName ? { ...line, category } : line) }])),
    } }))
  }
  const updatePot = (potId: string, key: 'name' | 'ownerName' | 'provider' | 'kind', value: string) => {
    setDocument(current => ({ ...current, budget: { ...current.budget, pots: current.budget.pots.map(pot => pot.id === potId ? { ...pot, [key]: key === 'kind' ? value as BudgetPot['kind'] : value } : pot) } }))
  }
  const removeEditingLine = () => {
    if (!editingLineId) return
    setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.filter(line => line.id !== editingLineId) })) }))
    setDialog(null)
  }

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
              <div className="budget-section-heading"><div><h2>Budget items</h2><p>Plan monthly expenses, savings and allocations by category.</p></div><div className="budget-table-actions"><button className="secondary-button" onClick={() => setDialog('destinations')}>Manage destinations</button><button className="secondary-button" onClick={() => setDialog('categories')}>Manage categories</button><button className="primary-button" onClick={openAddItem}>Add budget item</button></div></div>
              {budget.lines.length > 0 ? <div className="budget-table-wrap"><table className="budget-items-table"><thead><tr><th scope="col">Bill</th><th scope="col">Monthly amount</th><th scope="col">Split rule</th><th scope="col">Destination</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{tableCategories.map(category => {
                const categoryLines = budget.lines.filter(line => line.category === category)
                if (!categoryLines.length) return null
                const categoryTotal = categoryLines.reduce((sum, line) => sum + line.amountPence, 0)
                const categoryCollapsed = collapsedCategories.has(category)
                const owners = [...new Set([...ownerNames, ...categoryLines.map(line => line.ownerName)])].filter(owner => categoryLines.some(line => line.ownerName === owner))
                return <Fragment key={category}><tr className="budget-category-row"><th colSpan={5} scope="rowgroup"><button type="button" aria-expanded={!categoryCollapsed} aria-label={`${categoryCollapsed ? 'Expand' : 'Collapse'} ${category}`} onClick={() => setCollapsedCategories(current => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next })}><span className="budget-disclosure-icon" aria-hidden="true">{categoryCollapsed ? '▸' : '▾'}</span><span>{category}</span></button><small>{pounds(categoryTotal)} / month</small></th></tr>{!categoryCollapsed && owners.map(owner => {
                  const ownerLines = categoryLines.filter(line => line.ownerName === owner)
                  const ownerKey = `${category}::${owner}`
                  const ownerCollapsed = !expandedOwners.has(ownerKey)
                  const ownerTotal = ownerLines.reduce((sum, line) => sum + line.amountPence, 0)
                  return <Fragment key={ownerKey}><tr className="budget-owner-row"><th colSpan={5} scope="rowgroup"><button type="button" aria-expanded={!ownerCollapsed} aria-label={`${ownerCollapsed ? 'Expand' : 'Collapse'} ${owner}`} onClick={() => setExpandedOwners(current => { const next = new Set(current); if (next.has(ownerKey)) next.delete(ownerKey); else next.add(ownerKey); return next })}><span className="budget-disclosure-icon" aria-hidden="true">{ownerCollapsed ? '▸' : '▾'}</span><span>{owner}</span></button><small>{pounds(ownerTotal)}</small></th></tr>{!ownerCollapsed && ownerLines.map(line => <tr key={line.id}>
                  <td><span className="budget-line-name">{line.name}</span>{line.frequency === 'annually' && <small className="budget-line-frequency">{pounds(line.entryAmountPence)}/yr</small>}</td>
                  <td><strong>{pounds(line.amountPence)}<small> / month</small></strong></td>
                  <td><div className="budget-line-split"><label><span className="visually-hidden">Funding split for {line.name}</span><select aria-label={`Funding split for ${line.name}`} value={line.funding} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, funding: event.target.value as FundingRule } : row) })) }))}><option value="proportional">Income ratio</option><option value="equal">Equal</option><option value="custom">Custom</option><option value="single">One person</option></select></label>
                    {line.funding === 'single' && <label><span className="visually-hidden">Funder for {line.name}</span><select aria-label={`Funder for ${line.name}`} value={line.singleFunderId ?? ''} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, singleFunderId: event.target.value } : row) })) }))}><option value="">Choose person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
                    {line.funding === 'custom' && <div className="budget-custom-split">{adults.map(person => <label key={person.id}>{person.name} %<input aria-label={`${person.name} share for ${line.name}`} type="number" min="0" max="100" value={line.customShares?.[person.id] ?? ''} onChange={event => setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({ ...resolved, lines: resolved.lines.map(row => row.id === line.id ? { ...row, customShares: { ...row.customShares, [person.id]: Number(event.target.value) } } : row) })) }))} /></label>)}</div>}
                  </div></td>
                  <td>{(() => { const pot = budget.pots.find(row => row.id === line.potId); return pot ? <><span>{pot.name}</span>{(pot.ownerName || pot.provider) && <small className="budget-pot-context">{[pot.ownerName, pot.provider].filter(Boolean).join(' · ')}</small>}</> : 'Unassigned' })()}</td><td><button className="budget-edit-action" aria-label={`Edit ${line.name}`} onClick={() => openEditItem(line)}>Edit</button></td>
                </tr>)}</Fragment>
                })}</Fragment>
              })}</tbody></table></div> : <p className="budget-empty-state">No budget items yet. Add an item to start assigning this month’s income.</p>}
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
      {dialog === 'item' && <div className="budget-dialog-backdrop"><section className="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-item-dialog-title" onKeyDown={event => { if (event.key === 'Escape') setDialog(null) }}>
        <div className="budget-dialog-heading"><div><p className="eyebrow">BUDGET ITEM</p><h2 id="budget-item-dialog-title">{editingLineId ? 'Edit budget item' : 'Add budget item'}</h2></div><button className="text-button" type="button" aria-label="Close dialog" onClick={() => setDialog(null)}>Close</button></div>
        <form onSubmit={saveItem}>
          <div className="budget-dialog-fields">
            <label>Bill category<select autoFocus aria-label="Bill category" value={lineCategory} onChange={event => setLineCategory(event.target.value)}>{budget.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
            <label>Budget owner<select aria-label="Budget owner" value={lineOwner} onChange={event => setLineOwner(event.target.value)}>{[...new Set([...ownerNames, lineOwner])].map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label>
            <label>Bill name<input aria-label="Bill name" value={lineName} onChange={event => setLineName(event.target.value)} placeholder="e.g. Car insurance" required /></label>
            <div className="budget-frequency-fields"><label>Amount (£)<input aria-label="Bill amount" type="number" min="0" step="0.01" value={lineAmount} onChange={event => setLineAmount(event.target.value)} required /></label><label>Frequency<select aria-label="Bill frequency" value={lineFrequency} onChange={event => setLineFrequency(event.target.value as BudgetFrequency)}><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label></div>
            {lineFrequency === 'annually' && lineAmount !== '' && Number.isFinite(Number(lineAmount)) && Number(lineAmount) >= 0 && <p className="budget-annual-hint">Monthly saving: <strong>{pounds(monthlyContributionPence(Math.round(Number(lineAmount) * 100), 'annually'))}</strong></p>}
            <label>Destination<select aria-label="Bill destination" value={createDestination ? '__create__' : linePot} onChange={event => { const value = event.target.value; setCreateDestination(value === '__create__'); if (value !== '__create__') setLinePot(value) }}><option value="">Choose destination</option>{budget.pots.map(pot => <option key={pot.id} value={pot.id}>{pot.name}{[pot.ownerName, pot.provider].filter(Boolean).length ? ` · ${[pot.ownerName, pot.provider].filter(Boolean).join(' · ')}` : ''}</option>)}<option value="__create__">Create new destination…</option></select></label>
            {createDestination && <div className="budget-new-destination"><p>Create a destination and assign this item to it.</p><label>Destination name<input aria-label="New destination name" autoFocus value={newPotName} onChange={event => setNewPotName(event.target.value)} placeholder="e.g. Bills" required /></label><div className="budget-frequency-fields"><label>Owner<input aria-label="New destination owner" value={newPotOwner} onChange={event => setNewPotOwner(event.target.value)} placeholder="Joint, Nick or Immy" /></label><label>Bank or provider<input aria-label="New destination provider" value={newPotProvider} onChange={event => setNewPotProvider(event.target.value)} placeholder="e.g. Monzo" /></label></div><label>Destination type<select aria-label="New destination type" value={newPotKind} onChange={event => setNewPotKind(event.target.value as BudgetPot['kind'])}><option value="spending">Spending</option><option value="savings">Savings</option><option value="credit-card">Credit card</option></select></label></div>}
          </div>
          <div className="budget-dialog-actions">{editingLineId && <button className="text-button budget-delete-item" type="button" onClick={removeEditingLine}>Delete item</button>}<button className="secondary-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" type="submit">{editingLineId ? 'Save changes' : 'Add budget item'}</button></div>
        </form>
      </section></div>}
      {dialog === 'categories' && <div className="budget-dialog-backdrop"><section className="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-categories-dialog-title" onKeyDown={event => { if (event.key === 'Escape') setDialog(null) }}>
        <div className="budget-dialog-heading"><div><p className="eyebrow">BUDGET SETUP</p><h2 id="budget-categories-dialog-title">Manage categories</h2></div><button className="text-button" type="button" aria-label="Close dialog" onClick={() => setDialog(null)}>Close</button></div>
        <p className="muted">Rename a category to update all its budget items, or add another category.</p>
        <div className="budget-category-manager">{budget.categories.map((category, index) => <label key={index}>Category {index + 1}<input aria-label={`Category ${index + 1}`} value={category} onChange={event => renameCategory(category, event.target.value)} /></label>)}</div>
        <form className="budget-add-category" onSubmit={event => { event.preventDefault(); addCategory() }}><label>New category<input aria-label="New category" value={newCategory} onChange={event => setNewCategory(event.target.value)} /></label><button className="secondary-button" type="submit" disabled={!newCategory.trim() || budget.categories.includes(newCategory.trim())}>Add category</button></form>
        <div className="budget-dialog-actions"><button className="primary-button" type="button" onClick={() => setDialog(null)}>Done</button></div>
      </section></div>}
      {dialog === 'destinations' && <div className="budget-dialog-backdrop"><section className="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-destinations-dialog-title" onKeyDown={event => { if (event.key === 'Escape') setDialog(null) }}>
        <div className="budget-dialog-heading"><div><p className="eyebrow">BUDGET SETUP</p><h2 id="budget-destinations-dialog-title">Manage destinations</h2></div><button className="text-button" type="button" aria-label="Close dialog" onClick={() => setDialog(null)}>Close</button></div>
        <p className="muted">Keep the destination name focused on its purpose; record account owner and bank separately.</p>
        <div className="budget-destination-manager">{budget.pots.map(pot => <section className="budget-destination-fields" key={pot.id} aria-label={`Destination ${pot.name}`}><h3>{pot.name}</h3><label>Destination name<input aria-label={`Destination name for ${pot.name}`} value={pot.name} onChange={event => updatePot(pot.id, 'name', event.target.value)} /></label><div className="budget-frequency-fields"><label>Owner<input aria-label={`Owner for ${pot.name}`} value={pot.ownerName ?? ''} onChange={event => updatePot(pot.id, 'ownerName', event.target.value)} placeholder="Joint, Nick or Immy" /></label><label>Bank or provider<input aria-label={`Provider for ${pot.name}`} value={pot.provider ?? ''} onChange={event => updatePot(pot.id, 'provider', event.target.value)} placeholder="e.g. Monzo" /></label></div><label>Destination type<select aria-label={`Type for ${pot.name}`} value={pot.kind} onChange={event => updatePot(pot.id, 'kind', event.target.value)}><option value="spending">Spending</option><option value="savings">Savings</option><option value="credit-card">Credit card</option></select></label></section>)}</div>
        <div className="budget-dialog-actions"><button className="primary-button" type="button" onClick={() => setDialog(null)}>Done</button></div>
      </section></div>}
    </main>
  </div>
}
