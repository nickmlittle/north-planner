import type { ReactNode } from 'react'
import { ModalDialog } from './ModalDialog'

/** Replaces window.confirm: the scope sentence is the body, and focus starts on the safe choice. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', danger = false, onConfirm, onCancel, returnFocusTo }: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  returnFocusTo?: () => HTMLElement | null | undefined
}) {
  return <ModalDialog title={title} onClose={onCancel} className="confirm-dialog" returnFocusTo={returnFocusTo} footer={<>
    <button type="button" className="secondary-button" data-autofocus onClick={onCancel}>{cancelLabel}</button>
    <button type="button" className={danger ? 'danger-button' : 'primary-button'} onClick={onConfirm}>{confirmLabel}</button>
  </>}>
    <div className="confirm-dialog-body">{children}</div>
  </ModalDialog>
}
