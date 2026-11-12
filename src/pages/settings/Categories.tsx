import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, ListRow, Sheet } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { resolveBudget, type BudgetCategory } from '../../domain/monthlyBudget'
import { formatMonth } from '../../formatting/month'
import { BudgetOptionsMenu } from '../BudgetOptionsMenu'
import './settings.css'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; notify: (message: string) => void }

/** A category's name; names are unique, ignoring case. */
function CategoryForm({ document, category, formId, onSave }: { document: BudgetDocument; category?: BudgetCategory; formId: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [error, setError] = useState('')
  const save = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name.'); return }
    if (document.budget.categories.some(row => row.id !== category?.id && row.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())) { setError('A category with this name already exists.'); return }
    onSave(trimmed)
  }
  return <form id={formId} className="settings-form" aria-label={category ? 'Rename category' : 'Add category'} onSubmit={save} noValidate>
    <label>Category name<input data-autofocus value={name} onChange={event => { setName(event.target.value); setError('') }} aria-invalid={!!error || undefined}/></label>
    {error && <p className="input-error" role="alert">{error}</p>}
  </form>
}

/** Settings › Categories: how Plan groups items, with each one's item count for the selected month. */
export function Categories({ document, setDocument, month, notify }: Props) {
  const formId = useId()
  const [editing, setEditing] = useState<BudgetCategory | 'new' | null>(null)
  const { categories } = document.budget
  const items = resolveBudget(document.budget, month).items
  const count = (id: string) => items.filter(item => item.categoryId === id).length
  return <div className="settings-categories">
    <div className="settings-toolbar">
      <p className="settings-lead">How Plan groups the items. Shared by every month.</p>
      <div className="settings-toolbar-actions"><button type="button" className="secondary-button" onClick={() => setEditing('new')}><Plus aria-hidden="true"/>Add category</button></div>
    </div>
    {categories.length ? <ul className="settings-list" aria-label="Categories">{categories.map(category => <li key={category.id}>
      <ListRow title={category.name} meta={`${count(category.id)} ${count(category.id) === 1 ? 'item' : 'items'} in ${formatMonth(month).replace(/ \d{4}$/, '')}`}
        trailing={<BudgetOptionsMenu row label={`More actions for ${category.name}`} options={[{ label: 'Rename', onSelect: () => setEditing(category) }]}/>}/>
    </li>)}</ul> : <EmptyState title="No categories yet">Add one to group the plan’s items, like Bills or Food.</EmptyState>}
    {editing && <Sheet title={editing === 'new' ? 'Add category' : `Rename ${editing.name}`} size="sm" onClose={() => setEditing(null)} footer={<>
      <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
      <button type="submit" form={formId} className="primary-button">{editing === 'new' ? 'Add category' : 'Save category'}</button>
    </>}>
      <CategoryForm document={document} category={editing === 'new' ? undefined : editing} formId={formId} onSave={name => {
        setDocument(current => ({ ...current, budget: { ...current.budget, categories: editing === 'new' ? [...current.budget.categories, { id: crypto.randomUUID(), name }] : current.budget.categories.map(row => row.id === editing.id ? { ...row, name } : row) } }))
        setEditing(null); notify(editing === 'new' ? `${name} added.` : 'Category saved.')
      }}/>
    </Sheet>}
  </div>
}
