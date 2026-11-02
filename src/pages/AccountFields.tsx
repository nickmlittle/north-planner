import { accountTypes } from '../domain/accountTypes'

export type AccountFieldsValue = { name: string; provider: string; ownerPersonIds: string[]; accountTypeId: string }
type Props = { value: AccountFieldsValue; adults: Array<{ id: string; name: string }>; onChange: (value: AccountFieldsValue) => void }

export function AccountFields({ value, adults, onChange }: Props) {
  return <>
    <fieldset className="budget-account-owners"><legend>Owners</legend>{adults.map(person => <label key={person.id}>
      <input type="checkbox" checked={value.ownerPersonIds.includes(person.id)} onChange={event => onChange({ ...value, ownerPersonIds: event.target.checked ? [...value.ownerPersonIds, person.id] : value.ownerPersonIds.filter(id => id !== person.id) })}/>{person.name}
    </label>)}</fieldset>
    <label>Bank / provider<input value={value.provider} onChange={event => onChange({ ...value, provider: event.target.value })}/></label>
    <label>Account type<select value={value.accountTypeId} onChange={event => onChange({ ...value, accountTypeId: event.target.value })}>
      <option value="">Choose an account type</option>{accountTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
    </select></label>
    <label>Nickname (optional)<input value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} placeholder="For example, Everyday spending"/></label>
  </>
}
