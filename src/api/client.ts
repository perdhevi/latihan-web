import createClient, { type ClientOptions } from 'openapi-fetch'
import { ApiError, errorFromResponse } from './errors'
import type { paths } from './schema'

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * A client whose paths, parameters, bodies and responses are all typed from
 * the API contract. The default base URL is empty, so requests go to this
 * page's own origin (`/api/v1/...`) and reach the API through the proxy.
 */
export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>({ baseUrl: '', ...options })
}

/** The client the app uses. Part 2 adds authentication to it. */
export const api = createApiClient()

type FetchResult =
  | { data: unknown; error?: never; response: Response }
  | { data?: never; error: unknown; response: Response }

/** The body type of the success branch only. */
type SuccessData<Result> = Result extends { data: infer Data; error?: never }
  ? Data
  : never

/**
 * Turns openapi-fetch's `{ data, error, response }` into a value or a thrown
 * ApiError, so callers (and later TanStack Query) handle one failure type.
 *
 *   const page = await unwrap(api.GET('/api/v1/exercises'))
 *
 * Aborted requests are rethrown unchanged so cancellation stays cancellation.
 */
export async function unwrap<Result extends FetchResult>(
  call: Promise<Result>,
): Promise<SuccessData<Result>> {
  let result: Result
  try {
    result = await call
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    // A success body that is not JSON surfaces here as a SyntaxError.
    if (cause instanceof SyntaxError) {
      throw new ApiError(0, 'unexpected_response', 'The server sent a response that is not JSON.', { cause })
    }
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.', { cause })
  }
  if (result.error !== undefined || !result.response.ok) {
    throw errorFromResponse(result.response, result.error)
  }
  return result.data as SuccessData<Result>
}
