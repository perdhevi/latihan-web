import type { ClientOptions, Middleware } from 'openapi-fetch'
import { createApiClient, unwrap } from '../api/client'
import { ApiError } from '../api/errors'
import type { TokenStore } from './tokens'

export type Session = ReturnType<typeof createSession>

/**
 * Signing in, staying signed in and signing out, plus `api`: the client every
 * feature uses, which sends the access token and renews it when it expires.
 *
 * The server rotates refresh tokens and treats a reused one as theft (it
 * revokes the whole session), so at most one refresh runs at a time and
 * concurrent callers share it. Mirrors FitnessApi._refreshSession in mobile.
 */
export function createSession({ tokens, ...options }: ClientOptions & { tokens: TokenStore }) {
  // The auth endpoints go through a client without the middleware: they take
  // no bearer token, and a 401 from them is an answer, not an expired token.
  const auth = createApiClient(options)
  const api = createApiClient(options)

  let refreshing: Promise<void> | undefined

  /** Trades the refresh token for new tokens. Concurrent calls share one request. */
  function refresh(): Promise<void> {
    refreshing ??= (async () => {
      const used = tokens.refresh
      if (used === null) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.')
      try {
        const pair = await unwrap(auth.POST('/api/v1/auth/refresh', { body: { refresh_token: used } }))
        if (tokens.refresh === used) tokens.set(pair)
        // Signed out (or in as someone else) while this was in flight.
        else await revoke(pair.refresh_token)
      } catch (error) {
        // A rejected refresh token ends the session; a network error does not.
        if (error instanceof ApiError && error.status === 401 && tokens.refresh === used) tokens.clear()
        throw error
      }
    })().finally(() => {
      refreshing = undefined
    })
    return refreshing
  }

  async function revoke(refreshToken: string) {
    try {
      await unwrap(auth.POST('/api/v1/auth/logout', { body: { refresh_token: refreshToken } }))
    } catch {
      // The client has already forgotten the token; it expires on its own.
    }
  }

  // What each request was sent with: the access token, to tell whether
  // another request has refreshed since, and a copy to replay. A body can be
  // read only once, so the copy is taken before fetch consumes the original.
  const sent = new WeakMap<Request, { access: string | null; replay: Request }>()

  const middleware: Middleware = {
    async onRequest({ request, schemaPath }) {
      if (schemaPath.startsWith('/api/v1/auth/')) return undefined
      if (tokens.access === null && tokens.refresh !== null) await refresh()
      if (tokens.access !== null) request.headers.set('Authorization', `Bearer ${tokens.access}`)
      sent.set(request, { access: tokens.access, replay: request.clone() })
      return request
    },
    async onResponse({ request, response, options }) {
      const original = sent.get(request)
      if (response.status !== 401 || original === undefined || tokens.refresh === null) return undefined
      // The access token expired. Refresh unless a concurrent request already
      // did, then replay once: the replay bypasses the middleware, so a second
      // 401 is returned as it is.
      if (tokens.access === original.access) await refresh()
      if (tokens.access === null) return undefined
      original.replay.headers.set('Authorization', `Bearer ${tokens.access}`)
      return options.fetch(original.replay)
    },
  }
  api.use(middleware)

  return {
    api,
    tokens,
    refresh,

    async signIn(email: string, password: string) {
      tokens.set(await unwrap(auth.POST('/api/v1/auth/login', { body: { email: email.trim(), password } })))
    },

    /** Creates the account and signs in. The profile is created separately (Part 3). */
    async register(email: string, password: string) {
      tokens.set(await unwrap(auth.POST('/api/v1/auth/register', { body: { email: email.trim(), password } })))
    },

    /**
     * Forgets the tokens first, so the app is signed out even if the server
     * cannot be reached, then asks the server to revoke the refresh token.
     */
    async signOut() {
      const refreshToken = tokens.refresh
      tokens.clear()
      if (refreshToken !== null) await revoke(refreshToken)
    },
  }
}
