// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { checkDisplayName, meQueryKey } from './features/profile/api'
import { fakeApi, heading, origin, renderApp, server, setUpFakeServer } from './test/app'

setUpFakeServer()

describe('the sign-in guard', () => {
  it('sends a signed-out visitor to sign in, then back to the page they asked for', async () => {
    fakeApi({ profile: 'Ana' })
    const { router, user } = renderApp('/plans?view=all', { signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sign-in')

    await user.type(screen.getByLabelText('Email'), 'ana@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await heading('Plans')).toBeTruthy()
    expect(router.state.location.pathname + router.state.location.search).toBe('/plans?view=all')
  })

  it('sends a signed-in user away from the sign-in page', async () => {
    fakeApi({ profile: 'Ana' })
    const { router } = renderApp('/sign-in')
    expect(await heading('Hi, Ana')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('the profile gate', () => {
  it('sends an account without a profile to /welcome, then on to the page it asked for', async () => {
    const api = fakeApi({ profile: null })
    const { router, user } = renderApp('/ideas')
    expect(await screen.findByRole('heading', { name: 'Create your cloud profile' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/welcome')
    // The welcome page takes the gate's answer instead of asking again.
    expect(api.meCalls).toBe(1)

    await user.type(screen.getByLabelText('Display name'), '  Ana  ')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))

    expect(await heading('Ideas')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/ideas')
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(api.bodies).toEqual([{ display_name: 'Ana' }])
    expect(api.keys).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)])
    // The created profile goes straight into the cache.
    expect(api.meCalls).toBe(1)
  })

  it('retries a failed create with the same idempotency key', async () => {
    const api = fakeApi({ profile: null })
    let failNext = true
    server.use(
      http.post(`${origin}/api/v1/users`, ({ request }) => {
        if (!failNext) return undefined // fall through to fakeApi's handler
        failNext = false
        api.keys.push(request.headers.get('Idempotency-Key'))
        return HttpResponse.error()
      }),
    )
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the server/)

    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(await heading('Hi, Ana')).toBeTruthy()
    // Had the first request been saved and only its response lost, the same
    // key makes the server replay it instead of creating a second profile.
    expect(api.keys).toHaveLength(2)
    expect(api.keys[1]).toBe(api.keys[0])
  })

  it('uses a new idempotency key once the name changes', async () => {
    const api = fakeApi({ profile: null })
    server.use(
      http.post(`${origin}/api/v1/users`, ({ request }) => {
        api.keys.push(request.headers.get('Idempotency-Key'))
        return HttpResponse.json(
          { error: { code: 'validation_failed', message: 'display_name is not allowed' } },
          { status: 400 },
        )
      }, { once: true }),
    )
    const { user } = renderApp('/')
    const input = await screen.findByLabelText('Display name')
    await user.type(input, 'Ana')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect((await screen.findByRole('alert')).textContent).toBe('display_name is not allowed')

    await user.type(input, 'lia')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(await heading('Hi, Analia')).toBeTruthy()
    expect(api.keys).toHaveLength(2)
    expect(api.keys[1]).not.toBe(api.keys[0])
  })

  it('rejects a blank name without calling the API', async () => {
    const api = fakeApi({ profile: null })
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Display name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a display name.')
    expect(api.keys).toEqual([])
  })

  it('moves on when the profile already exists', async () => {
    const api = fakeApi({ profile: null })
    server.use(
      http.post(`${origin}/api/v1/users`, () => {
        // Created meanwhile, from another tab.
        api.profile = 'Ana'
        return HttpResponse.json(
          { error: { code: 'profile_exists', message: 'this identity already has a profile' } },
          { status: 409 },
        )
      }),
    )
    const { user } = renderApp('/')
    await user.type(await screen.findByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(await heading('Hi, Ana')).toBeTruthy()
  })

  it('sends a user who has a profile away from /welcome', async () => {
    fakeApi({ profile: 'Ana' })
    const { router } = renderApp('/welcome')
    expect(await heading('Hi, Ana')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
  })

  it('counts the name in code points, after trimming', () => {
    expect(checkDisplayName(` ${'a'.repeat(200)} `)).toBeNull()
    expect(checkDisplayName('a'.repeat(201))).toMatch(/200/)
    // 200 emoji are 400 UTF-16 units but 200 characters to the server.
    expect(checkDisplayName('💪'.repeat(200))).toBeNull()
  })
})

describe('the app shell', () => {
  it('shows the request ID when a page cannot load', async () => {
    fakeApi({ profile: 'Ana' })
    let calls = 0
    server.use(
      http.get(`${origin}/api/v1/users/me`, () => {
        calls++
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'internal server error' } },
          { status: 500, headers: { 'X-Request-ID': 'req-7f3a' } },
        )
      }),
    )
    renderApp('/')
    expect(await heading('Something went wrong')).toBeTruthy()
    expect(screen.getByText('req-7f3a')).toBeTruthy()
    expect(screen.getByText('internal_error')).toBeTruthy()
    // A 5xx is retried twice before it is shown.
    expect(calls).toBe(3)
  })

  it('does not retry an answer such as 404', async () => {
    fakeApi({ profile: 'Ana' })
    let calls = 0
    server.use(
      http.get(`${origin}/api/v1/users/me`, () => {
        calls++
        return HttpResponse.json({ error: { code: 'user_not_found', message: 'user not found' } }, { status: 404 })
      }),
    )
    renderApp('/')
    expect(await screen.findByText('user_not_found')).toBeTruthy()
    expect(calls).toBe(1)
  })

  it('shows a not-found page inside the shell for an unknown path', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/no/such/page')
    expect(await heading('Page not found')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
  })

  it('forgets cached data on sign-out', async () => {
    fakeApi({ profile: 'Ana' })
    const { router, queryClient, user } = renderApp('/')
    expect(await heading('Hi, Ana')).toBeTruthy()
    expect(queryClient.getQueryData(meQueryKey)).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(queryClient.getQueryData(meQueryKey)).toBeUndefined()
  })
})
