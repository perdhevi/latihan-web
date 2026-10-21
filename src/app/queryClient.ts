import { hashKey, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '../api/errors'
import { meQueryKey } from '../features/profile/api'

/**
 * Worth retrying on its own: the server was unreachable or failed. A 4xx is
 * an answer (retrying a 403 or 404 only repeats it) and a 429 asks us to wait
 * longer than a quick retry would.
 */
function isTransient(error: unknown): boolean {
  return isApiError(error) && (error.code === 'network_error' || error.status >= 500)
}

export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // The profile was deleted while the app is open, so every data
        // endpoint now answers profile_required. Asking for `me` again lets
        // the profile gate send the user to /welcome.
        if (isApiError(error, 'profile_required') && query.queryHash !== hashKey(meQueryKey)) {
          void queryClient.invalidateQueries({ queryKey: meQueryKey })
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < 2 && isTransient(error),
      },
      // Writes are retried by the user, with the same idempotency key.
      mutations: { retry: false },
    },
  })
  return queryClient
}
