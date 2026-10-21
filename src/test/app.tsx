import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
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

// findBy… waits 1 s by default. The first render of the whole app in a test
// file is cold (modules, the fake API), and under a busy machine it has
// taken longer; the tests' own budget is in vite.config.ts.
configure({ asyncUtilTimeout: 5_000 })

let consoleErrors: unknown[][] = []
let consoleErrorsAllowed = false

/**
 * For a test that means to log errors (a page that fails on purpose and is
 * caught by the route's error boundary, which React reports).
 */
export function allowConsoleErrors() {
  consoleErrorsAllowed = true
}

export function setUpFakeServer() {
  beforeAll(() => {
    shimDialog()
    server.listen({ onUnhandledRequest: 'error' })
  })
  // React reports invalid markup, missing keys and the like on console.error,
  // and Vitest hides the console of passing tests: fail the test instead.
  beforeEach(() => {
    consoleErrors = []
    consoleErrorsAllowed = false
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void consoleErrors.push(args))
  })
  afterEach(() => {
    cleanup()
    server.resetHandlers()
    localStorage.clear()
    vi.mocked(console.error).mockRestore()
    if (consoleErrors.length > 0 && !consoleErrorsAllowed) {
      const [first] = consoleErrors
      throw new Error(`console.error was called ${consoleErrors.length} time(s); first: ${first.map(String).join(' ')}`)
    }
  })
  afterAll(() => server.close())
}

/**
 * jsdom has <dialog> but not showModal() or close(). Browsers also trap
 * focus and make the page inert; this only opens and closes it.
 */
function shimDialog() {
  const dialog = HTMLDialogElement.prototype
  dialog.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  dialog.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
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
export function fakeApi({
  profile,
  catalog = [],
  plans = [],
}: {
  profile: string | null
  catalog?: CatalogExercise[]
  plans?: PlanSeed[]
}) {
  const plansFake = fakePlans(plans)
  const state = {
    profile,
    meCalls: 0,
    keys: [] as (string | null)[],
    bodies: [] as unknown[],
    /** The query string of every GET /exercises. */
    catalogQueries: [] as string[],
    detailCalls: 0,
    plans: plansFake,
    sessions: fakeSessions(plansFake),
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
    ...state.plans.handlers,
    ...state.sessions.handlers,
  )
  return state
}

type Plan = components['schemas']['Plan']
type PlanInput = components['schemas']['PlanInput']
/** A plan the fake starts with. `inUse`: sessions use it, so its exercises are fixed. */
export type PlanSeed = PlanInput & { inUse?: boolean }

/** A request the fake plans endpoints received. */
type PlanRequest = { method: string; id?: string; ifMatch: string | null; key: string | null; body?: PlanInput }

/**
 * Plans as the server keeps them: newest first; every write moves the ETag
 * on, and a write with an older If-Match gets 412; a create's response is
 * replayed for its Idempotency-Key (422 when the key comes with another
 * body); a plan in use keeps its exercises (409 plan_in_use) and cannot be
 * deleted (409 resource_in_use).
 */
function fakePlans(seeds: PlanSeed[]) {
  let made = 0
  const records = new Map<string, { plan: Plan; version: number; inUse: boolean }>()
  const replays = new Map<string, { body: string; plan: Plan }>()
  const requests: PlanRequest[] = []
  const etag = (id: string) => `"v${records.get(id)!.version}"`
  // What the server compares for plan_in_use: the exercises without their
  // ids, as parsed values (field order and null versus absent do not count).
  const exercisesOf = (plan: Pick<PlanInput, 'exercises'>) =>
    JSON.stringify(plan.exercises, (field, value: unknown) => {
      if (field === 'id' || value === null) return undefined
      if (typeof value !== 'object' || Array.isArray(value)) return value
      return Object.fromEntries(Object.entries(value as object).sort(([a], [b]) => a.localeCompare(b)))
    })

  function create(input: PlanInput, inUse = false): Plan {
    made++
    const id = `0190c6a8-0000-7000-9000-${String(made).padStart(12, '0')}`
    const plan = {
      id,
      user_id: user('').id,
      name: input.name,
      notes: input.notes ?? '',
      exercises: input.exercises.map((exercise, i) => ({ id: `${id.slice(0, -4)}${String(i).padStart(4, '0')}`, ...exercise })),
      created_at: new Date(Date.UTC(2026, 9, 21, 0, made)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 9, 21, 0, made)).toISOString(),
    } as Plan
    records.set(id, { plan, version: 1, inUse })
    return plan
  }
  for (const { inUse, ...seed } of seeds) create(seed, inUse)

  const found = (id: string) =>
    HttpResponse.json(records.get(id)!.plan, { headers: { ETag: etag(id) } })
  const missing = () => apiError(404, 'plan_not_found', 'plan not found')
  const stale = (id: string, ifMatch: string | null) => ifMatch !== null && ifMatch !== etag(id)

  const handlers = [
    http.get(`${origin}/api/v1/plans`, ({ request }) => {
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 20)
      const start = Number(query.get('cursor') ?? 0)
      const all = [...records.values()].map((record) => record.plan).reverse()
      const next = start + limit < all.length ? String(start + limit) : null
      return HttpResponse.json({ items: all.slice(start, start + limit), limit, next_cursor: next })
    }),
    http.get(`${origin}/api/v1/plans/:id`, ({ params }) => {
      const id = params.id as string
      return records.has(id) ? found(id) : missing()
    }),
    http.post(`${origin}/api/v1/plans`, async ({ request }) => {
      const body = (await request.json()) as PlanInput
      const key = request.headers.get('Idempotency-Key')
      requests.push({ method: 'POST', ifMatch: null, key, body })
      const replay = key === null ? undefined : replays.get(key)
      if (replay !== undefined) {
        if (replay.body !== JSON.stringify(body)) {
          return apiError(422, 'idempotency_key_reused', 'this key was already used for a different request')
        }
        return HttpResponse.json(replay.plan, { status: 201, headers: { 'Idempotent-Replayed': 'true' } })
      }
      const plan = create(body)
      if (key !== null) replays.set(key, { body: JSON.stringify(body), plan })
      return HttpResponse.json(plan, { status: 201, headers: { ETag: etag(plan.id) } })
    }),
    http.put(`${origin}/api/v1/plans/:id`, async ({ params, request }) => {
      const id = params.id as string
      const body = (await request.json()) as PlanInput
      const ifMatch = request.headers.get('If-Match')
      requests.push({ method: 'PUT', id, ifMatch, key: null, body })
      const record = records.get(id)
      if (record === undefined) return missing()
      if (stale(id, ifMatch)) return apiError(412, 'precondition_failed', 'record changed since it was read')
      if (record.inUse && exercisesOf(body) !== exercisesOf(record.plan)) {
        return apiError(409, 'plan_in_use', 'sessions already use this plan, so its exercises cannot change')
      }
      const exercises = record.inUse ? record.plan.exercises : create(body).exercises
      record.plan = { ...record.plan, name: body.name, notes: body.notes ?? '', exercises } as Plan
      record.version++
      return found(id)
    }),
    http.delete(`${origin}/api/v1/plans/:id`, ({ params, request }) => {
      const id = params.id as string
      const ifMatch = request.headers.get('If-Match')
      requests.push({ method: 'DELETE', id, ifMatch, key: null })
      const record = records.get(id)
      if (record === undefined) return missing()
      if (stale(id, ifMatch)) return apiError(412, 'precondition_failed', 'record changed since it was read')
      if (record.inUse) return apiError(409, 'resource_in_use', 'remove dependent records before deleting this resource')
      records.delete(id)
      return new HttpResponse(null, { status: 204 })
    }),
  ]

  return {
    handlers,
    requests,
    /** Every plan, oldest first. */
    all: () => [...records.values()].map((record) => record.plan),
    etag,
    get: (id: string) => records.get(id)?.plan,
    /** Whether sessions use the plan: then its exercises are fixed. */
    setInUse(id: string, inUse: boolean) {
      const record = records.get(id)
      if (record !== undefined) record.inUse = inUse
    },
    /** Deleted on another device. */
    deleteElsewhere(id: string) {
      records.delete(id)
    },
    /** Another device renames the plan: a new version. */
    renameElsewhere(id: string, name: string) {
      const record = records.get(id)!
      record.plan = { ...record.plan, name }
      record.version++
    },
  }
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

type Session = components['schemas']['Session']
type SessionInput = components['schemas']['SessionInput']
type SessionRequest = { method: string; id?: string; ifMatch: string | null; key: string | null; body?: SessionInput }
type Comparison = components['schemas']['Comparison']

/**
 * Sessions as the server keeps them: creates replayed per Idempotency-Key
 * (422 for another body); `plan_id` must name an existing plan
 * (400 invalid_reference) and `plan_exercise_id` one of its exercises, at
 * most once (400 validation_failed); a saved session puts its plan in use;
 * writes with an older If-Match get 412. The list is newest performed_at
 * first. Comparisons are whatever a test sets with `setComparison`; the
 * fake does not compute them.
 */
function fakeSessions(plans: ReturnType<typeof fakePlans>) {
  let made = 0
  const records = new Map<string, { session: Session; version: number }>()
  const comparisons = new Map<string, Comparison>()
  const reads = new Map<string, number>()
  let comparisonCalls = 0
  const replays = new Map<string, { body: string; session: Session }>()
  const requests: SessionRequest[] = []
  const etag = (id: string) => `"s${records.get(id)!.version}"`
  const found = (id: string, status = 200) =>
    HttpResponse.json(records.get(id)!.session, { status, headers: { ETag: etag(id) } })

  function check(body: SessionInput) {
    const planId = body.plan_id ?? null
    const plan = planId === null ? undefined : plans.get(planId)
    if (planId !== null && plan === undefined) {
      return apiError(400, 'invalid_reference', 'referenced user, plan or exercise does not exist for this user')
    }
    const links = body.exercises.flatMap((exercise) => exercise.plan_exercise_id ?? [])
    if (new Set(links).size !== links.length) {
      return apiError(400, 'validation_failed', 'plan_exercise_id must not repeat')
    }
    if (links.some((link) => !plan?.exercises.some((target) => target.id === link))) {
      return apiError(400, 'validation_failed', "plan_exercise_id must belong to the session's plan")
    }
    return undefined
  }

  function save(body: SessionInput, id: string): Session {
    const previous = records.get(id)
    const session = {
      id,
      user_id: user('').id,
      name: body.name,
      notes: body.notes ?? '',
      performed_at: body.performed_at,
      plan_id: body.plan_id ?? null,
      exercises: body.exercises,
      created_at: previous?.session.created_at ?? '2026-10-21T08:00:00Z',
      updated_at: '2026-10-21T08:00:00Z',
    } as Session
    records.set(id, { session, version: (previous?.version ?? 0) + 1 })
    if (session.plan_id !== null) plans.setInUse(session.plan_id, true)
    return session
  }

  const handlers = [
    http.post(`${origin}/api/v1/sessions`, async ({ request }) => {
      const body = (await request.json()) as SessionInput
      const key = request.headers.get('Idempotency-Key')
      requests.push({ method: 'POST', ifMatch: null, key, body })
      const replay = key === null ? undefined : replays.get(key)
      if (replay !== undefined) {
        if (replay.body !== JSON.stringify(body)) {
          return apiError(422, 'idempotency_key_reused', 'this key was already used for a different request')
        }
        return HttpResponse.json(replay.session, { status: 201, headers: { 'Idempotent-Replayed': 'true' } })
      }
      const refused = check(body)
      if (refused !== undefined) return refused
      made++
      const session = save(body, `0190c6a8-0000-7000-a000-${String(made).padStart(12, '0')}`)
      if (key !== null) replays.set(key, { body: JSON.stringify(body), session })
      return found(session.id, 201)
    }),
    http.get(`${origin}/api/v1/sessions`, ({ request }) => {
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 20)
      const start = Number(query.get('cursor') ?? 0)
      const all = [...records.values()]
        .map((record) => record.session)
        .sort((a, b) => b.performed_at.localeCompare(a.performed_at) || b.id.localeCompare(a.id))
      const next = start + limit < all.length ? String(start + limit) : null
      return HttpResponse.json({ items: all.slice(start, start + limit), limit, next_cursor: next })
    }),
    http.delete(`${origin}/api/v1/sessions/:id`, ({ params, request }) => {
      const id = params.id as string
      const ifMatch = request.headers.get('If-Match')
      requests.push({ method: 'DELETE', id, ifMatch, key: null })
      const record = records.get(id)
      if (record === undefined) return apiError(404, 'session_not_found', 'session not found')
      if (ifMatch !== null && ifMatch !== etag(id)) {
        return apiError(412, 'precondition_failed', 'record changed since it was read')
      }
      records.delete(id)
      const planId = record.session.plan_id ?? null
      if (planId !== null && ![...records.values()].some((other) => other.session.plan_id === planId)) {
        plans.setInUse(planId, false)
      }
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${origin}/api/v1/plans/:id/comparison`, ({ params, request }) => {
      comparisonCalls++
      const sessionId = new URL(request.url).searchParams.get('session_id') ?? ''
      const comparison = comparisons.get(sessionId)
      return comparison === undefined || comparison.plan_id !== params.id
        ? apiError(404, 'comparison_not_found', 'session not attached to the requested plan')
        : HttpResponse.json(comparison)
    }),
    http.get(`${origin}/api/v1/sessions/:id`, ({ params }) => {
      const id = params.id as string
      reads.set(id, (reads.get(id) ?? 0) + 1)
      return records.has(id) ? found(id) : apiError(404, 'session_not_found', 'session not found')
    }),
    http.put(`${origin}/api/v1/sessions/:id`, async ({ params, request }) => {
      const id = params.id as string
      const body = (await request.json()) as SessionInput
      const ifMatch = request.headers.get('If-Match')
      requests.push({ method: 'PUT', id, ifMatch, key: null, body })
      if (!records.has(id)) return apiError(404, 'session_not_found', 'session not found')
      if (ifMatch !== null && ifMatch !== etag(id)) {
        return apiError(412, 'precondition_failed', 'record changed since it was read')
      }
      const refused = check(body)
      if (refused !== undefined) return refused
      save(body, id)
      return found(id)
    }),
  ]

  return {
    handlers,
    requests,
    all: () => [...records.values()].map((record) => record.session),
    comparisonCalls: () => comparisonCalls,
    /** How many times GET /sessions/{id} was asked for this session. */
    reads: (id: string) => reads.get(id) ?? 0,
    setComparison(comparison: Comparison) {
      comparisons.set(comparison.session_id, comparison)
    },
    /** A saved session, as if recorded before this test. */
    seed(body: SessionInput) {
      made++
      return save(body, `0190c6a8-0000-7000-a000-${String(made).padStart(12, '0')}`)
    },
    /** Another device renames the session: a new version. */
    renameElsewhere(id: string, name: string) {
      const record = records.get(id)!
      record.session = { ...record.session, name }
      record.version++
    },
  }
}
