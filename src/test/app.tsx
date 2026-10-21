import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, afterEach, beforeAll } from 'vitest'
import type { components } from '../api/schema'
import { createQueryClient } from '../app/queryClient'
import { AuthProvider } from '../auth/AuthProvider'
import { createSession } from '../auth/session'
import { createTokenStore, memoryStorage } from '../auth/tokens'
import { routes } from '../routes'

/*
 * The whole app in jsdom, over an MSW fake of one account's API. A test file
 * calls setUpFakeServer() once, then fakeApi() and renderApp() per test.
 */

// See session.test.ts: Node's fetch needs an absolute URL, and the client must
// look fetch up per call so MSW can replace it.
export const origin = 'http://latihan.test'
const fetch = (request: Request) => globalThis.fetch(request)

export const server = setupServer()

export function setUpFakeServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    cleanup()
    server.resetHandlers()
  })
  afterAll(() => server.close())
}

export const tokens = {
  access_token: 'access-1',
  token_type: 'Bearer' as const,
  expires_in: 900,
  refresh_token: 'refresh-1',
}

export const user = (displayName: string) => ({
  id: '0190c6a8-0000-7000-8000-000000000001',
  display_name: displayName,
  created_at: '2026-10-21T00:00:00Z',
  updated_at: '2026-10-21T00:00:00Z',
})

export const apiError = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message } }, { status, headers })

export const profileRequired = () =>
  apiError(403, 'profile_required', 'create a profile with POST /api/v1/users first')

type CatalogExercise = components['schemas']['CatalogExercise']

/** A catalog entry with a predictable id: n = 1 → ...000000000001. */
export function catalogEntry(n: number, name: string, category: CatalogExercise['category'] = 'strength'): CatalogExercise {
  return {
    id: `0190c6a8-0000-7000-8000-${String(n).padStart(12, '0')}`,
    name,
    description: '',
    category,
    muscle_group: 'Quadriceps',
    equipment: 'Barbell',
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  }
}

/**
 * A fake API for one account. `profile` is its display name, or null while it
 * has none; POST /users creates it and records the idempotency keys it got.
 * `catalog` is served by GET /exercises as the server does: by name, filtered
 * by category, `limit` at a time with an opaque cursor.
 */
export function fakeApi({ profile, catalog = [] }: { profile: string | null; catalog?: CatalogExercise[] }) {
  const state = {
    profile,
    meCalls: 0,
    keys: [] as (string | null)[],
    bodies: [] as unknown[],
    /** The query string of every GET /exercises. */
    catalogQueries: [] as string[],
    detailCalls: 0,
  }
  const sorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  server.use(
    http.post(`${origin}/api/v1/auth/login`, () => HttpResponse.json(tokens)),
    http.post(`${origin}/api/v1/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${origin}/api/v1/users/me`, () => {
      state.meCalls++
      return state.profile === null ? profileRequired() : HttpResponse.json(user(state.profile))
    }),
    http.post(`${origin}/api/v1/users`, async ({ request }) => {
      const body = (await request.json()) as { display_name: string }
      state.keys.push(request.headers.get('Idempotency-Key'))
      state.bodies.push(body)
      state.profile = body.display_name
      return HttpResponse.json(user(body.display_name), { status: 201 })
    }),
    http.get(`${origin}/api/v1/exercises`, ({ request }) => {
      const query = new URL(request.url).searchParams
      state.catalogQueries.push(query.toString())
      if (state.profile === null) return profileRequired()
      const limit = Number(query.get('limit') ?? 20)
      const start = Number(query.get('cursor') ?? 0)
      const category = query.get('category')
      const matching = sorted.filter((exercise) => category === null || exercise.category === category)
      const items = matching.slice(start, start + limit)
      const next = start + limit < matching.length ? String(start + limit) : null
      return HttpResponse.json({ items, limit, next_cursor: next })
    }),
    http.get(`${origin}/api/v1/exercises/:id`, ({ params }) => {
      state.detailCalls++
      if (state.profile === null) return profileRequired()
      const exercise = catalog.find(({ id }) => id === params.id)
      return exercise === undefined
        ? apiError(404, 'exercise_not_found', 'exercise not found')
        : HttpResponse.json(exercise)
    }),
  )
  return state
}

/** `ui` inside the app's providers, with a session over the fake API. */
function renderWithSession(ui: ReactNode, { signedIn = true } = {}) {
  const store = createTokenStore(memoryStorage())
  if (signedIn) store.set(tokens)
  const session = createSession({ baseUrl: origin, fetch, tokens: store })
  const queryClient = createQueryClient()
  // Keep the retry policy, without its back-off delay.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  })
  render(
    <AuthProvider session={session}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </AuthProvider>,
  )
  return { queryClient, user: userEvent.setup() }
}

/** The whole app at `path`, over the fake API. */
export function renderApp(path: string, options: { signedIn?: boolean } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { router, ...renderWithSession(<RouterProvider router={router} />, options) }
}

/** One component that calls the API, signed in, outside the app's routes. */
export function renderComponent(ui: ReactNode) {
  return renderWithSession(ui)
}

export const heading = (name: string) => screen.findByRole('heading', { level: 1, name })
