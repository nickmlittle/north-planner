import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { PageHeader, Section } from '../components/ui'
import { AccountStatusPanel } from '../components/AccountStatusPanel'
import type { SettingsSection } from '../state/navigation'
import { BudgetManagement } from './BudgetManagement'
import { CardSettings } from './CardSettings'
import { HouseholdFields } from './HouseholdSetup'
import { IncomeDialog } from './IncomeDialog'
import { RulesPanel } from './RulesPanel'
import './SettingsPage.css'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  /** For Pay & income: the month whose income is edited. */
  month: string
  /** The area a link names; the page scrolls to it. */
  section?: SettingsSection | null
  /** Until the household is set up, Settings shows only Household. */
  setupComplete: boolean
  status: string
  warning: string
  email?: string
  onSignOut?: () => void
}

/**
 * Settings: everything that sets the budget up, in one place (was Household, Plan's ⋯ and Spending › Rules).
 * An interim page of today's panels (audit 3 PR 06); PRs 08 and 09 give it its own layout.
 */
export function SettingsPage({ document, setDocument, month, section = null, setupComplete, status, warning, email, onSignOut }: Props) {
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  useEffect(() => {
    if (section) window.document.getElementById(`settings-${section === 'categories' ? 'accounts' : section}`)?.scrollIntoView?.({ block: 'start' })
  }, [section])
  return <div className="page-frame household-setup-page settings-page">
    <PageHeader title="Settings" titleText="Settings"/>
    <div className="settings-sections">
      <Section title="Household" id="settings-household"><HouseholdFields document={document} setDocument={setDocument}/></Section>
      {setupComplete && <>
        <Section title="Pay & income" id="settings-income">
          <p className="settings-lead">Each person’s pay and any other income, and the month it changes from.</p>
          <div><button type="button" className="secondary-button" onClick={() => setIncomeOpen(true)}>Edit income</button></div>
        </Section>
        <Section title="Accounts, pots & categories" id="settings-accounts">
          <p className="settings-lead">Where the money goes, and how Plan groups it.</p>
          <div><button type="button" className="secondary-button" onClick={() => setManaging(true)}>Manage accounts, pots &amp; categories</button></div>
        </Section>
        <div id="settings-cards"><CardSettings document={document} setDocument={setDocument}/></div>
        <div id="settings-rules"><RulesPanel document={document} setDocument={setDocument}/></div>
      </>}
      <Section title="Account & sync" id="settings-account"><div className="settings-account"><AccountStatusPanel status={status} warning={warning} email={email} onSignOut={onSignOut}/></div></Section>
    </div>
    {incomeOpen && <IncomeDialog document={document} setDocument={setDocument} month={month} onClose={() => setIncomeOpen(false)}/>}
    {managing && <BudgetManagement document={document} setDocument={setDocument} onClose={() => setManaging(false)}/>}
  </div>
}
