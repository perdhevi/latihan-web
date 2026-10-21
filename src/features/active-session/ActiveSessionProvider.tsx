import { useState, type ReactNode } from 'react'
import { DraftContext } from './context'
import { browserStorage, createDraftStore } from './store'

/**
 * Holds the signed-in user's session in progress. The storage key carries the
 * user id, so another account signing in on this browser never sees it.
 * Remount (key={userId}) when the user changes.
 */
export function ActiveSessionProvider({
  userId,
  storage = browserStorage(),
  children,
}: {
  userId: string
  storage?: Storage | null
  children: ReactNode
}) {
  const [store] = useState(() => createDraftStore(storage, `latihan.activeSession.v1.${userId}`))
  return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>
}
