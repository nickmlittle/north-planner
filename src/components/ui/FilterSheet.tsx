import { Sheet } from './Sheet'
import './FilterSheet.css'

export type FilterGroup = { key: string; label: string; options: Array<{ value: string; label: string; group?: string }> }

/**
 * Filters in a Sheet (a dialog on desktop, a bottom sheet on phones): checkbox groups, any value within a group.
 * Changes apply as they're ticked; Clear empties every group.
 */
export function FilterSheet({ title = 'Filter', groups, selected, onChange, onClear, onClose }: { title?: string; groups: FilterGroup[]; selected: Record<string, string[]>; onChange: (key: string, values: string[]) => void; onClear: () => void; onClose: () => void }) {
  return <Sheet title={title} onClose={onClose} dismissOnScrim footer={<>
    <button type="button" className="secondary-button" onClick={onClear}>Clear</button>
    <button type="button" className="primary-button" data-autofocus onClick={onClose}>Done</button>
  </>}>
    <div className="filter-sheet">{groups.filter(group => group.options.length).map(group => <fieldset key={group.key} className="filter-sheet-group">
      <legend>{group.label}</legend>
      {group.options.map((option, index) => {
        const heading = option.group && option.group !== group.options[index - 1]?.group ? <p className="filter-sheet-subhead">{option.group}</p> : null
        const checked = (selected[group.key] ?? []).includes(option.value)
        return <div key={option.value}>{heading}<label className="filter-sheet-option"><input type="checkbox" checked={checked} onChange={() => onChange(group.key, checked ? (selected[group.key] ?? []).filter(value => value !== option.value) : [...selected[group.key] ?? [], option.value])}/>{option.label}</label></div>
      })}
    </fieldset>)}</div>
  </Sheet>
}
