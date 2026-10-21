import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context'
import type { FromState } from './redirect'

/**
 * Renders its child routes for a signed-in user. Anyone else goes to the
 * sign-in page, which brings them back here afterwards.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'unknown') return <RestoringSession />
  if (status === 'signedOut') {
    return <Navigate to="/sign-in" replace state={{ from: location } satisfies FromState} />
  }
  return <Outlet />
}

export function RestoringSession() {
  return (
    <main className="auth">
      <p>Restoring your session…</p>
    </main>
  )
}
