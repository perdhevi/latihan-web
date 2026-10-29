// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { fakeApi, heading, renderApp, setUpFakeServer, unfolded, user, type PlanSeed } from '../../test/app'

setUpFakeServer()

type Comparison = components['schemas']['Comparison']
type SessionInput = components['schemas']['SessionInput']

const zero = { sets: 0, repetitions: 0, volume_kg: 0, minutes: 0 }

const legDay: PlanSeed = {
  name: 'Leg day',
  notes: '',
  exercises: [
    { exercise_id: null, name: 'Squat', kind: 'strength', notes: '', sets: [{ repetitions: 5, weight_kg: 60 }, { repetitions: 5, weight_kg: 60 }] },
    { exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 20, avg_bpm: 140 },
    { exercise_id: null, name: 'Stretch', kind: 'stretching', notes: '', minutes: 5, avg_bpm: null },
  ],
}

const free = (name: string, performedAt: string): SessionInput => ({
  name,
  notes: '',
  performed_at: performedAt,
  plan_id: null,
  exercises: [{ exercise_id: null, name: 'Push-up', kind: 'strength', notes: '', sets: [{ repetitions: 12, weight_kg: 0 }] }],
})

/** A session against Leg day, and the comparison the server would send for it. */
function sessionAgainstPlan(api: ReturnType<typeof fakeApi>) {
  const [plan] = api.plans.all()
  const [squat, run, stretch] = plan.exercises
  const session = api.sessions.seed({
    name: 'Leg day',
    notes: 'Felt strong',
    performed_at: '2026-10-21T07:00:00Z',
    plan_id: plan.id,
    exercises: [
      { plan_exercise_id: squat.id, exercise_id: null, name: 'Squat', kind: 'strength', notes: '', sets: [{ repetitions: 6, weight_kg: 60 }, { repetitions: 5, weight_kg: 62.5 }, { repetitions: 5, weight_kg: 60 }] },
      { plan_exercise_id: run.id, exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 25, avg_bpm: null },
      { plan_exercise_id: null, exercise_id: null, name: 'Plank', kind: 'mobility', notes: '', minutes: 3, avg_bpm: null },
    ],
  })
  const comparison: Comparison = {
    plan_id: plan.id,
    session_id: session.id,
    user_id: user('').id,
    plan_updated_at: plan.updated_at,
    planned_totals: { sets: 2, repetitions: 10, volume_kg: 600, minutes: 25 },
    actual_totals: { sets: 3, repetitions: 16, volume_kg: 972.5, minutes: 28 },
    delta: { sets: 1, repetitions: 6, volume_kg: 372.5, minutes: 3 },
    exercises: [
      {
        plan_exercise_id: squat.id,
        status: 'matched',
        planned: { name: 'Squat', kind: 'strength', notes: '', sets: [{ repetitions: 5, weight_kg: 60 }, { repetitions: 5, weight_kg: 60 }] },
        actual: { name: 'Squat', kind: 'strength', notes: '', sets: [{ repetitions: 6, weight_kg: 60 }, { repetitions: 5, weight_kg: 62.5 }, { repetitions: 5, weight_kg: 60 }] },
        planned_totals: { sets: 2, repetitions: 10, volume_kg: 600, minutes: 0 },
        actual_totals: { sets: 3, repetitions: 16, volume_kg: 972.5, minutes: 0 },
        delta: { sets: 1, repetitions: 6, volume_kg: 372.5, minutes: 0 },
        avg_bpm_delta: null,
        sets: [
          { number: 1, planned: { repetitions: 5, weight_kg: 60 }, actual: { repetitions: 6, weight_kg: 60 }, repetitions_delta: 1, weight_kg_delta: 0 },
          { number: 2, planned: { repetitions: 5, weight_kg: 60 }, actual: { repetitions: 5, weight_kg: 62.5 }, repetitions_delta: 0, weight_kg_delta: 2.5 },
          { number: 3, planned: null, actual: { repetitions: 5, weight_kg: 60 }, repetitions_delta: null, weight_kg_delta: null },
        ],
      },
      {
        plan_exercise_id: run.id,
        status: 'matched',
        planned: { name: 'Run', kind: 'cardio', notes: '', minutes: 20, avg_bpm: 140 },
        actual: { name: 'Run', kind: 'cardio', notes: '', minutes: 25 },
        planned_totals: { ...zero, minutes: 20 },
        actual_totals: { ...zero, minutes: 25 },
        delta: { ...zero, minutes: 5 },
        // The actual BPM was not recorded.
        avg_bpm_delta: null,
        sets: [],
      },
      {
        plan_exercise_id: stretch.id,
        status: 'missed',
        planned: { name: 'Stretch', kind: 'stretching', notes: '', minutes: 5 },
        actual: null,
        planned_totals: { ...zero, minutes: 5 },
        actual_totals: zero,
        delta: { ...zero, minutes: -5 },
        avg_bpm_delta: null,
        sets: [],
      },
      {
        plan_exercise_id: null,
        status: 'unplanned',
        planned: null,
        actual: { name: 'Plank', kind: 'mobility', notes: '', minutes: 3 },
        planned_totals: zero,
        actual_totals: { ...zero, minutes: 3 },
        delta: { ...zero, minutes: 3 },
        avg_bpm_delta: null,
        sets: [],
      },
    ],
  }
  api.sessions.setComparison(comparison)
  return { session, comparison }
}

const folded = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('article')!
const card = (name: string) => unfolded(folded(name))
/** The cells of a row, by its header cell. */
const row = (scope: HTMLElement, label: string) =>
  within(within(scope).getByRole('rowheader', { name: label }).closest('tr')!)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)

describe('the sessions list', () => {
  it('shows the sessions newest first, with when and how many activities', async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.sessions.seed(free('Older', '2026-10-19T07:00:00Z'))
    api.sessions.seed(free('Newer', '2026-10-21T07:00:00Z'))
    renderApp('/sessions')
    const links = await screen.findAllByRole('link', { name: /Older|Newer/ })
    expect(links.map((link) => link.querySelector('.name')?.textContent)).toEqual(['Newer', 'Older'])
    expect(links[0].textContent).toMatch(/1 activity · free/)
  })

  it('says so when there are none, and offers to start one', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/sessions')
    expect(await screen.findByText('No completed sessions yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a new session' })).toBeTruthy()
  })

  it('loads more until there is no next cursor', async () => {
    const api = fakeApi({ profile: 'Ana' })
    for (let day = 1; day <= 25; day++) api.sessions.seed(free(`Day ${day}`, `2026-09-${String(day).padStart(2, '0')}T07:00:00Z`))
    const { user: person } = renderApp('/sessions')
    await screen.findByRole('link', { name: /Day 25/ })
    expect(screen.getAllByRole('link', { name: /^Day / })).toHaveLength(20)
    await person.click(screen.getByRole('button', { name: 'Load more' }))
    // The link's name runs on into the date: "Day 1Sep 1, 2026…".
    await screen.findByRole('link', { name: /^Day 1(?!\d)/ })
    expect(screen.getAllByRole('link', { name: /^Day / })).toHaveLength(25)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })
})

describe('a session against its plan', () => {
  it('shows totals, and each planned exercise next to what was done', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { session } = sessionAgainstPlan(api)
    renderApp(`/sessions/${session.id}`)
    expect(await screen.findByRole('heading', { name: 'Planned versus done' })).toBeTruthy()
    expect(screen.getByText(/2 of 3 planned exercises logged · 1 not in the plan/)).toBeTruthy()
    expect(screen.getByText('Felt strong')).toBeTruthy()

    const totals = screen.getByRole('table', { name: 'Totals' })
    expect(row(totals, 'Volume')).toEqual(['600', '972.5', '+372.5 kg'])
    expect(row(totals, 'Minutes')).toEqual(['25', '28', '+3 min'])

    // Folded at first, with a summary of what was done against the plan.
    const toggle = within(folded('Squat')).getByRole('button', { name: 'Squat' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(folded('Squat')).getByText('Done: 3 sets · 6 × 60 kg · Planned: 2 sets · 5 × 60 kg')).toBeTruthy()

    const squat = card('Squat')
    expect(within(squat).getByText('Planned and logged')).toBeTruthy()
    expect(row(squat, '1')).toEqual(['5 × 60 kg', '6 × 60 kg', '+1', '0 kg'])
    expect(row(squat, '2')).toEqual(['5 × 60 kg', '5 × 62.5 kg', '0', '+2.5 kg'])
    // An extra set had no target: nothing to compare with.
    expect(row(squat, '3')).toEqual(['—', '5 × 60 kg', '—', '—'])
  })

  it('shows what was not recorded as "—", never as 0', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { session } = sessionAgainstPlan(api)
    renderApp(`/sessions/${session.id}`)
    await screen.findByRole('heading', { name: 'Planned versus done' })

    const run = card('Run')
    expect(row(run, 'Minutes')).toEqual(['20', '25', '+5 min'])
    expect(row(run, 'Average BPM')).toEqual(['140', '—', '—'])

    const stretch = card('Stretch')
    expect(within(stretch).getByText('Planned but not logged')).toBeTruthy()
    expect(row(stretch, 'Minutes')).toEqual(['5', '—', '—'])

    const plank = card('Plank')
    expect(within(plank).getByText('Not in the plan')).toBeTruthy()
    expect(row(plank, 'Minutes')).toEqual(['—', '3', '—'])
  })

  it('falls back to the activities when there is no comparison', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { session, comparison } = sessionAgainstPlan(api)
    // The server answers 404 comparison_not_found: not attached to that plan.
    api.sessions.setComparison({ ...comparison, plan_id: '0190c6a8-0000-7000-9000-999999999999' })
    renderApp(`/sessions/${session.id}`)
    expect(await screen.findByText('The comparison with its plan is not available.')).toBeTruthy()
    expect(row(card('Squat'), '3')).toEqual(['5 × 60 kg'])
  })

  it('asks for the comparison again after the session is edited', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { session } = sessionAgainstPlan(api)
    const { router, user: person } = renderApp(`/sessions/${session.id}`)
    await screen.findByRole('heading', { name: 'Planned versus done' })
    expect(api.sessions.comparisonCalls()).toBe(1)

    await person.click(screen.getByRole('link', { name: 'Edit' }))
    await person.type(await screen.findByLabelText('Session name'), ' A')
    await person.click(screen.getByRole('button', { name: 'Save session' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sessions/${session.id}`))
    expect(await heading('Leg day A')).toBeTruthy()
    await waitFor(() => expect(api.sessions.comparisonCalls()).toBe(2))
  })
})

describe('a session without a plan', () => {
  it('lists the activities and asks for no comparison', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const session = api.sessions.seed(free('Morning', '2026-10-21T06:00:00Z'))
    renderApp(`/sessions/${session.id}`)
    expect(await heading('Morning')).toBeTruthy()
    expect(screen.getByText('Trained freely, without a plan.')).toBeTruthy()
    expect(row(card('Push-up'), '1')).toEqual(['12 × 0 kg'])
    expect(api.sessions.comparisonCalls()).toBe(0)
  })

  it('says so when the session does not exist', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/sessions/0190c6a8-0000-7000-a000-999999999999')
    expect(await heading('Session not found')).toBeTruthy()
  })
})

describe('deleting a session', () => {
  it('asks first, then deletes with If-Match and frees its plan', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { session } = sessionAgainstPlan(api)
    const { router, user: person } = renderApp(`/sessions/${session.id}`)
    await person.click(await screen.findByRole('button', { name: 'Delete' }))
    await person.click(within(screen.getByRole('dialog', { name: 'Delete this session?' })).getByRole('button', { name: 'Cancel' }))
    expect(api.sessions.requests).toEqual([])

    await person.click(screen.getByRole('button', { name: 'Delete' }))
    await person.click(within(screen.getByRole('dialog', { name: 'Delete this session?' })).getByRole('button', { name: 'Delete' }))
    expect(await heading('Sessions')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sessions')
    expect(api.sessions.requests).toEqual([expect.objectContaining({ method: 'DELETE', ifMatch: '"s1"' })])
    expect(await screen.findByText('No completed sessions yet.')).toBeTruthy()
    // Read once to show it, and not again once it was deleted.
    expect(api.sessions.reads(session.id)).toBe(1)
  })

  it('shows the latest version when it changed elsewhere, and deletes only when asked again', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const session = api.sessions.seed(free('Morning', '2026-10-21T06:00:00Z'))
    const { user: person } = renderApp(`/sessions/${session.id}`)
    await heading('Morning')
    api.sessions.renameElsewhere(session.id, 'Morning (phone)')

    await person.click(screen.getByRole('button', { name: 'Delete' }))
    await person.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect((await screen.findByRole('alert')).textContent).toMatch('This session changed on another device.')
    expect(await heading('Morning (phone)')).toBeTruthy()
    expect(api.sessions.all()).toHaveLength(1)
  })
})
