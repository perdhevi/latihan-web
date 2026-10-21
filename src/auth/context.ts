import { createContext, useContext } from 'react'
import type { Session } from './session'

/**
 * `unknown` while a session restored from storage is being confirmed (the
 * first refresh after a reload); then `signedIn` or `signedOut`.
 */
export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn'

/** `api` is the session's authenticated client; features call the API through it. */
export type Auth = Pick<Session, 'api' | 'signIn' | 'register' | 'signOut'> & {
  status: AuthStatus
  /**
   * Ends the session here without asking the server (it has ended it
   * already, e.g. the account was erased); `notice` is shown on the sign-in
   * page until the next sign-in.
   */
  forget: (notice?: string) => void
  notice: string | null
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (auth === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
