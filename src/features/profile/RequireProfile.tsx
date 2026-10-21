import { Navigate, Outlet, useLocation } from 'react-router'
import { isApiError } from '../../api/errors'
import type { FromState } from '../../auth/redirect'
import { useMe } from './api'

/**
 * Renders its child routes once the user has a profile. An account without
 * one is sent to /welcome to create it; every data endpoint would refuse it
 * with `403 profile_required` anyway.
 */
export function RequireProfile() {
  const me = useMe()
  const location = useLocation()
  // Checked first: a profile deleted elsewhere shows up on a refetch, while
  // the old data is still cached.
  if (isApiError(me.error, 'profile_required')) {
    return <Navigate to="/welcome" replace state={{ from: location } satisfies FromState} />
  }
  // A failed background refetch keeps the cached profile; carry on with it.
  if (me.data !== undefined) return <Outlet />
  if (me.isError) throw me.error
  return <p className="status">Loading your profile…</p>
}
