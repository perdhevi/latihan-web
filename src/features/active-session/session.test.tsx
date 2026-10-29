// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { catalogEntry, fakeApi, heading, origin, renderApp, server, setUpFakeServer, unfolded, user, type PlanSeed } from '../../test/app'
import { parseDraft } from './store'

setUpFakeServer()

const squat = catalogEntry(1, 'Front Squat', 'strength')
const catalog = [squat, catalogEntry(2, 'Rowing Machine', 'cardio')]
const legDay: PlanSeed = {
  name: 'Leg day',
  notes: '',
  exercises: [
    { exercise_id: squat.id, name: 'Front Squat', kind: 'strength', notes: '', sets: [{ repetitions: 5, weight_kg: 60 }] },
    { exercise_id: null, name: 'Bike', kind: 'cardio', notes: '', minutes: 10, avg_bpm: null },
  ],
}

const draftKey = `latihan.activeSession.v1.${user('').id}`
const storedDraft = () => parseDraft(localStorage.getItem(draftKey))
const folded = (n: number) => screen.getByRole('group', { name: `Exercise ${n}` })
const exercise = (n: number) => unfolded(folded(n))
const setOf = (n: number, set: number) => within(exercise(n)).getByRole('group', { name: `Set ${set}` })
const alertText = async () => (await screen.findByRole('alert')).textContent

/** From Home: Start a new session, then the plan named `choice` (or train freely). */
async function start(choice: string, path = '/') {
  const app = renderApp(path)
  await app.user.click(await screen.findByRole('button', { name: 'Start a new session' }))
  const dialog = screen.getByRole('dialog', { name: 'Start from a plan?' })
  await app.user.click(await within(dialog).findByRole('button', { name: new RegExp(choice) }))
  await heading(choice === 'No plan' ? 'Workout' : choice)
  return app
}

describe('starting a session', () => {
  it('asks which plan to follow, and shows its targets as a guide', async () => {
    fakeApi({ profile: 'Ana', plans: [legDay] })
    const { router } = await start('Leg day')
    expect(router.state.location.pathname).toBe('/session/active')
    expect(screen.getByText('Targets are a guide. Log your actual results below.')).toBeTruthy()
    expect(screen.getByText('1 set · 5 × 60 kg')).toBeTruthy()
    expect(screen.getByText('10 min')).toBeTruthy()
    expect(storedDraft()).toMatchObject({ name: 'Leg day', plan: { name: 'Leg day' }, exercises: [] })
  })

  it('trains freely as "Workout"', async () => {
    fakeApi({ profile: 'Ana' })
    await start('No plan')
    expect(screen.getByText('No plan for this session. Add an activity to train freely.')).toBeTruthy()
  })
})

describe('the session in progress', () => {
  it('logs each target once, starting from its planned values, and finishes with its links', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { router, user: person } = await start('Leg day')
    const [plan] = api.plans.all()

    await person.click(screen.getByRole('button', { name: 'Log Front Squat' }))
    expect(screen.getByRole('button', { name: 'Front Squat logged' })).toHaveProperty('disabled', true)
    expect(within(setOf(1, 1)).getByLabelText('Reps')).toHaveProperty('value', '5')
    expect(within(exercise(1)).getByText('Target: 1 set · 5 × 60 kg')).toBeTruthy()
    await person.clear(within(setOf(1, 1)).getByLabelText('Reps'))
    await person.type(within(setOf(1, 1)).getByLabelText('Reps'), '6')
    // An extra, unplanned activity.
    await person.click(screen.getByRole('button', { name: 'Add exercise' }))
    await person.type(screen.getByLabelText('Name', { selector: '.picker input' }), 'Plank')
    await person.selectOptions(screen.getByLabelText('Kind', { selector: '.picker select' }), 'Mobility')
    await person.click(screen.getByRole('button', { name: 'Add exercise' }))
    await person.type(within(exercise(2)).getByLabelText('Minutes'), '3')
    const startedAt = storedDraft()!.performedAt

    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sessions\/[0-9a-f-]{36}$/))
    const [request] = api.sessions.requests
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(request.body).toEqual({
      name: 'Leg day',
      notes: '',
      performed_at: startedAt,
      plan_id: plan.id,
      exercises: [
        {
          plan_exercise_id: plan.exercises[0].id,
          exercise_id: squat.id,
          name: 'Front Squat',
          kind: 'strength',
          notes: '',
          sets: [{ repetitions: 6, weight_kg: 60 }],
        },
        { plan_exercise_id: null, exercise_id: null, name: 'Plank', kind: 'mobility', notes: '', minutes: 3, avg_bpm: null },
      ],
    })
    // Cleared once the server has it, and only then.
    expect(localStorage.getItem(draftKey)).toBeNull()
  })

  it('survives a reload, and Home offers to resume it', async () => {
    fakeApi({ profile: 'Ana', catalog })
    const { user: person } = await start('No plan')
    await person.click(screen.getByRole('button', { name: 'Add exercise' }))
    await person.click(await screen.findByRole('button', { name: 'Add Front Squat' }))
    await person.type(within(setOf(1, 1)).getByLabelText('Reps'), '8')

    // A new page load: a new app, the same storage.
    cleanup()
    renderApp('/')
    await screen.findByRole('link', { name: 'Resume active session' })
    renderApp('/session/active')
    expect(await heading('Workout')).toBeTruthy()
    // Rows already logged come back folded, with a summary.
    const toggle = within(folded(1)).getByRole('button', { name: 'Front Squat' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(folded(1)).getByText('1 set · 8 × 0 kg')).toBeTruthy()
    await person.click(toggle)
    expect(within(setOf(1, 1)).getByLabelText('Reps')).toHaveProperty('value', '8')
  })

  it('keeps the draft and its key when Finish fails, so a retry after a reload cannot save twice', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    let loseNext = true
    server.use(
      http.post(`${origin}/api/v1/sessions`, async ({ request }) => {
        if (!loseNext) return undefined
        loseNext = false
        // Saved by the server; the answer never arrives.
        await fetch(request.clone())
        return HttpResponse.error()
      }),
    )
    const { user: person } = await start('Leg day')
    await person.click(screen.getByRole('button', { name: 'Log Front Squat' }))
    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    expect(await alertText()).toMatch('What you logged is still here.')
    const [attempt] = storedDraft()!.attempts
    expect(attempt.key).toBe(api.sessions.requests[0].key)

    cleanup()
    const { router, user: again } = renderApp('/session/active')
    await again.click(await screen.findByRole('button', { name: 'Finish session' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sessions\//))
    expect(api.sessions.requests.map((request) => request.key)).toEqual([attempt.key, attempt.key])
    expect(api.sessions.all()).toHaveLength(1)
  })

  it('sends a new key once the session changed after a failed Finish', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    server.use(http.post(`${origin}/api/v1/sessions`, () => HttpResponse.error(), { once: true }))
    const { user: person } = await start('Leg day')
    await person.click(screen.getByRole('button', { name: 'Log Front Squat' }))
    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    await alertText()
    const firstKey = storedDraft()!.attempts[0].key

    await person.type(screen.getByLabelText('Session name'), ' A')
    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    await waitFor(() => expect(api.sessions.requests).toHaveLength(1))
    expect(api.sessions.requests[0].key).not.toBe(firstKey)
  })

  it('finishes without the plan when the plan was deleted meanwhile', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { user: person } = await start('Leg day')
    await person.click(screen.getByRole('button', { name: 'Log Front Squat' }))
    api.plans.deleteElsewhere(api.plans.all()[0].id)

    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    expect(await alertText()).toMatch('The plan this session follows no longer exists')
    await person.click(screen.getByRole('button', { name: 'Keep the activities, without the plan' }))
    expect(screen.getByText('No plan for this session. Add an activity to train freely.')).toBeTruthy()
    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    await waitFor(() => expect(api.sessions.all()).toHaveLength(1))
    expect(api.sessions.all()[0]).toMatchObject({ plan_id: null, exercises: [{ name: 'Front Squat', plan_exercise_id: null }] })
  })

  it('will not finish without an activity', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user: person } = await start('No plan')
    await person.click(screen.getByRole('button', { name: 'Finish session' }))
    expect(screen.getByText('Log at least one activity.')).toBeTruthy()
    expect(api.sessions.requests).toEqual([])
  })

  it('discards the draft after asking', async () => {
    fakeApi({ profile: 'Ana' })
    const { user: person } = await start('No plan')
    await person.click(screen.getByRole('button', { name: 'Discard session' }))
    await person.click(within(screen.getByRole('dialog', { name: 'Discard this session?' })).getByRole('button', { name: 'Discard' }))
    expect(await screen.findByText('No session in progress.')).toBeTruthy()
    expect(localStorage.getItem(draftKey)).toBeNull()
  })

  it("does not show another account's draft", async () => {
    fakeApi({ profile: 'Ana' })
    localStorage.setItem(
      'latihan.activeSession.v1.0190c6a8-0000-7000-8000-00000000ffff',
      JSON.stringify({ version: 1, name: 'Theirs', notes: '', performedAt: '2026-10-21T08:00:00Z', plan: null, exercises: [], attempts: [] }),
    )
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Start a new session' })).toBeTruthy()
  })

  it('says so when the browser will not keep the draft', async () => {
    fakeApi({ profile: 'Ana' })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    try {
      await start('No plan')
      expect(screen.getByText(/Not saved on this device/)).toBeTruthy()
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('editing a saved session', () => {
  it('saves with If-Match, and offers Reload after a change elsewhere', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const saved = api.sessions.seed({
      name: 'Morning',
      notes: '',
      performed_at: '2026-10-20T06:30:15Z',
      plan_id: null,
      exercises: [{ exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 30, avg_bpm: null }],
    })
    const { router, user: person } = renderApp(`/sessions/${saved.id}/edit`)
    const name = await screen.findByLabelText('Session name')
    api.sessions.renameElsewhere(saved.id, 'Morning (phone)')
    await person.type(name, ' run')
    await person.click(screen.getByRole('button', { name: 'Save session' }))
    expect(await alertText()).toMatch('This session changed on another device.')

    await person.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByLabelText('Session name')).toHaveProperty('value', 'Morning (phone)'))
    await person.type(screen.getByLabelText('Session name'), '!')
    await person.click(screen.getByRole('button', { name: 'Save session' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sessions/${saved.id}`))
    expect(api.sessions.requests.map((request) => request.ifMatch)).toEqual(['"s1"', '"s2"'])
    // The time was not touched, so it went back as it came, seconds and all.
    expect(api.sessions.requests[1].body?.performed_at).toBe('2026-10-20T06:30:15.000Z')
    expect(api.sessions.all()[0].name).toBe('Morning (phone)!')
  })
})
