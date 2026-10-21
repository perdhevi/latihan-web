import { createContext, useContext, useSyncExternalStore } from 'react'
import type { DraftStore } from './store'

export const DraftContext = createContext<DraftStore | null>(null)

/** The session in progress (null when there is none), and how to change it. */
export function useActiveSession() {
  const store = useContext(DraftContext)
  if (store === null) throw new Error('useActiveSession must be used inside <ActiveSessionProvider>')
  const draft = useSyncExternalStore(store.subscribe, store.get)
  return { draft, saved: store.saved(), dispatch: store.dispatch }
}
