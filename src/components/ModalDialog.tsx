import type { ComponentProps } from 'react'
import { Sheet } from './ui/Sheet'

/**
 * The original modal API, now drawn by Sheet (desktop dialog, phone bottom sheet). Its users keep their
 * props; those that end their content with an action row move it to Sheet's `footer` in their screen's PR.
 */
export function ModalDialog(props: Omit<ComponentProps<typeof Sheet>, 'size'> & { size?: ComponentProps<typeof Sheet>['size'] }) {
  return <Sheet size="sm" {...props}/>
}
