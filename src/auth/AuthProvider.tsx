import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AuthContext, type Auth, type AuthStatus } from './context'
import type { Session } from './session'

export function AuthProvider({ session, children }: { session: Session; children: ReactNode }) {
  const { tokens } = session
  const hasAccess = useSyncExternalStore(tokens.subscribe, () => tokens.access !== null)
  const hasRefresh = useSyncExternalStore(tokens.subscribe, () => tokens.refresh !== null)
  const [resumed, setResumed] = useState(false)

  // After a reload only the refresh token is left. Trade it now, so the
  // first screen knows whether the session is still alive. A network error
  // keeps the token: the next request tries again.
  useEffect(() => {
    if (tokens.access !== null || tokens.refresh === null) return
    session
      .refresh()
      .catch(() => {})
      .finally(() => setResumed(true))
  }, [session, tokens])

  const status: AuthStatus = !hasRefresh ? 'signedOut' : hasAccess || resumed ? 'signedIn' : 'unknown'

  const auth = useMemo<Auth>(
    () => ({ status, api: session.api, signIn: session.signIn, register: session.register, signOut: session.signOut }),
    [status, session],
  )
  return <AuthContext value={auth}>{children}</AuthContext>
}
