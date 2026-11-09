import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { GroupedTable, GroupedTableAction, GroupedTableDisclosure, type GroupedTableGroup } from '../components/GroupedTable'
import type { MatrixAccountRow, MatrixAmounts, MatrixDirectRow, MatrixPotRow, TransferMatrixModel } from '../domain/transferMatrix'
import type { PlanDestination } from '../state/navigation'
import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)
const groupKey = (...parts: string[]) => JSON.stringify(parts)

function AmountCells({ amounts }: { amounts: MatrixAmounts }) {
  return <>{amounts.byPerson.map(person => <td key={person.personId}>{pounds(person.amountPence)}</td>)}<td>{pounds(amounts.allocatedPence)}</td></>
}

function sumAmounts(accounts: readonly MatrixAccountRow[], model: TransferMatrixModel): MatrixAmounts {
  const sum = (value: (account: MatrixAccountRow) => number) => accounts.reduce((total, account) => total + value(account), 0)
  return {
    plannedPence: sum(account => account.plannedPence), allocatedPence: sum(account => account.allocatedPence),
    unallocatedPence: sum(account => account.unallocatedPence), incomplete: accounts.some(account => account.incomplete),
    byPerson: model.contributors.map(person => ({ personId: person.personId, amountPence: sum(account => account.byPerson.find(row => row.personId === person.personId)?.amountPence ?? 0) })),
  }
}

type Leaf = { key: string; account: MatrixAccountRow; allocation: MatrixDirectRow | MatrixPotRow; label: string; destination: PlanDestination }
type ProviderGroup = { key: string; label: string; accounts: MatrixAccountRow[]; amounts: MatrixAmounts; leaves: Leaf[] }
type OwnerGroup = { key: string; label: string; providers: ProviderGroup[]; amounts: MatrixAmounts }
/** An owner with one provider shows one merged band ("Ada · Starling") rather than repeating the provider beneath it. */
const soleProvider = (owner: OwnerGroup) => owner.providers.length === 1 ? owner.providers[0] : undefined

function groupedAccounts(model: TransferMatrixModel): OwnerGroup[] {
  const ownerKey = (account: MatrixAccountRow) => account.ownerPersonIds.length > 1 ? 'joint' : account.ownerPersonIds.length === 1 ? `person:${account.ownerPersonIds[0]}` : 'unassigned'
  const ownerLabel = (key: string) => key === 'joint' ? 'Joint' : key === 'unassigned' ? 'Needs owner' : model.contributors.find(person => `person:${person.personId}` === key)?.name ?? 'Needs owner'
  const ownerOrder = ['joint', ...model.contributors.map(person => `person:${person.personId}`), 'unassigned']
  return ownerOrder.flatMap(owner => {
    const accounts = model.accounts.filter(account => ownerKey(account) === owner)
    if (!accounts.length) return []
    const providers = new Map<string, MatrixAccountRow[]>()
    for (const account of accounts) {
      const label = account.provider?.trim() || 'Needs bank / provider'
      const key = label.toLocaleLowerCase('en-GB')
      providers.set(key, [...(providers.get(key) ?? []), account])
    }
    return [{ key: groupKey('owner', owner), label: ownerLabel(owner), amounts: sumAmounts(accounts, model),
      providers: [...providers].map(([providerKey, providerAccounts]) => {
        const key = groupKey('provider', owner, providerKey)
        const qualify = providerAccounts.length > 1
        return { key, label: providerAccounts[0]!.provider?.trim() || 'Needs bank / provider', accounts: providerAccounts,
          amounts: sumAmounts(providerAccounts, model),
          leaves: providerAccounts.flatMap(account => account.allocations.map(allocation => {
            const name = allocation.kind === 'pot' ? /\bpot$/i.test(allocation.name) ? allocation.name : `${allocation.name} pot` : 'Direct to account'
            return { key: groupKey('destination', account.accountId, allocation.id), account, allocation,
              label: qualify ? `${account.name} · ${name}` : name,
              destination: allocation.kind === 'pot' ? { kind: 'pot' as const, id: allocation.potId } : { kind: 'direct' as const, id: account.accountId } }
          })) }
      }),
    }]
  })
}

/** Read-only planned contributions; each lower level breaks down the subtotal above. */
export function MobileTransferMatrix({ model, labels, onPlanDestination, restoredExpandedIds }: {
  model: TransferMatrixModel
  labels: ReadonlyMap<string, string>
  onPlanDestination?: (destination: PlanDestination, accountId: string, expandedIds: string[]) => void
  restoredExpandedIds?: string[]
}) {
  const [hasOverflow, setHasOverflow] = useState(false)
  const [showGuidance, setShowGuidance] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => restoredExpandedIds ? new Set(groupedAccounts(model).flatMap(owner => [owner.key, ...owner.providers.map(provider => provider.key)]).filter(key => !restoredExpandedIds.includes(key))) : new Set())
  const owners = groupedAccounts(model)
  const expandedIds = owners.flatMap(owner => [owner.key, ...owner.providers.map(provider => provider.key)]).filter(key => !collapsed.has(key))
  const visibleOwners = owners.map(owner => ({ ...owner, collapsed: collapsed.has(owner.key) }))
  const groups: GroupedTableGroup[] = visibleOwners.flatMap(owner => [
    { key: owner.key, level: 0 },
    ...(!owner.collapsed && !soleProvider(owner) ? owner.providers.map(provider => ({ key: provider.key, level: 1, parentKey: owner.key })) : []),
  ])
  const toggle = (key: string, sticky: boolean) => {
    if (sticky && !collapsed.has(key)) {
      const wrap = window.document.querySelector<HTMLElement>('.transfer-matrix-scroll')
      const row = Array.from(wrap?.querySelectorAll<HTMLElement>('[data-group-key]') ?? []).find(element => element.dataset.groupKey === key)
      if (wrap && row) {
        const header = wrap.querySelector('thead')?.getBoundingClientRect().height ?? 0
        const ownerHeight = row.dataset.groupLevel === '1' ? parseFloat(wrap.style.getPropertyValue('--grouped-level-0-height')) || 0 : 0
        wrap.scrollTop += row.getBoundingClientRect().top - wrap.getBoundingClientRect().top - header - ownerHeight
      }
    }
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const parentContent = (key: string, name: string, provider?: ProviderGroup, sticky = false) => {
    const isCollapsed = collapsed.has(key)
    const Icon = isCollapsed ? ChevronRight : ChevronDown
    const account = provider?.accounts.length === 1 ? provider.accounts[0] : undefined
    return <div className="transfer-matrix-parent-content">
      <GroupedTableDisclosure groupKey={key} sticky={sticky} expanded={!isCollapsed} label={`${isCollapsed ? 'Expand' : 'Collapse'} ${name}`} onClick={() => toggle(key, sticky)}><Icon aria-hidden="true"/><span className={account && onPlanDestination ? 'visually-hidden' : undefined}>{name}</span></GroupedTableDisclosure>
      {account && onPlanDestination && <GroupedTableAction groupKey={key} controlKey={`${key}:account`} sticky={sticky} className="transfer-matrix-parent-action" data-matrix-plan-kind="account" data-matrix-plan-id={account.accountId} data-matrix-account-id={account.accountId} label={`View items for ${labels.get(account.accountId) ?? account.name} in Plan`} onClick={() => onPlanDestination({kind:'account', id:account.accountId}, account.accountId, expandedIds)}>{name}</GroupedTableAction>}
    </div>
  }
  const action = (destination: PlanDestination, account: MatrixAccountRow, label: string, key: string, sticky = false) => onPlanDestination ?
    <GroupedTableAction groupKey={key} sticky={sticky} className="transfer-matrix-name-action"
      data-matrix-plan-kind={destination.kind} data-matrix-plan-id={destination.id} data-matrix-account-id={account.accountId}
      label={destination.kind === 'account' ? `View items for ${labels.get(account.accountId) ?? account.name} in Plan` : `View ${label.startsWith(`${account.name} · `) ? label.slice(account.name.length + 3) : label} items for ${labels.get(account.accountId) ?? account.name} in Plan`}
      onClick={() => onPlanDestination(destination, account.accountId, expandedIds)}>{label}</GroupedTableAction> : <span>{label}</span>
  const renderStickyGroup = (group: GroupedTableGroup) => {
    const owner = owners.find(row => row.key === group.key)
    const sole = owner && soleProvider(owner)
    const provider = sole ?? owners.flatMap(row => row.providers).find(row => row.key === group.key)
    const amounts = owner?.amounts ?? provider?.amounts
    if (!amounts) return null
    const name = owner ? sole ? `${owner.label} · ${sole.label}` : owner.label : provider?.label ?? ''
    return <div key={group.key} className={`grouped-table-sticky-band transfer-matrix-sticky-level-${group.level}`}>
      <div className="transfer-matrix-sticky-label">{parentContent(group.key, name, provider, true)}{amounts.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</div>
      {amounts.byPerson.map(person => <span key={person.personId}>{pounds(person.amountPence)}</span>)}<strong>{pounds(amounts.allocatedPence)}</strong>
    </div>
  }

  return <section className="transfer-matrix" aria-labelledby="transfer-matrix-title">
    <div className="transfer-matrix-intro">
      <div className="transfer-matrix-intro-heading"><h3 id="transfer-matrix-title">Planned contributions</h3></div>
      <div className="transfer-matrix-cue"><span>Funding requirements · exact amounts</span><button type="button" className="transfer-matrix-info" aria-label="About planned contributions" aria-expanded={showGuidance} aria-controls="transfer-matrix-guidance" onClick={() => setShowGuidance(value => !value)}>ⓘ</button></div>
      <p id="transfer-matrix-guidance" hidden={!showGuidance}>These are account funding requirements, not payment records. Each row below breaks down the subtotal above; do not add it again. Pot allocations are moved within the account after funding. Source accounts and automatic payments are not recorded.</p>
      {model.totals.incomplete && <p className="transfer-matrix-warning" role="status"><strong>Incomplete allocation.</strong> {pounds(model.totals.plannedPence)} planned; {pounds(model.totals.unallocatedPence)} still unallocated. The table shows allocated amounts.</p>}
    </div>
    {model.accounts.length === 0 ? <p className="transfer-matrix-empty">No transfers planned. Add a budget item to an account or pot to see it here.</p> : <>
      {hasOverflow && <p className="transfer-matrix-scroll-hint" id="transfer-matrix-scroll-hint">Scroll sideways or use the arrow keys to see all columns.</p>}
      <GroupedTable wrapClassName="transfer-matrix-scroll" className="transfer-matrix-table"
        horizontalScrollStep={60} regionLabel="Transfer matrix" caption="Planned contributions by owner, provider, destination and person. Exact amounts in pounds and pence. Each lower level is included in the subtotal above."
        ariaDescribedBy={hasOverflow ? 'transfer-matrix-scroll-hint' : undefined} onOverflowChange={setHasOverflow}
        columns={[{ key: 'destination', label: 'Destination' }, ...model.contributors.map(person => ({ key: person.personId, label: person.name })), { key: 'total', label: 'Total' }]}
        groups={groups} renderStickyGroup={renderStickyGroup}
        footer={<tr><th scope="row" aria-label={`Funding total${model.totals.incomplete ? ' Incomplete' : ''}`}>Funding total{model.totals.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</th><AmountCells amounts={model.totals}/></tr>}>
        {visibleOwners.flatMap(owner => {
          const sole = soleProvider(owner)
          const leafRow = (leaf: Leaf, parentLabel: string, level: number, parentKey: string) => <tr key={leaf.key} className="transfer-matrix-allocation" data-group-level={level} data-group-key={leaf.key} data-parent-key={parentKey}><th scope="row" aria-label={`${parentLabel}: ${leaf.label}${leaf.allocation.incomplete ? ' Incomplete' : ''}`}>{action(leaf.destination, leaf.account, leaf.label, leaf.key)}{leaf.allocation.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</th><AmountCells amounts={leaf.allocation}/></tr>
          if (sole) {
            const label = `${owner.label} · ${sole.label}`
            return [
              <tr key={owner.key} className="transfer-matrix-owner" data-group-level="0" data-group-key={owner.key}><th scope="row" aria-label={`${label}${owner.amounts.incomplete ? ' Incomplete' : ''}`}>{parentContent(owner.key, label, sole)}{owner.amounts.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</th><AmountCells amounts={owner.amounts}/></tr>,
              ...(!owner.collapsed ? sole.leaves.map(leaf => leafRow(leaf, `${owner.label}: ${sole.label}`, 1, owner.key)) : []),
            ]
          }
          return [
          <tr key={owner.key} className="transfer-matrix-owner" data-group-level="0" data-group-key={owner.key}><th scope="row" aria-label={`${owner.label}${owner.amounts.incomplete ? ' Incomplete' : ''}`}>{parentContent(owner.key, owner.label)}{owner.amounts.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</th><AmountCells amounts={owner.amounts}/></tr>,
          ...(!owner.collapsed ? owner.providers.flatMap(provider => [
            <tr key={provider.key} className="transfer-matrix-provider" data-group-level="1" data-group-key={provider.key} data-parent-key={owner.key}><th scope="row" aria-label={`${owner.label}: ${provider.label}${provider.amounts.incomplete ? ' Incomplete' : ''}`}>{parentContent(provider.key, provider.label, provider)}{provider.amounts.incomplete && <span className="transfer-matrix-incomplete" aria-hidden="true">!</span>}</th><AmountCells amounts={provider.amounts}/></tr>,
            ...(!collapsed.has(provider.key) ? provider.leaves.map(leaf => leafRow(leaf, `${owner.label}: ${provider.label}`, 2, provider.key)) : []),
          ]) : []),
          ]
        })}
      </GroupedTable>
    </>}
  </section>
}
