import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApiClient, unwrap } from './client'
import { ApiError, isApiError, retryAfterSeconds } from './errors'

// Tests run in Node, where fetch needs an absolute URL. openapi-fetch keeps
// the fetch it was created with, so look it up per call: MSW replaces
// globalThis.fetch only when server.listen() runs.
const origin = 'http://latihan.test'
const api = createApiClient({ baseUrl: origin, fetch: (request) => globalThis.fetch(request) })

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function failure(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiError)) throw new Error(`expected ApiError, got ${String(error)}`)
  return error
}

describe('unwrap', () => {
  it('returns the typed body of a success', async () => {
    server.use(
      http.get(`${origin}/api/v1/exercises`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('limit')).toBe('2')
        return HttpResponse.json({
          items: [
            {
              id: '0190c6a8-0000-7000-8000-000000000001',
              name: 'Back Squat',
              description: '',
              category: 'strength',
              muscle_group: 'legs',
              equipment: 'barbell',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        })
      }),
    )
    const page = await unwrap(api.GET('/api/v1/exercises', { params: { query: { limit: 2 } } }))
    expect(page.items[0].name).toBe('Back Squat')
  })

  it('turns the contract error body into an ApiError', async () => {
    server.use(
      http.get(`${origin}/api/v1/exercises`, () =>
        HttpResponse.json(
          { error: { code: 'unauthenticated', message: 'valid bearer token required' } },
          { status: 401, headers: { 'X-Request-ID': 'req-123' } },
        ),
      ),
    )
    const error = await failure(unwrap(api.GET('/api/v1/exercises')))
    expect(error.status).toBe(401)
    expect(error.code).toBe('unauthenticated')
    expect(error.message).toBe('valid bearer token required')
    expect(error.requestId).toBe('req-123')
    expect(isApiError(error, 'unauthenticated')).toBe(true)
    expect(isApiError(error, 'plan_in_use')).toBe(false)
  })

  it('reads Retry-After from a rate-limited response', async () => {
    server.use(
      http.get(`${origin}/api/v1/exercises`, () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'too many requests' } },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    )
    const error = await failure(unwrap(api.GET('/api/v1/exercises')))
    expect(error.code).toBe('rate_limited')
    expect(error.retryAfter).toBe(30)
  })

  it('reports a non-API error page as unexpected_response', async () => {
    server.use(
      http.get(`${origin}/api/v1/exercises`, () =>
        new HttpResponse('<html>Bad Gateway</html>', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const error = await failure(unwrap(api.GET('/api/v1/exercises')))
    expect(error.status).toBe(502)
    expect(error.code).toBe('unexpected_response')
  })

  it('reports a success that is not JSON as unexpected_response', async () => {
    server.use(
      http.get(`${origin}/api/v1/exercises`, () => HttpResponse.html('<!doctype html><title>app</title>')),
    )
    const error = await failure(unwrap(api.GET('/api/v1/exercises')))
    expect(error.code).toBe('unexpected_response')
  })

  it('reports an unreachable server as network_error', async () => {
    server.use(http.get(`${origin}/api/v1/exercises`, () => HttpResponse.error()))
    const error = await failure(unwrap(api.GET('/api/v1/exercises')))
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
  })

  it('lets cancellation through unchanged', async () => {
    server.use(http.get(`${origin}/api/v1/exercises`, () => new Promise<never>(() => {})))
    const controller = new AbortController()
    const call = unwrap(api.GET('/api/v1/exercises', { signal: controller.signal }))
    controller.abort()
    await expect(call).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('retryAfterSeconds', () => {
  const at = (value: string) => new Response(null, { headers: { 'Retry-After': value } })

  it('accepts delay-seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-21T10:00:00Z')
    expect(retryAfterSeconds(at('120'), now)).toBe(120)
    expect(retryAfterSeconds(at('Wed, 21 Oct 2026 10:01:00 GMT'), now)).toBe(60)
    expect(retryAfterSeconds(at('Wed, 21 Oct 2026 09:00:00 GMT'), now)).toBe(0)
  })

  it('ignores a missing or malformed header', () => {
    expect(retryAfterSeconds(new Response(null))).toBeUndefined()
    expect(retryAfterSeconds(at('soon'))).toBeUndefined()
  })
})

// These never run; `tsc -b` checks them. Each @ts-expect-error fails the
// build if the contract stops rejecting that mistake.
export function contractChecks() {
  // @ts-expect-error: not a path the API serves
  void api.GET('/api/v1/workouts')
  // @ts-expect-error: misspelt query parameter
  void api.GET('/api/v1/exercises', { params: { query: { limt: 5 } } })
  // @ts-expect-error: the plan path needs an id
  void api.GET('/api/v1/plans/{id}', {})
  // @ts-expect-error: display_name is required to create a profile
  void api.POST('/api/v1/users', { body: {} })
}
