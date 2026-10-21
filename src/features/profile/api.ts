import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '../../api/client'
import { isApiError } from '../../api/errors'
import { useAuth } from '../../auth/context'

export const meQueryKey = ['users', 'me'] as const

/**
 * The signed-in user's profile. An account without one gets
 * `403 profile_required` here, and from every other data endpoint.
 * `retryOnMount: false` takes a cached error as it is instead of asking again.
 */
export function useMe({ retryOnMount = true } = {}) {
  const { api } = useAuth()
  return useQuery({
    queryKey: meQueryKey,
    retryOnMount,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/users/{userID}', { params: { path: { userID: 'me' } }, signal })),
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
      unwrap(
        api.POST('/api/v1/users', {
          params: { header: { 'Idempotency-Key': idempotencyKey } },
          body: { display_name: displayName.trim() },
        }),
      ),
    onSuccess: (user) => queryClient.setQueryData(meQueryKey, user),
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
