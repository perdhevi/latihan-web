import { createContext, useContext } from 'react'
import type { Session } from './session'

/**
 * `unknown` while a session restored from storage is being confirmed (the
 * first refresh after a reload); then `signedIn` or `signedOut`.
 */
export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn'

export type Auth = Pick<Session, 'signIn' | 'register' | 'signOut'> & { status: AuthStatus }

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (auth === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
