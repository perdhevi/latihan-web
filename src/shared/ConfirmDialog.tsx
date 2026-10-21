import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A modal question with two answers. Built on <dialog> and showModal(), so
 * the browser traps focus, makes the page behind it inert, and closes it on
 * Escape (which counts as Cancel).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: let React's state close it, so `open` stays the truth.
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
