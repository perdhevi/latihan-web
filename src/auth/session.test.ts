import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { unwrap } from '../api/client'
import { ApiError } from '../api/errors'
import { checkCredentials, describeAuthError } from './credentials'
import { createSession } from './session'
import { createTokenStore, memoryStorage, refreshTokenKey } from './tokens'

// See client.test.ts: Node's fetch needs an absolute URL, and the client must
// look fetch up per call so MSW can replace it.
const origin = 'http://latihan.test'
const fetch = (request: Request) => globalThis.fetch(request)

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const tokenResponse = (n: number) => ({
  access_token: `access-${n}`,
  token_type: 'Bearer' as const,
  expires_in: 900,
  refresh_token: `refresh-${n}`,
})

const unauthenticated = () =>
  HttpResponse.json({ error: { code: 'unauthenticated', message: 'valid bearer token required' } }, { status: 401 })

/**
 * A fake API whose only valid access token is `valid`, and whose refresh
 * endpoint rotates: refresh-n becomes access-(n+1) / refresh-(n+1). It records
 * what it was sent.
 */
function fakeApi(valid: () => string) {
  const calls = { refresh: [] as string[], logout: [] as string[], exercises: [] as (string | null)[] }
  server.use(
    http.post(`${origin}/api/v1/auth/refresh`, async ({ request }) => {
      const { refresh_token } = (await request.json()) as { refresh_token: string }
      calls.refresh.push(refresh_token)
      const n = Number(refresh_token.replace('refresh-', ''))
      return HttpResponse.json(tokenResponse(n + 1))
    }),
    http.post(`${origin}/api/v1/auth/logout`, async ({ request }) => {
      calls.logout.push(((await request.json()) as { refresh_token: string }).refresh_token)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${origin}/api/v1/exercises`, ({ request }) => {
      const authorization = request.headers.get('Authorization')
      calls.exercises.push(authorization)
      if (authorization !== `Bearer ${valid()}`) return unauthenticated()
      return HttpResponse.json({ items: [] })
    }),
  )
  return calls
}

/** A session that has signed in before: tokens access-1 / refresh-1. */
function signedInSession(storage = memoryStorage()) {
  const tokens = createTokenStore(storage)
  tokens.set(tokenResponse(1))
  return { session: createSession({ baseUrl: origin, fetch, tokens }), storage }
}

const listExercises = (session: ReturnType<typeof createSession>) =>
  unwrap(session.api.GET('/api/v1/exercises'))

describe('the access token', () => {
  it('is sent as a bearer token', async () => {
    const calls = fakeApi(() => 'access-1')
    const { session } = signedInSession()
    await listExercises(session)
    expect(calls.exercises).toEqual(['Bearer access-1'])
    expect(calls.refresh).toEqual([])
  })

  it('is renewed once on 401 and the request replayed', async () => {
    const calls = fakeApi(() => 'access-2')
    const { session, storage } = signedInSession()
    await listExercises(session)
    expect(calls.refresh).toEqual(['refresh-1'])
    expect(calls.exercises).toEqual(['Bearer access-1', 'Bearer access-2'])
    expect(storage.items.get(refreshTokenKey)).toBe('refresh-2')
  })

  it('is renewed by one refresh for any number of concurrent 401s', async () => {
    const calls = fakeApi(() => 'access-2')
    const { session } = signedInSession()
    await Promise.all([listExercises(session), listExercises(session), listExercises(session)])
    // Two refreshes would present refresh-1 twice, which the server treats as
    // theft and answers by revoking the session.
    expect(calls.refresh).toEqual(['refresh-1'])
    expect(calls.exercises.filter((h) => h === 'Bearer access-2')).toHaveLength(3)
  })

  it('is not renewed twice for the same request', async () => {
    const calls = fakeApi(() => 'never valid')
    const { session } = signedInSession()
    const error = await listExercises(session).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated' })
    expect(calls.refresh).toEqual(['refresh-1'])
    expect(calls.exercises).toHaveLength(2)
  })

  it('replays a request body after a refresh', async () => {
    fakeApi(() => 'access-2')
    const bodies: unknown[] = []
    server.use(
      http.post(`${origin}/api/v1/users`, async ({ request }) => {
        bodies.push(await request.json())
        if (request.headers.get('Authorization') !== 'Bearer access-2') return unauthenticated()
        return HttpResponse.json(
          {
            id: '0190c6a8-0000-7000-8000-000000000001',
            display_name: 'Ana',
            created_at: '2026-10-21T00:00:00Z',
            updated_at: '2026-10-21T00:00:00Z',
          },
          { status: 201 },
        )
      }),
    )
    const { session } = signedInSession()
    await unwrap(session.api.POST('/api/v1/users', { body: { display_name: 'Ana' } }))
    expect(bodies).toEqual([{ display_name: 'Ana' }, { display_name: 'Ana' }])
  })
})

describe('a reload', () => {
  it('keeps the session through the stored refresh token', async () => {
    const calls = fakeApi(() => 'access-2')
    const { storage } = signedInSession()
    // A reload: memory is gone, sessionStorage is not.
    const tokens = createTokenStore(storage)
    expect(tokens.access).toBeNull()
    const reloaded = createSession({ baseUrl: origin, fetch, tokens })
    await listExercises(reloaded)
    // The refresh happens before the request, not after a wasted 401.
    expect(calls.refresh).toEqual(['refresh-1'])
    expect(calls.exercises).toEqual(['Bearer access-2'])
  })
})

describe('a rejected refresh', () => {
  it('ends the session and clears storage', async () => {
    fakeApi(() => 'access-2')
    server.use(
      http.post(`${origin}/api/v1/auth/refresh`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_refresh_token', message: 'refresh token is invalid' } },
          { status: 401 },
        ),
      ),
    )
    const { session, storage } = signedInSession()
    const error = await listExercises(session).catch((e: unknown) => e)
    // The middleware's own ApiError, not relabelled as a network failure.
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'invalid_refresh_token' })
    expect(session.tokens.access).toBeNull()
    expect(session.tokens.refresh).toBeNull()
    expect(storage.items.has(refreshTokenKey)).toBe(false)
  })

  it('caused by the network keeps the session', async () => {
    fakeApi(() => 'access-2')
    server.use(http.post(`${origin}/api/v1/auth/refresh`, () => HttpResponse.error()))
    const { session, storage } = signedInSession()
    const error = await listExercises(session).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0, code: 'network_error' })
    expect(session.tokens.refresh).toBe('refresh-1')
    expect(storage.items.get(refreshTokenKey)).toBe('refresh-1')
  })
})

describe('signing in and out', () => {
  it('stores the tokens from login and sends no bearer token to it', async () => {
    let authorization: string | null = 'not called'
    let credentials: unknown
    server.use(
      http.post(`${origin}/api/v1/auth/login`, async ({ request }) => {
        authorization = request.headers.get('Authorization')
        credentials = await request.json()
        return HttpResponse.json(tokenResponse(1))
      }),
    )
    const storage = memoryStorage()
    const session = createSession({ baseUrl: origin, fetch, tokens: createTokenStore(storage) })
    await session.signIn('  ana@example.com ', 'correct horse battery')
    expect(authorization).toBeNull()
    expect(credentials).toEqual({ email: 'ana@example.com', password: 'correct horse battery' })
    expect(session.tokens.access).toBe('access-1')
    expect(storage.items.get(refreshTokenKey)).toBe('refresh-1')
  })

  it('forgets locally first, then revokes the refresh token', async () => {
    const calls = fakeApi(() => 'access-1')
    const { session, storage } = signedInSession()
    const signingOut = session.signOut()
    expect(session.tokens.refresh).toBeNull()
    expect(storage.items.has(refreshTokenKey)).toBe(false)
    await signingOut
    expect(calls.logout).toEqual(['refresh-1'])
  })

  it('is signed out even when the server cannot be reached', async () => {
    server.use(http.post(`${origin}/api/v1/auth/logout`, () => HttpResponse.error()))
    const { session } = signedInSession()
    await expect(session.signOut()).resolves.toBeUndefined()
    expect(session.tokens.refresh).toBeNull()
  })

  it('revokes tokens from a refresh that finishes after sign-out', async () => {
    const calls = fakeApi(() => 'access-2')
    const { session } = signedInSession()
    const refreshing = session.refresh()
    await session.signOut()
    await refreshing
    expect(session.tokens.refresh).toBeNull()
    expect(calls.logout).toEqual(['refresh-1', 'refresh-2'])
  })
})

describe('the token store', () => {
  it('works in memory when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    const tokens = createTokenStore(broken)
    expect(tokens.refresh).toBeNull()
    tokens.set(tokenResponse(1))
    expect(tokens.refresh).toBe('refresh-1')
    tokens.clear()
    expect(tokens.refresh).toBeNull()
  })
})

describe('credentials', () => {
  it('checks the contract limits in code points', () => {
    expect(checkCredentials('signIn', ' ', 'x')).toBe('Enter your email address.')
    expect(checkCredentials('signIn', 'a@b.c', '')).toBe('Enter your password.')
    expect(checkCredentials('signIn', `${'a'.repeat(250)}@b.c`, 'x')).toBeNull()
    expect(checkCredentials('signIn', `${'a'.repeat(251)}@b.c`, 'x')).toMatch(/254/)
    // Short passwords may still sign in; only registration enforces 12..128.
    expect(checkCredentials('signIn', 'a@b.c', 'short')).toBeNull()
    expect(checkCredentials('register', 'a@b.c', 'short')).toMatch(/12 to 128/)
    // Twelve emoji are 24 UTF-16 units but 12 characters to the server.
    expect(checkCredentials('register', 'a@b.c', '💪'.repeat(12))).toBeNull()
    expect(checkCredentials('register', 'a@b.c', '💪'.repeat(129))).toMatch(/12 to 128/)
  })

  it('describes rate limits with the wait time', () => {
    expect(describeAuthError(new ApiError(429, 'rate_limited', 'x', { retryAfter: 30 }))).toBe(
      'Too many attempts. Try again in 30 seconds.',
    )
    expect(describeAuthError(new ApiError(429, 'rate_limited', 'x', { retryAfter: 61 }))).toBe(
      'Too many attempts. Try again in 2 minutes.',
    )
  })
})
