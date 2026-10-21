// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ExercisePicker } from '../../shared/ExercisePicker'
import { apiError, catalogEntry, fakeApi, heading, origin, renderApp, renderComponent, server, setUpFakeServer } from '../../test/app'

setUpFakeServer()

/** `count` strength exercises named "Exercise 01", "Exercise 02", ... */
const many = (count: number) =>
  Array.from({ length: count }, (_, i) => catalogEntry(i + 1, `Exercise ${String(i + 1).padStart(2, '0')}`))

const mixed = [
  catalogEntry(1, 'Front Squat', 'strength'),
  catalogEntry(2, 'Rowing Machine', 'cardio'),
  catalogEntry(3, 'Cycling', 'cardio'),
  catalogEntry(4, 'Hip Opener', 'mobility'),
]

const entries = () => screen.getAllByRole('button', { name: /^(Show|Add) / })
const location = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search

describe('the Ideas page', () => {
  it('shows the catalog 20 at a time and stops when there is no next cursor', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: many(45) })
    const { user } = renderApp('/ideas')
    expect(await screen.findByRole('button', { name: 'Show Exercise 01' })).toBeTruthy()
    expect(entries()).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('button', { name: 'Show Exercise 40' })
    expect(entries()).toHaveLength(40)

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('button', { name: 'Show Exercise 45' })
    expect(entries()).toHaveLength(45)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(api.catalogQueries).toEqual(['limit=20', 'limit=20&cursor=20', 'limit=20&cursor=40'])
  })

  it('asks the server for one category when the filter changes, and keeps it in the URL', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: mixed })
    const { router, user } = renderApp('/ideas')
    await screen.findByRole('button', { name: 'Show Front Squat' })

    await user.click(screen.getByRole('button', { name: 'Cardio' }))
    await screen.findByRole('button', { name: 'Show Cycling' })
    expect(entries().map((entry) => entry.getAttribute('aria-label'))).toEqual(['Show Cycling', 'Show Rowing Machine'])
    expect(screen.getByRole('button', { name: 'Cardio' }).getAttribute('aria-pressed')).toBe('true')
    expect(location(router)).toBe('/ideas?category=cardio')
    expect(api.catalogQueries).toEqual(['limit=20', 'limit=20&category=cardio'])

    // Back to All: the first list is still cached.
    await user.click(screen.getByRole('button', { name: 'All' }))
    await screen.findByRole('button', { name: 'Show Front Squat' })
    expect(api.catalogQueries).toHaveLength(2)
  })

  it('reads the filter from the URL and ignores one the contract does not have', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: mixed })
    renderApp('/ideas?category=mobility')
    await screen.findByRole('button', { name: 'Show Hip Opener' })
    expect(api.catalogQueries).toEqual(['limit=20&category=mobility'])
  })

  it('treats an unknown category in the URL as All', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: mixed })
    renderApp('/ideas?category=yoga')
    await screen.findByRole('button', { name: 'Show Front Squat' })
    expect(api.catalogQueries).toEqual(['limit=20'])
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('says so when a category is empty', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    renderApp('/ideas?category=stretching')
    expect(await screen.findByText('No exercises in this category.')).toBeTruthy()
  })

  it('opens an exercise from the list without asking again, and Back closes it', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: mixed })
    const { router, user } = renderApp('/ideas')
    await user.click(await screen.findByRole('button', { name: 'Show Front Squat' }))

    const drawer = screen.getByRole('dialog', { name: 'Front Squat' })
    expect(within(drawer).getByText('Quadriceps')).toBeTruthy()
    expect(within(drawer).getByText('Barbell')).toBeTruthy()
    expect(within(drawer).getByText('No description yet.')).toBeTruthy()
    expect(location(router)).toBe(`/ideas?exercise=${mixed[0].id}`)
    // The list already had it.
    expect(api.detailCalls).toBe(0)

    await router.navigate(-1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(location(router)).toBe('/ideas')
  })

  it('closes the drawer with Escape, back to the list it came from', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    const { router, user } = renderApp('/ideas?category=cardio')
    await user.click(await screen.findByRole('button', { name: 'Show Cycling' }))
    expect(screen.getByRole('button', { name: 'Close' })).toBe(document.activeElement)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(location(router)).toBe('/ideas?category=cardio')
    // Went back, rather than leaving a second copy of the list in the history.
    expect(router.state.historyAction).toBe('POP')
  })

  it('loads a linked exercise from the server, and Close stays on Ideas', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: [{ ...mixed[1], description: 'Drive with the legs.' }] })
    const { router, user } = renderApp(`/ideas?exercise=${mixed[1].id}`)
    const drawer = await screen.findByRole('dialog', { name: 'Rowing Machine' })
    expect(within(drawer).getByText('Drive with the legs.')).toBeTruthy()
    expect(api.detailCalls).toBe(1)

    // Nothing to go back to: Close removes the exercise from the URL instead.
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(location(router)).toBe('/ideas')
  })

  it('says when a linked exercise is not in the catalog', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    renderApp('/ideas?exercise=0190c6a8-0000-7000-8000-999999999999')
    expect(await screen.findByText('This exercise is not in the catalog.')).toBeTruthy()
  })

  it('offers to try again when the list cannot load', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    server.use(
      http.get(`${origin}/api/v1/exercises`, () => apiError(429, 'rate_limited', 'rate limit exceeded', { 'Retry-After': '30' }), {
        once: true,
      }),
    )
    const { user } = renderApp('/ideas')
    expect((await screen.findByRole('alert')).textContent).toMatch('Too many requests. Try again in 30 seconds.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Show Front Squat' })).toBeTruthy()
  })

  it('keeps the loaded entries when the next page fails', async () => {
    fakeApi({ profile: 'Ana', catalog: many(25) })
    const { user } = renderApp('/ideas')
    await screen.findByRole('button', { name: 'Show Exercise 01' })
    server.use(
      http.get(`${origin}/api/v1/exercises`, () => apiError(429, 'rate_limited', 'rate limit exceeded'), { once: true }),
    )
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect((await screen.findByRole('alert')).textContent).toMatch('Too many requests')
    expect(entries()).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByRole('button', { name: 'Show Exercise 25' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends the user to /welcome when the profile disappears while the app is open', async () => {
    const api = fakeApi({ profile: 'Ana', catalog: mixed })
    const { router, user } = renderApp('/ideas')
    await screen.findByRole('button', { name: 'Show Front Squat' })

    // Deleted on another device; the next data request says so.
    api.profile = null
    await user.click(screen.getByRole('button', { name: 'Cardio' }))
    expect(await screen.findByRole('heading', { name: 'Create your cloud profile' })).toBeTruthy()

    await user.type(screen.getByLabelText('Display name'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
    expect(await heading('Ideas')).toBeTruthy()
    expect(location(router)).toBe('/ideas?category=cardio')
  })
})

describe('the exercise picker', () => {
  it('picks a catalog entry with its id, name and kind', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    const onPick = vi.fn()
    const { user } = renderComponent(<ExercisePicker onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: 'Cardio' }))
    await user.click(await screen.findByRole('button', { name: 'Add Rowing Machine' }))
    expect(onPick).toHaveBeenCalledWith({ exercise_id: mixed[1].id, name: 'Rowing Machine', kind: 'cardio' })
  })

  it('picks a free-form exercise without an id, on Enter and without submitting the form around it', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    const onPick = vi.fn()
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    const { user } = renderComponent(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <ExercisePicker onPick={onPick} />
      </form>,
    )
    await user.selectOptions(screen.getByLabelText('Kind'), 'Mobility')
    await user.type(screen.getByLabelText('Name'), '  Cat-cow {Enter}')
    expect(onPick).toHaveBeenCalledWith({ exercise_id: null, name: 'Cat-cow', kind: 'mobility' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
  })

  it('rejects a blank free-form name', async () => {
    fakeApi({ profile: 'Ana', catalog: mixed })
    const onPick = vi.fn()
    const { user } = renderComponent(<ExercisePicker onPick={onPick} />)
    await user.type(screen.getByLabelText('Name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add exercise' }))
    expect(screen.getByRole('alert').textContent).toBe('Enter a name for the exercise.')
    expect(onPick).not.toHaveBeenCalled()
  })
})
