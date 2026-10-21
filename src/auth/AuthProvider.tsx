import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AuthContext, type Auth, type AuthStatus } from './context'
import type { Session } from './session'

export function AuthProvider({ session, children }: { session: Session; children: ReactNode }) {
  const { tokens } = session
  const hasAccess = useSyncExternalStore(tokens.subscribe, () => tokens.access !== null)
  const hasRefresh = useSyncExternalStore(tokens.subscribe, () => tokens.refresh !== null)
  const [resumed, setResumed] = useState(false)
  // Kept here, not in navigation state: the sign-in guard navigates on its
  // own when the tokens go, and would replace any state passed along.
  const [notice, setNotice] = useState<string | null>(null)

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
    () => ({
      status,
      notice,
      api: session.api,
      signIn: async (email, password) => {
        setNotice(null)
        await session.signIn(email, password)
      },
      register: async (email, password) => {
        setNotice(null)
        await session.register(email, password)
      },
      signOut: session.signOut,
      forget: (message) => {
        setNotice(message ?? null)
        session.forget()
      },
    }),
    [status, notice, session],
  )
  return <AuthContext value={auth}>{children}</AuthContext>
}
