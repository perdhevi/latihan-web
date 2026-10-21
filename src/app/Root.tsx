import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '../auth/context'

/**
 * The top route. Drops all cached API data when the session ends (sign-out,
 * or a rejected refresh), so the next user to sign in never sees it.
 */
export function Root() {
  const { status } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear()
  }, [status, queryClient])
  return <Outlet />
}
