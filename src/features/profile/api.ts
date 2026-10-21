import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrapVersioned } from '../../api/client'
import { ifMatch, type Versioned } from '../../api/concurrency'
import { isApiError } from '../../api/errors'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'

export type User = components['schemas']['User']

/** Holds the profile with its ETag (`Versioned<User>`); `useMe()` selects the user. */
export const meQueryKey = ['users', 'me'] as const

/**
 * The signed-in user's profile. An account without one gets
 * `403 profile_required` here, and from every other data endpoint.
 * `retryOnMount: false` takes a cached error as it is instead of asking again.
 */
export function useMe({ retryOnMount = true } = {}) {
  return useQuery({ ...meQuery(useAuth().api), retryOnMount, select: (me: Versioned<User>) => me.data })
}

/** The profile with the ETag it was read at, for renaming. Same cache entry as `useMe()`. */
export function useMeVersioned() {
  return useQuery(meQuery(useAuth().api))
}

function meQuery(api: ReturnType<typeof useAuth>['api']) {
  return {
    queryKey: meQueryKey,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      unwrapVersioned(api.GET('/api/v1/users/{userID}', { params: { path: { userID: 'me' } }, signal })),
  }
}

/**
 * Renames the profile, if it is still at the version `etag` was read at;
 * otherwise `412 precondition_failed`. The answer goes into the cache, so
 * the top bar shows the new name at once.
 */
export function useRenameProfile() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ displayName, etag }: { displayName: string; etag: string | null }) =>
      unwrapVersioned(
        api.PUT('/api/v1/users/{userID}', {
          params: { path: { userID: 'me' }, header: ifMatch(etag) },
          body: { display_name: displayName.trim() },
        }),
      ),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  })
}

/**
 * Creates the profile. The caller passes the same idempotency key on every
 * retry of one submission, so a create whose response was lost is replayed by
 * the server instead of failing with `profile_exists`.
 */
export function useCreateProfile() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ displayName, idempotencyKey }: { displayName: string; idempotencyKey: string }) =>
      unwrapVersioned(
        api.POST('/api/v1/users', {
          params: { header: { 'Idempotency-Key': idempotencyKey } },
          body: { display_name: displayName.trim() },
        }),
      ),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
    onError: (error) => {
      // Created already, by another tab or an earlier attempt with another
      // key: load it instead of reporting an error.
      if (isApiError(error, 'profile_exists')) void queryClient.invalidateQueries({ queryKey: meQueryKey })
    },
  })
}

// The contract's limit (UserInput.display_name). The server trims the name
// and counts Unicode code points, as the credential checks do.
const maxDisplayName = 200

/** Returns the message to show, or null when the name may be sent. */
export function checkDisplayName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Enter a display name.'
  if ([...trimmed].length > maxDisplayName) return `A display name has at most ${maxDisplayName} characters.`
  return null
}
