import { useState } from 'react'
import './UiGallery.css'
import { CalendarClock, Ellipsis, FileUp, PiggyBank, Plus, TriangleAlert } from 'lucide-react'
import { EmptyState, Kbd, ListRow, Meter, MonthTitle, PageHeader, Section, StatStrip, StatTile, StatusChip, Tabs, useToast } from '../../components/ui'

/** Dev only (?view=ui-gallery): every shared part in each state, for screenshots against the design-system mockup. */
export default function UiGallery() {
  const [month, setMonth] = useState('2026-11')
  const [tab, setTab] = useState('sort')
  const [payday, setPayday] = useState(false)
  const { show, toast } = useToast()
  return <div className="page-frame ui-gallery">
    <PageHeader title="Components" titleText="Components" breadcrumb={[{ label: 'Settings', onClick: () => {} }, { label: 'Components' }]} chip={<StatusChip tone="positive">Dev only</StatusChip>} context="Every shared part, each state"
      actions={<><button type="button" className="secondary-button" aria-label="More actions"><Ellipsis aria-hidden="true"/></button><button type="button" className="primary-button" onClick={() => show('Copied £2,215.45')}><Plus aria-hidden="true"/>Show a toast</button></>}/>
    {toast}
    <div className="ui-gallery-grid">
      <Section title="MonthTitle" aside={<>Press <Kbd>[</Kbd> <Kbd>]</Kbd> (PR 07)</>}>
        <MonthTitle month={month} onChange={setMonth}/>
      </Section>
      <Section title="StatusChip" count={4}>
        <p className="ui-gallery-row"><StatusChip>Sorted to 8 Nov</StatusChip><StatusChip tone="positive" dot>In progress · 18 days left</StatusChip><StatusChip tone="warning" dot>Ahead of pace</StatusChip><StatusChip tone="critical">£429.66 over</StatusChip></p>
      </Section>
      <Section title="StatTile" aside="in a StatStrip">
        <StatStrip label="This month">
          <StatTile label="Plan" value="£1,141.87 over" detail="£7,641.87 of £6,500.00" tone="critical" onOpen={() => {}} openLabel="Open Plan"/>
          <StatTile label="Spent" value="£272.59" detail="of £5,262.33 · 18 days left"/>
          <StatTile label="Amex" value="£646.88" detail="Due Wed 18 Nov" tone="warning"/>
        </StatStrip>
      </Section>
      <Section title="Meter">
        <div className="ui-gallery-stack">
          <Meter value={5262} max={7641} pace={0.4} label="Spent £5,262.33 of £7,641.87, 40% through the month"/>
          <Meter value={4429} max={4000} label="Ada: £4,429.66 planned of £4,000.00, £429.66 over"/>
          <Meter value={300} max={400} pace={0.4} tone="warning" label="Groceries: £300.00 of £400.00, ahead of pace"/>
          <Meter value={9} max={18} label="9 of 18 steps done" width={240}/>
        </div>
      </Section>
      <Section title="To do" count={4} aside="ListRow">
        <div className="ui-gallery-card">
          <ListRow icon={<TriangleAlert/>} tone="critical" title="Groceries · Monzo Joint £51 ahead of pace" meta="At this rate it runs out around Sun 22 Nov" onOpen={() => {}}/>
          <ListRow icon={<FileUp/>} title="Bring in Amex transactions" meta="Last done Mon 9 Nov" trailing="8 new" onOpen={() => {}} focused/>
          <ListRow icon={<PiggyBank/>} tone="warning" title="Move £140.59 to the Amex pot" meta="3 transactions sorted since the last move" trailing="£140.59" trailingMeta="Amex pot £312.85" href="#move"/>
          <ListRow icon={<CalendarClock/>} tone="done" title="All transactions in and sorted" meta="October" trailing={<StatusChip tone="positive">Done</StatusChip>}/>
        </div>
      </Section>
      <Section title="Tabs">
        <Tabs label="Spending" current={tab} onSelect={setTab} tabs={[{ id: 'sort', label: 'To sort', count: 4 }, { id: 'transactions', label: 'Transactions' }, { id: 'statements', label: 'Statements', count: 2 }]}>
          <p className="ui-gallery-note">The {tab} panel. ← → move between tabs.</p>
        </Tabs>
      </Section>
      <Section title="Section, collapsed">
        {payday ? <Section title="Payday" count="18 of 18" aside={<button type="button" className="text-button" onClick={() => setPayday(false)}>Fold</button>}><p className="ui-gallery-note">Every payday step is ticked.</p></Section>
          : <Section title="Payday" collapsed={{ summary: 'Done · 18 of 18 ticked', onExpand: () => setPayday(true) }}/>}
      </Section>
      <Section title="EmptyState">
        <EmptyState title="Nothing to sort" action={<button type="button" className="secondary-button">Bring in transactions</button>}>Bring in the latest Amex export to see what's new.</EmptyState>
      </Section>
    </div>
  </div>
}
