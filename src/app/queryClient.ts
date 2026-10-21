import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '../api/errors'

/**
 * Worth retrying on its own: the server was unreachable or failed. A 4xx is
 * an answer (retrying a 403 or 404 only repeats it) and a 429 asks us to wait
 * longer than a quick retry would.
 */
function isTransient(error: unknown): boolean {
  return isApiError(error) && (error.code === 'network_error' || error.status >= 500)
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < 2 && isTransient(error),
      },
      // Writes are retried by the user, with the same idempotency key.
      mutations: { retry: false },
    },
  })
}
