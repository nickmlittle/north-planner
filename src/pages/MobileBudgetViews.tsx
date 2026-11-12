import type { ReactNode } from 'react'
import { ModalDialog } from '../components/ModalDialog'

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <ModalDialog title={title} onClose={onClose}>{children}</ModalDialog>
}

