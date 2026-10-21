import createClient, { type ClientOptions } from 'openapi-fetch'
import type { Versioned } from './concurrency'
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
  return (await settle(call)).data
}

/**
 * Like unwrap, and also returns the record's ETag, the version to send back
 * in If-Match when the record is written (see api/concurrency.ts).
 */
export async function unwrapVersioned<Result extends FetchResult>(
  call: Promise<Result>,
): Promise<Versioned<SuccessData<Result>>> {
  const { data, response } = await settle(call)
  return { data, etag: response.headers.get('ETag') }
}

async function settle<Result extends FetchResult>(
  call: Promise<Result>,
): Promise<{ data: SuccessData<Result>; response: Response }> {
  let result: Result
  try {
    result = await call
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    // Middleware (the auth session) already speaks ApiError: a rejected
    // refresh must not be reported as a network failure.
    if (cause instanceof ApiError) throw cause
    // A success body that is not JSON surfaces here as a SyntaxError.
    if (cause instanceof SyntaxError) {
      throw new ApiError(0, 'unexpected_response', 'The server sent a response that is not JSON.', { cause })
    }
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.', { cause })
  }
  if (result.error !== undefined || !result.response.ok) {
    throw errorFromResponse(result.response, result.error)
  }
  return { data: result.data as SuccessData<Result>, response: result.response }
}
