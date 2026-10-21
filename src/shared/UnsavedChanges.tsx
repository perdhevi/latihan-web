import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * While `dirty`, leaving the page asks first. In-app navigation is blocked
 * until the user answers the dialog this renders; closing the tab or
 * reloading gets the browser's own question (beforeunload).
 *
 * Unmount the component to let the user go after a save: its blocker goes
 * with it in the same commit, so no question follows.
 */
export function UnsavedChanges({ dirty, title }: { dirty: boolean; title: string }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      currentLocation.pathname !== nextLocation.pathname &&
      // Signed out, or the profile is gone: the app is moving the user, and
      // keeping them here would not keep the changes.
      nextLocation.pathname !== '/sign-in' &&
      nextLocation.pathname !== '/welcome',
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={title}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      <p>Unsaved changes will be lost.</p>
    </ConfirmDialog>
  )
}
