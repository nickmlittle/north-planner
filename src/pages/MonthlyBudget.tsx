import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { budgetTransfers } from '../domain/budgetTransfers'
import { parseAmexCsv } from '../domain/amexCsv'
import type { BudgetFrequency, BudgetPot, BudgetStatement, FundingRule } from '../domain/monthlyBudget'
import { monthlyContributionPence, resolveMonthBudget, updateMonthBudget } from '../domain/monthlyBudget'
import { formatGBPSummary } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import type { SettingsSection } from '../state/navigation'
import { navigateToBudget } from '../state/navigation'
import { SummaryTile, SummaryTiles } from '../components/SummaryTiles'
import { PageFrame } from '../components/PageFrame'
import { GroupedMoneyInput } from '../components/GroupedMoneyInput'

type BudgetView = 'planning' | 'amex'
type BudgetDialog = 'item' | 'categories' | 'destinations' | null
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
type BudgetProps = {
  document: AppDocument
  setDocument: Dispatch<SetStateAction<AppDocument>>
  warning?: string
  saveStatus?: string
  accountBacked?: boolean
  email?: string
  onSignOut?: () => void
  onSelectSettings: (section: SettingsSection) => void
  onSelectView: (view: 'dashboard' | 'household' | 'budget') => void
}

export function MonthlyBudget({ document, setDocument, warning = '', saveStatus, accountBacked = false, email, onSignOut, onSelectSettings, onSelectView }: BudgetProps) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [view, setView] = useState<BudgetView>(() => new URLSearchParams(window.location.search).get('budgetView') === 'amex' ? 'amex' : 'planning')
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1099px)').matches)
  const [configOpen, setConfigOpen] = useState(false)
  const [dialog, setDialog] = useState<BudgetDialog>(null)
  const [showDestinations, setShowDestinations] = useState(false)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [contextualAddTarget, setContextualAddTarget] = useState<{ category: string; owner?: string } | null>(null)
  const [lineName, setLineName] = useState('')
  const [lineAmount, setLineAmount] = useState('')
  const [inlineAmountId, setInlineAmountId] = useState<string | null>(null)
  const [inlineAmount, setInlineAmount] = useState('')
  const [inlineAmountState, setInlineAmountState] = useState<Record<string, string>>({})
  const inlineAmountInput = useRef<HTMLInputElement>(null)
  const inlineAmountPendingId = useRef<string | null>(null)
  const inlineAmountCommitting = useRef(false)
  const [linePot, setLinePot] = useState('bills')
  const [lineCategory, setLineCategory] = useState('Other Living Expenses')
  const [lineOwner, setLineOwner] = useState('Joint')
  const [lineFrequency, setLineFrequency] = useState<BudgetFrequency>('monthly')
  const [lineFunding, setLineFunding] = useState<FundingRule>('proportional')
  const [lineSingleFunderId, setLineSingleFunderId] = useState('')
  const [lineCustomShares, setLineCustomShares] = useState<Record<string, number>>({})
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set())
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(() => new Set())
  const [expandedTransferGroups, setExpandedTransferGroups] = useState<Set<string>>(() => new Set())
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

  useEffect(() => {
    const id = inlineAmountPendingId.current
    if (!id || !saveStatus) return
    if (saveStatus === 'Saving…') setInlineAmountState(current => ({ ...current, [id]: 'Saving…' }))
    if (saveStatus === 'Saved') {
      setInlineAmountState(current => ({ ...current, [id]: 'Saved' }))
      inlineAmountPendingId.current = null
      setInlineAmountId(current => current === id ? null : current)
    }
    if (saveStatus === 'Not saved') setInlineAmountState(current => ({ ...current, [id]: 'Could not save. Press Enter to retry.' }))
  }, [saveStatus])

  useEffect(() => {
    if (inlineAmountId) {
      inlineAmountInput.current?.focus()
      inlineAmountInput.current?.select()
    }
  }, [inlineAmountId])

  const adults = document.snapshot.people.filter(person => person.role !== 'child')
  const [selectedYear, selectedMonth] = month.split('-').map(Number)
  const years = Array.from(new Set([...Array.from({ length: 16 }, (_, index) => today.getFullYear() - 5 + index), selectedYear!])).sort((a, b) => a - b)
  const setBudgetMonth = (year: number, monthNumber: number) => setMonth(`${year}-${String(monthNumber).padStart(2, '0')}`)
  const budget = resolveMonthBudget(document.budget, month)
  const transfers = budgetTransfers(budget, adults.map(person => person.id))
  const pounds = (pence: number) => formatGBPSummary(pence / 100)
  const splitLabel = (line: typeof budget.lines[number]) => {
    if (line.funding === 'equal') return 'Equal split'
    if (line.funding === 'custom') return 'Custom split'
    if (line.funding === 'single') {
      const funder = adults.find(person => person.id === line.singleFunderId)?.name
      return funder ? `One person · ${funder}` : 'One person'
    }
    return 'Income ratio'
  }
  const totalIncome = budget.incomes.reduce((sum, income) => sum + income.monthlyNetPence, 0)
  const allocatedSavings = budget.lines.filter(line => budget.pots.find(pot => pot.id === line.potId)?.kind === 'savings').reduce((sum, line) => sum + line.amountPence, 0) + transfers.surplusPence
  const savingsRate = totalIncome > 0 ? Math.round(allocatedSavings / totalIncome * 100) : 0
  const tableCategories = [...budget.categories, ...[...new Set(budget.lines.map(line => line.category))].filter(category => !budget.categories.includes(category))]
  const ownerNames = ['Joint', ...adults.map(person => person.name).filter((name): name is string => !!name && name !== 'Joint')]
  const expandBudgetSections = () => {
    setCollapsedCategories(new Set())
    setExpandedOwners(new Set(budget.lines.map(line => `${line.category}::${line.ownerName}`)))
  }
  const collapseBudgetSections = () => {
    setCollapsedCategories(new Set(budget.lines.map(line => line.category)))
    setExpandedOwners(new Set())
  }

  const openAddItem = (context?: { category: string; owner?: string }) => {
    setContextualAddTarget(context ?? null)
    setEditingLineId(null); setLineName(''); setLineAmount(''); setLineCategory(budget.categories.includes('Other Living Expenses') ? 'Other Living Expenses' : budget.categories[0] ?? ''); setLineOwner('Joint')
    if (context) { setLineCategory(context.category); if (context.owner) setLineOwner(context.owner) }
    setLineFrequency('monthly'); setLineFunding('proportional'); setLineSingleFunderId(''); setLineCustomShares({}); setLinePot(budget.pots[0]?.id ?? ''); setCreateDestination(false); setNewPotName(''); setNewPotKind('spending'); setNewPotOwner(''); setNewPotProvider(''); setDialog('item')
  }
  const openEditItem = (line: typeof budget.lines[number]) => {
    setContextualAddTarget(null)
    setEditingLineId(line.id); setLineName(line.name); setLineAmount((line.entryAmountPence / 100).toString()); setLineCategory(line.category); setLineOwner(line.ownerName)
    setLineFrequency(line.frequency); setLineFunding(line.funding); setLineSingleFunderId(line.singleFunderId ?? ''); setLineCustomShares(line.customShares ?? {}); setLinePot(line.potId); setCreateDestination(false); setNewPotName(''); setDialog('item')
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
          ? resolved.lines.map(line => line.id === editingLineId ? { ...line, ...updated, funding: lineFunding, ...(lineFunding === 'single' ? { singleFunderId: lineSingleFunderId } : {}), ...(lineFunding === 'custom' ? { customShares: lineCustomShares } : {}) } : line)
          : [...resolved.lines, { id: crypto.randomUUID(), ...updated, funding: 'proportional' }] }
      }) }
    })
    if (!editingLineId && contextualAddTarget) {
      const returnCategory = lineCategory
      const returnOwner = lineOwner
      setCollapsedCategories(current => { const next = new Set(current); next.delete(returnCategory); return next })
      setExpandedOwners(current => new Set(current).add(`${returnCategory}::${returnOwner}`))
    }
    setDialog(null)
  }
  const openInlineAmount = (line: typeof budget.lines[number]) => {
    setInlineAmountId(line.id)
    setInlineAmount((line.amountPence / 100).toFixed(2))
    setInlineAmountState(current => ({ ...current, [line.id]: '' }))
  }
  const saveInlineAmount = (line: typeof budget.lines[number]) => {
    if (inlineAmountCommitting.current || inlineAmountId !== line.id) return
    const entered = inlineAmount.trim()
    const value = Number(entered)
    if (entered === '' || !/^\d+(\.\d{0,2})?$/.test(entered) || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / (line.frequency === 'annually' ? 1200 : 100)) {
      setInlineAmountState(current => ({ ...current, [line.id]: 'Enter a valid amount of £0 or more.' }))
      return
    }
    inlineAmountCommitting.current = true
    const monthlyPence = Math.round(value * 100)
    const entryAmountPence = line.frequency === 'annually' ? monthlyPence * 12 : monthlyPence
    inlineAmountPendingId.current = line.id
    setInlineAmountState(current => ({ ...current, [line.id]: accountBacked ? 'Saving…' : 'Saved' }))
    setDocument(current => ({ ...current, budget: updateMonthBudget(current.budget, month, resolved => ({
      ...resolved,
      lines: resolved.lines.map(row => row.id === line.id ? { ...row, entryAmountPence, amountPence: monthlyPence } : row),
    })) }))
    if (!accountBacked) {
      inlineAmountPendingId.current = null
      setInlineAmountId(null)
    }
    window.setTimeout(() => { inlineAmountCommitting.current = false }, 0)
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
  const transferGroups = [...new Set(transfers.pots.map(row => {
    const pot = budget.pots.find(item => item.id === row.potId)
    return `${pot?.ownerName ?? 'Household'}::${pot?.provider ?? `Bank not set (${pot?.kind ?? 'spending'})`}`
  }))].map(key => {
    const [owner, provider] = key.split('::') as [string, string]
    const pots = transfers.pots.map(row => ({ row, pot: budget.pots.find(item => item.id === row.potId) })).filter(entry => `${entry.pot?.ownerName ?? 'Household'}::${entry.pot?.provider ?? `Bank not set (${entry.pot?.kind ?? 'spending'})`}` === key)
    const label = `${owner} · ${provider.startsWith('Bank not set') ? provider.includes('savings') ? 'Savings account' : provider.includes('credit-card') ? 'Credit card' : 'Bank not set' : provider}`
    const amountFor = (personId: string) => pots.reduce((sum, entry) => sum + (transfers.people.find(person => person.personId === personId)?.pots.find(item => item.potId === entry.row.potId)?.amountPence ?? 0), 0)
    const total = pots.reduce((sum, entry) => sum + entry.row.amountPence, 0)
    const potLabel = (name: string, pot?: BudgetPot) => {
      if (!pot) return name
      const tokens = [pot.ownerName, pot.provider].filter((value): value is string => !!value)
      const tokenSet = new Set(tokens.map(token => token.toLowerCase()))
      const cleaned = name.split(/\s+/).filter(part => !tokenSet.has(part.replace(/[.,:]/g, '').toLowerCase())).join(' ').replace(/[·|–—-]/g, ' ').replace(/\s+/g, ' ').trim()
      const normalizedName = name.replace(/[·|–—-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      const accountName = tokens.join(' ').toLowerCase()
      return cleaned || (normalizedName === accountName ? '' : name)
    }
    return { key, label, pots, amountFor, total, potLabel }
  })

  return <div className="north-shell dashboard-shell budget-shell">
    <PlannerHeader step={9} go={() => onSelectView('dashboard')} warning={warning} replaceSavedDraft={() => {}} accountBacked={accountBacked} saveStatus={saveStatus} email={email} onSignOut={onSignOut} settingsSection="planning" onSelectSettings={onSelectSettings} onSelectView={onSelectView} currentView="budget" onSelectBudgetView={budgetView => { setView(budgetView); navigateToBudget(budgetView) }} />
    <PageFrame className="dashboard-main budget-page" headingClass="route-heading budget-heading" eyebrow="Monthly plan" title="Budget your month" description="Plan what each pot needs and review transfers before payday." summary={<SummaryTiles label="Monthly budget summary" className="budget-metrics">
        <SummaryTile label="Household income" value={pounds(totalIncome)} />
        <SummaryTile label="Planned allocations" value={pounds(transfers.plannedPence)} />
        <SummaryTile label={transfers.remainingPence < 0 ? 'Monthly shortfall' : 'Monthly surplus'} value={pounds(Math.abs(transfers.remainingPence))} />
        <SummaryTile label="Savings allocation" value={`${savingsRate}%`} />
      </SummaryTiles>}>

      <div className="budget-layout">
        <details className="budget-config" open={!compact || configOpen} onToggle={event => { if (compact) setConfigOpen(event.currentTarget.open) }}>
          <summary>Income and month setup</summary>
          <div className="budget-config-content">
            <div className="budget-month-control"><p className="eyebrow">BUDGET PERIOD</p><div className="budget-period-selects"><label>Month<select aria-label="Budget month" value={selectedMonth} onChange={event => setBudgetMonth(selectedYear!, Number(event.target.value))}>{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label>Year<select aria-label="Budget year" value={selectedYear} onChange={event => setBudgetMonth(Number(event.target.value), selectedMonth!)}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label></div></div>
            <div className="budget-income-settings"><h2>Household income</h2>
              {adults.length ? adults.map(person => {
                const income = budget.incomes.find(row => row.personId === person.id)
                return <section className="budget-person-settings" key={person.id} aria-label={`${person.name || 'Adult'} income settings`}>
                  <h3>{person.name || 'Adult'}</h3>
                  <label>Net income per month <GroupedMoneyInput label={`${person.name || 'Adult'} net income per month`} value={(income?.monthlyNetPence ?? 0) / 100} onChange={amount => updateIncome(person.id, 'monthlyNetPence', Math.round(amount * 100))} /></label>
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
          {view === 'planning' ? <div className="budget-work-grid" id="budget-planning-panel" role="region" aria-label="Planning budget">
            <section className="budget-editor-card">
              <div className="budget-section-heading"><div><h2>Budget items</h2><p>Plan monthly expenses, savings and allocations by category.</p></div><button className="primary-button" onClick={() => openAddItem()}>Add budget item</button></div>
              <div className="budget-table-toolbar"><div className="budget-disclosure-actions" aria-label="Budget table sections"><span>Sections</span><button type="button" disabled={!budget.lines.length} onClick={expandBudgetSections}>Expand all</button><button type="button" disabled={!budget.lines.length} onClick={collapseBudgetSections}>Collapse all</button></div><div className="budget-table-settings"><button type="button" onClick={() => setDialog('categories')}>Manage categories</button><button type="button" onClick={() => setDialog('destinations')}>Manage destinations</button></div></div>
              {budget.lines.length > 0 ? <div className="budget-table-wrap"><table className={`budget-items-table${showDestinations ? ' show-destinations' : ''}`}><colgroup><col className="budget-col-bill" /><col className="budget-col-amount" /><col className="budget-col-split" /><col className="budget-col-actions" /></colgroup><thead><tr><th scope="col" className="budget-bill-heading"><div className="budget-bill-heading-content"><span>Bill</span><button type="button" className="budget-destination-toggle budget-bill-destination-toggle" aria-label={showDestinations ? 'Hide destinations' : 'Show destinations'} aria-pressed={showDestinations} onClick={() => setShowDestinations(value => !value)}>{showDestinations ? 'Hide destinations' : 'Show destinations'}</button></div></th><th scope="col" className="budget-amount-heading">Monthly amount</th><th scope="col" className="budget-split-heading">Split</th><th scope="col" className="budget-actions-heading">Actions</th></tr></thead><tbody>{tableCategories.map(category => {
                const categoryLines = budget.lines.filter(line => line.category === category)
                if (!categoryLines.length) return null
                const categoryTotal = categoryLines.reduce((sum, line) => sum + line.amountPence, 0)
                const categoryCollapsed = collapsedCategories.has(category)
                const hasExpandedOwner = [...expandedOwners].some(ownerKey => ownerKey.startsWith(`${category}::`))
                const owners = [...new Set([...ownerNames, ...categoryLines.map(line => line.ownerName)])].filter(owner => categoryLines.some(line => line.ownerName === owner))
                return <Fragment key={category}><tr className="budget-category-row"><th scope="rowgroup"><button type="button" aria-expanded={!categoryCollapsed} aria-label={`${categoryCollapsed ? 'Expand' : 'Collapse'} ${category}`} onClick={() => setCollapsedCategories(current => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next })}><span className="budget-disclosure-label"><span className="budget-disclosure-icon" aria-hidden="true">{categoryCollapsed ? '▸' : '▾'}</span><span>{category}</span></span><span className="budget-mobile-group-total">{pounds(categoryTotal)} / month</span></button></th><td className="budget-group-total">{pounds(categoryTotal)}<small> / month</small></td><td /><td /></tr>{!categoryCollapsed && owners.map(owner => {
                  const ownerLines = categoryLines.filter(line => line.ownerName === owner)
                  const ownerKey = `${category}::${owner}`
                  const ownerCollapsed = !expandedOwners.has(ownerKey)
                  const ownerTotal = ownerLines.reduce((sum, line) => sum + line.amountPence, 0)
                  return <Fragment key={ownerKey}><tr className="budget-owner-row"><th scope="rowgroup"><button type="button" aria-expanded={!ownerCollapsed} aria-label={`${ownerCollapsed ? 'Expand' : 'Collapse'} ${owner}`} onClick={() => setExpandedOwners(current => { const next = new Set(current); if (next.has(ownerKey)) next.delete(ownerKey); else next.add(ownerKey); return next })}><span className="budget-disclosure-label"><span className="budget-disclosure-icon" aria-hidden="true">{ownerCollapsed ? '▸' : '▾'}</span><span>{owner}</span></span><span className="budget-mobile-group-total">{pounds(ownerTotal)}</span></button></th><td className="budget-group-total">{pounds(ownerTotal)}</td><td /><td /></tr>{!ownerCollapsed && <>{ownerLines.map(line => <tr className="budget-item-row" key={line.id}>
                  <td><span className="budget-line-name">{line.name}</span>{showDestinations && <small className="budget-inline-destination">{(() => { const pot = budget.pots.find(row => row.id === line.potId); return pot ? [pot.name, pot.ownerName, pot.provider].filter(Boolean).join(' · ') : 'Unassigned' })()}</small>}{line.frequency === 'annually' && <small className="budget-line-frequency">{pounds(line.entryAmountPence)}/yr</small>}</td>
                  <td className="budget-inline-amount-cell">{inlineAmountId === line.id ? <div className="budget-inline-amount-editor"><div className="budget-inline-amount-control"><span aria-hidden="true">£</span><input ref={inlineAmountInput} className="budget-inline-amount-input" aria-label={`Monthly amount for ${line.name}`} type="text" inputMode="decimal" value={inlineAmount} onChange={event => { setInlineAmount(event.target.value); setInlineAmountState(current => ({ ...current, [line.id]: '' })) }} onBlur={() => saveInlineAmount(line)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveInlineAmount(line) } if (event.key === 'Escape') { event.preventDefault(); inlineAmountCommitting.current = false; inlineAmountPendingId.current = null; setInlineAmountId(null); setInlineAmountState(current => ({ ...current, [line.id]: '' })) } }} /></div>{inlineAmountState[line.id] && <small className="budget-inline-amount-status" role={inlineAmountState[line.id]?.startsWith('Could not') || inlineAmountState[line.id]?.startsWith('Enter') ? 'alert' : 'status'}>{inlineAmountState[line.id]}</small>}</div> : <button type="button" className="budget-inline-amount-trigger" aria-label={`Edit monthly amount for ${line.name}: ${pounds(line.amountPence)}`} onClick={() => openInlineAmount(line)}><strong>{pounds(line.amountPence)}<small> / month</small></strong></button>}{inlineAmountId !== line.id && inlineAmountState[line.id] && <small className="budget-inline-amount-status" role={inlineAmountState[line.id]?.startsWith('Could not') || inlineAmountState[line.id]?.startsWith('Enter') ? 'alert' : 'status'}>{inlineAmountState[line.id]}</small>}</td>
                  <td className="budget-split-indicator-cell"><small className="budget-mobile-field-label">Split</small><span className="budget-split-indicator" aria-label={`Funding split for ${line.name}: ${splitLabel(line)}`}>{splitLabel(line)}</span><div className="visually-hidden">{line.funding === 'custom' && adults.map(person => `${person.name}: ${line.customShares?.[person.id] ?? 0}%`).join(', ')}</div></td>
                  <td><button className="budget-edit-action" aria-label={`Edit ${line.name}`} onClick={() => openEditItem(line)}>Edit</button></td>
                </tr>)}<tr className="budget-context-add-row"><td><button type="button" className="budget-context-add-action" onClick={() => openAddItem({ category, owner })}>+ Add to {owner} in {category}</button></td><td /><td /><td /></tr></>}</Fragment>
                })}{!categoryCollapsed && !hasExpandedOwner && <tr className="budget-context-add-row budget-category-context-add"><td><button type="button" className="budget-context-add-action" onClick={() => openAddItem({ category })}>+ Add to {category}</button></td><td /><td /><td /></tr>}</Fragment>
              })}</tbody></table></div> : <p className="budget-empty-state">No budget items yet. Add an item to start assigning this month’s income.</p>}
            </section>
            <aside className="budget-summary-rail" aria-label="Payday transfer summary">
              <section className="budget-summary-card budget-transfer-card"><div className="budget-section-heading"><div><h2>Payday transfers</h2><p>Monthly transfers by account and pot.</p></div></div>{transfers.pots.length ? <div className="budget-transfer-table-wrap"><table className="budget-transfer-table" aria-label="Payday transfers by account and pot"><colgroup><col style={{ width: '40%' }} />{adults.map(person => <col key={person.id} style={{ width: `${60 / (adults.length + 1)}%` }} />)}<col style={{ width: `${60 / (adults.length + 1)}%` }} /></colgroup><thead><tr><th scope="col">Transfer to</th>{adults.map(person => <th scope="col" key={person.id}>{person.name}</th>)}<th scope="col">Total</th></tr></thead><tbody>{transferGroups.map(group => {
                const expanded = expandedTransferGroups.has(group.key)
                const disclosure = group.pots.length > 1
                const onlyPotLabel = group.pots.length === 1 ? group.potLabel(group.pots[0]!.pot?.name ?? 'Unassigned', group.pots[0]!.pot) : ''
                return <Fragment key={group.key}><tr className="budget-transfer-bank-row"><th scope="row">{disclosure ? <button className="budget-transfer-disclosure" type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.label} pots`} onClick={() => setExpandedTransferGroups(current => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next })}><span aria-hidden="true">{expanded ? '▾' : '▸'}</span><span className="budget-transfer-label">{group.label}</span></button> : <span className="budget-transfer-label">{group.label}</span>}{!disclosure && onlyPotLabel && <small>{onlyPotLabel}</small>}</th>{adults.map(person => <td key={person.id}>{pounds(group.amountFor(person.id))}</td>)}<td>{pounds(group.total)}</td></tr>{disclosure && expanded && group.pots.map(({ row, pot }) => <tr className="budget-transfer-pot-row" key={row.potId}><th scope="row"><span className="budget-transfer-label">{group.potLabel(pot?.name ?? 'Unassigned', pot)}</span></th>{adults.map(person => <td key={person.id}>{pounds(transfers.people.find(entry => entry.personId === person.id)?.pots.find(item => item.potId === row.potId)?.amountPence ?? 0)}</td>)}<td>{pounds(row.amountPence)}</td></tr>)}</Fragment>
              })}<tr className="budget-transfer-total-row"><th scope="row">Total</th>{adults.map(person => <td key={person.id}>{pounds(transfers.people.find(entry => entry.personId === person.id)?.pots.reduce((sum, row) => sum + row.amountPence, 0) ?? 0)}</td>)}<td>{pounds(transfers.pots.reduce((sum, row) => sum + row.amountPence, 0))}</td></tr></tbody></table></div> : <p className="budget-empty-state">Payday transfers will appear here as you add planned items.</p>}{transfers.remainingPence < 0 ? <p className="budget-shortfall" role="status">Planned items exceed the available monthly amount by {pounds(-transfers.remainingPence)}.</p> : <p className="budget-remaining">{pounds(transfers.remainingPence)} left to allocate</p>}</section>
            </aside>
          </div> : <div className="budget-work-grid" id="budget-amex-panel" role="region" aria-label="Amex statement review">
            <section className="budget-editor-card">
              <div className="budget-section-heading"><div><h2>Amex statement</h2></div></div>
              <label className="secondary-button budget-upload-button">Upload CSV<input type="file" accept=".csv,text/csv" onChange={event => void upload(event.target.files?.[0])} /></label>
              {currentStatements.length ? currentStatements.map(statement => <article className="budget-statement" key={statement.id}>
                <div className="budget-statement-heading"><h3>{statement.fileName}</h3><label>Statement balance (£)<input aria-label={`Statement balance for ${statement.fileName}`} type="number" step="0.01" value={statement.statementBalancePence === null ? '' : statement.statementBalancePence / 100} onChange={event => updateStatement(statement.id, row => ({ ...row, statementBalancePence: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) }))} /></label></div>
                <div className="budget-line-list"><div className="budget-line-header budget-statement-columns"><span>Date</span><span>Description</span><span>Amount</span><span>Pot</span></div>{statement.transactions.map(transaction => <div className="budget-line-row budget-statement-columns" key={transaction.id}><span>{transaction.date}</span><strong>{transaction.description}</strong><span>{pounds(transaction.amountPence)}</span><label><span className="visually-hidden">Pot for {transaction.description}</span><select aria-label={`Pot for ${transaction.description}`} value={transaction.potId} onChange={event => updateStatement(statement.id, row => ({ ...row, transactions: row.transactions.map(item => item.id === transaction.id ? { ...item, potId: event.target.value } : item) }))}><option value="">Choose a pot</option>{budget.pots.map(pot => <option key={pot.id} value={pot.id}>{pot.name}</option>)}</select></label></div>)}</div>
                <p className="budget-reconciliation" role="status">{statement.transactions.filter(transaction => !transaction.potId).length} unassigned{statement.statementBalancePence !== null ? ` · Difference ${pounds(statement.statementBalancePence - statement.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0))}` : ''}</p>
              </article>) : <p className="budget-empty-state">No statement uploaded for {month}.</p>}
            </section>
            <aside className="budget-summary-rail" aria-label="Amex settlement summary"><section className="budget-summary-card"><div className="budget-section-heading"><div><h2>Card settlement by pot</h2></div></div><ul className="budget-summary-list">{assignedTotals.map(row => <li key={row.pot.id}><span>{row.pot.name}</span><strong>{pounds(row.amount)}</strong></li>)}</ul><div className="budget-summary-total"><span>Imported statement total</span><strong>{pounds(statementTotal)}</strong></div>{reconciliationDifference !== null && <div className="budget-summary-total"><span>Reconciliation difference</span><strong>{pounds(reconciliationDifference)}</strong></div>}{statementTransactions.length === 0 && <p className="budget-empty-state">No transactions to settle yet.</p>}</section></aside>
          </div>}
        </section>
      </div>
      {dialog === 'item' && <div className="budget-dialog-backdrop"><section className="budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-item-dialog-title" onKeyDown={event => { if (event.key === 'Escape') setDialog(null) }}>
        <div className="budget-dialog-heading"><div><p className="eyebrow">BUDGET ITEM</p><h2 id="budget-item-dialog-title">{editingLineId ? 'Edit budget item' : 'Add budget item'}</h2></div><button className="text-button" type="button" aria-label="Close dialog" onClick={() => setDialog(null)}>Close</button></div>
        <form onSubmit={saveItem}>
          <div className="budget-dialog-fields">
            <label>Bill category<select autoFocus={!contextualAddTarget && !editingLineId} aria-label="Bill category" value={lineCategory} onChange={event => setLineCategory(event.target.value)}>{budget.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
            <label>Budget owner<select aria-label="Budget owner" value={lineOwner} onChange={event => setLineOwner(event.target.value)}>{[...new Set([...ownerNames, lineOwner])].map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label>
            <label>Bill name<input autoFocus={!!contextualAddTarget && !editingLineId} aria-label="Bill name" value={lineName} onChange={event => setLineName(event.target.value)} placeholder="e.g. Car insurance" required /></label>
            <div className="budget-frequency-fields"><label>Amount (£)<input aria-label="Bill amount" type="number" min="0" step="0.01" value={lineAmount} onChange={event => setLineAmount(event.target.value)} required /></label><label>Frequency<select aria-label="Bill frequency" value={lineFrequency} onChange={event => setLineFrequency(event.target.value as BudgetFrequency)}><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label></div>
            {lineFrequency === 'annually' && lineAmount !== '' && Number.isFinite(Number(lineAmount)) && Number(lineAmount) >= 0 && <p className="budget-annual-hint">Monthly saving: <strong>{pounds(monthlyContributionPence(Math.round(Number(lineAmount) * 100), 'annually'))}</strong></p>}
            {editingLineId && <label>Funding split<select aria-label="Funding split" value={lineFunding} onChange={event => setLineFunding(event.target.value as FundingRule)}><option value="proportional">Income ratio</option><option value="equal">Equal</option><option value="custom">Custom</option><option value="single">One person</option></select></label>}
            {editingLineId && lineFunding === 'single' && <label>Funder<select aria-label="Funder" value={lineSingleFunderId} onChange={event => setLineSingleFunderId(event.target.value)}><option value="">Choose person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
            {editingLineId && lineFunding === 'custom' && <div className="budget-frequency-fields">{adults.map(person => <label key={person.id}>{person.name} share (%)<input aria-label={`${person.name} share`} type="number" min="0" max="100" value={lineCustomShares[person.id] ?? ''} onChange={event => setLineCustomShares(current => ({ ...current, [person.id]: Number(event.target.value) }))} /></label>)}</div>}
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
    </PageFrame>
  </div>
}
