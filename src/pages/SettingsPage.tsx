import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker } from '../domain/cardTracker'
import { Breadcrumb, ListRow, PageHeader, Section, useMobilePresentation, useToast } from '../components/ui'
import { useListNavigation } from '../state/useListNavigation'
import { AccountStatusPanel } from '../components/AccountStatusPanel'
import type { SettingsSection } from '../state/navigation'
import { CardSettings } from './CardSettings'
import { HouseholdFields } from './HouseholdSetup'
import { RulesPanel } from './RulesPanel'
import { plural } from './spendingFormat'
import { AccountsAndPots } from './settings/AccountsAndPots'
import { Categories } from './settings/Categories'
import { PayAndIncome } from './settings/PayAndIncome'
import './SettingsPage.css'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  /** For Pay & income and Categories: the month whose income and items show. */
  month: string
  onMonthChange?: (month: string) => void
  /** The section showing; none is the list on phones and Household on desktop. */
  section?: SettingsSection | null
  /** Pushes `section` (null: back to the list on phones). */
  onSelectSection?: (section: SettingsSection | null) => void
  /** Until the household is set up, Settings shows only Household. */
  setupComplete: boolean
  status: string
  warning: string
  email?: string
  onSignOut?: () => void
}

/** The sections, in order. */
const SETTINGS_SECTIONS: ReadonlyArray<{ key: SettingsSection; label: string }> = [
  { key: 'household', label: 'Household' },
  { key: 'income', label: 'Pay & income' },
  { key: 'accounts', label: 'Accounts & pots' },
  { key: 'categories', label: 'Categories' },
  { key: 'cards', label: 'Cards' },
  { key: 'rules', label: 'Sorting rules' },
  { key: 'account', label: 'Account & sync' },
]

/** `?view=settings&section=…`, keeping the month, for the section links. */
function sectionHref(section: SettingsSection) {
  const url = new URLSearchParams(window.location.search)
  const month = url.get('month')
  return `?view=settings&section=${section}${month ? `&month=${month}` : ''}`
}

/**
 * Settings: everything that sets the budget up, in one place. Desktop: a section nav on the left and one section
 * on the right. Phones: a list of sections, each its own page with a breadcrumb back. Editors open in a Sheet.
 */
export function SettingsPage({ document, setDocument, month, onMonthChange = () => {}, section = null, onSelectSection = () => {}, setupComplete, status, warning, email, onSignOut }: Props) {
  const mobile = useMobilePresentation()
  const { show, toast } = useToast()
  const indexKeys = useListNavigation({ label: 'Settings', keys: { enter: 'Open the section' } })
  const tracker = cardTracker(document)
  const { budget, household } = document
  const current: SettingsSection | null = !setupComplete ? 'household' : section ?? (mobile ? null : 'household')
  const label = SETTINGS_SECTIONS.find(row => row.key === current)?.label ?? 'Settings'

  /** Desktop nav counts ("4 · 7") and phone list summaries ("Ada, Ben"). */
  const counts: Partial<Record<SettingsSection, string>> = {
    income: budget.incomeSources.length ? String(budget.incomeSources.length) : '',
    accounts: budget.accounts.length ? `${budget.accounts.length} · ${budget.pots.length}` : '',
    categories: budget.categories.length ? String(budget.categories.length) : '',
    cards: tracker.cards.length ? String(tracker.cards.length) : '',
    rules: tracker.rules.length ? String(tracker.rules.length) : '',
  }
  const summaries: Record<SettingsSection, string> = {
    household: household.adults.map(person => person.name.trim()).filter(Boolean).join(', ') || household.name,
    income: budget.incomeSources.length ? plural(budget.incomeSources.length, 'income source') : 'None yet',
    accounts: `${plural(budget.accounts.length, 'account')} · ${plural(budget.pots.length, 'pot')}`,
    categories: plural(budget.categories.length, 'category', 'categories'),
    cards: tracker.cards.length ? plural(tracker.cards.length, 'card') : 'None yet',
    rules: tracker.rules.length ? plural(tracker.rules.length, 'rule') : 'None yet',
    account: email ?? (onSignOut ? status : 'Saved on this device'),
  }

  const body = (key: SettingsSection): ReactNode => {
    if (key === 'household') return <HouseholdFields document={document} setDocument={setDocument} notify={show}/>
    if (key === 'income') return <PayAndIncome document={document} setDocument={setDocument} month={month} onMonthChange={onMonthChange} notify={show}/>
    if (key === 'accounts') return <AccountsAndPots document={document} setDocument={setDocument} notify={show}/>
    if (key === 'categories') return <Categories document={document} setDocument={setDocument} month={month} notify={show}/>
    if (key === 'cards') return <CardSettings document={document} setDocument={setDocument} notify={show}/>
    if (key === 'rules') return <RulesPanel document={document} setDocument={setDocument} notify={show}/>
    return <div className="settings-account"><AccountStatusPanel status={!onSignOut && status === 'Saved' ? 'Saved on this device' : status} warning={warning} email={email} onSignOut={onSignOut}/></div>
  }
  const follow = (key: SettingsSection | null) => (event: MouseEvent) => { event.preventDefault(); onSelectSection(key) }

  return <div className="page-frame household-setup-page settings-page">
    <PageHeader title="Settings" titleText="Settings"/>
    {!mobile ? <div className={setupComplete ? 'settings-layout' : 'settings-layout is-single'}>
      {setupComplete && <nav className="settings-nav" aria-label="Settings sections"><ul>
        {SETTINGS_SECTIONS.map(row => <li key={row.key}><a href={sectionHref(row.key)} aria-current={row.key === current ? 'page' : undefined} onClick={follow(row.key)}>
          <span>{row.label}</span>{counts[row.key] && <span className="settings-nav-count">{counts[row.key]}</span>}
        </a></li>)}
      </ul></nav>}
      <Section key={current} title={label} id={`settings-${current}`}>{body(current!)}</Section>
    </div>
      : current ? <div className="settings-section-page">
        {setupComplete && <Breadcrumb items={[{ label: 'Settings', onClick: () => onSelectSection(null) }, { label }]}/>}
        <Section title={label} id={`settings-${current}`}>{body(current)}</Section>
      </div>
      : <div {...indexKeys.listProps}>{indexKeys.hint}<ul className="settings-list settings-index" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map(row => <li key={row.key}><ListRow listRow title={row.label} meta={summaries[row.key]} onOpen={() => onSelectSection(row.key)}/></li>)}
      </ul></div>}
    {toast}
  </div>
}
