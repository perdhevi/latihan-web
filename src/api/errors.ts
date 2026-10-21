import type { components } from './schema'

/** Every error code the contract documents. */
export type ApiErrorCode = components['schemas']['Error']['error']['code']

/**
 * Codes the client adds for failures that never produced a contract error:
 * the request did not reach the server, or something other than the API
 * answered (a proxy's HTML error page, say).
 */
export type ClientErrorCode = 'network_error' | 'unexpected_response'

/**
 * A failed API call. `status` is 0 when there is no usable HTTP response:
 * the request never arrived, or the body could not be read.
 * `requestId` is the server's X-Request-ID, worth showing to the user so a
 * report can be matched to the server log.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | ClientErrorCode
  readonly requestId: string | undefined
  /** Seconds to wait before retrying, from Retry-After (429, 503). */
  readonly retryAfter: number | undefined

  constructor(
    status: number,
    code: ApiErrorCode | ClientErrorCode,
    message: string,
    options: { requestId?: string; retryAfter?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = options.requestId
    this.retryAfter = options.retryAfter
  }
}

export function isApiError(
  error: unknown,
  code?: ApiErrorCode | ClientErrorCode,
): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

/** Retry-After is either delay-seconds or an HTTP date. */
export function retryAfterSeconds(
  response: Response,
  now: number = Date.now(),
): number | undefined {
  const value = response.headers.get('Retry-After')
  if (value === null) return undefined
  if (/^\d+$/.test(value.trim())) return Number(value)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - now) / 1000))
}

function isContractError(
  body: unknown,
): body is components['schemas']['Error'] {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false
  const error = body.error
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

/** Builds an ApiError from a non-2xx response and its (parsed) body. */
export function errorFromResponse(response: Response, body: unknown): ApiError {
  const options = {
    requestId: response.headers.get('X-Request-ID') ?? undefined,
    retryAfter: retryAfterSeconds(response),
  }
  if (isContractError(body)) {
    return new ApiError(
      response.status,
      body.error.code,
      body.error.message,
      options,
    )
  }
  return new ApiError(
    response.status,
    'unexpected_response',
    `The server answered ${response.status} ${response.statusText}`.trim() + '.',
    options,
  )
}
