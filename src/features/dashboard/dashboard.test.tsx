// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi, heading, progressPoint, renderApp, setUpFakeServer } from '../../test/app'

setUpFakeServer()

// Wednesday 21 October 2026, 10:00 UTC. Only Date is faked: timers, MSW and
// user-event run as usual.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

const totals = (sets: number, minutes: number) => ({ sets, repetitions: 0, volume_kg: 0, minutes })
const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

describe('this week', () => {
  it("adds up the server's days for the UTC week, Monday to Sunday", async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.stats.set('day', [
      progressPoint('2026-10-19', { sessions: 1, actual: totals(3, 0) }),
      progressPoint('2026-10-21', { sessions: 2, actual: totals(2, 30) }),
      // Last week: outside the range asked for.
      progressPoint('2026-10-18', { sessions: 5, actual: totals(9, 90) }),
    ])
    renderApp('/')
    await screen.findByRole('heading', { name: 'This week' })
    await waitFor(() => expect(tile('Sessions')).toBe('3'))
    expect(tile('Sets logged')).toBe('5')
    expect(tile('Minutes')).toBe('30')
    expect(api.stats.queries).toContain(
      new URLSearchParams({ bucket: 'day', from: '2026-10-19T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' }).toString(),
    )

    const days = within(screen.getByRole('list', { name: 'Days this week' })).getAllByRole('listitem')
    expect(days.map((day) => day.getAttribute('aria-label'))).toEqual([
      'Mon 19: 1 session',
      'Tue 20: no session',
      'Wed 21: 2 sessions',
      'Thu 22: no session',
      'Fri 23: no session',
      'Sat 24: no session',
      'Sun 25: no session',
    ])
    expect(days[2].getAttribute('aria-current')).toBe('date')
  })

  it('shows an empty week as nothing done yet', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/')
    expect(await screen.findByText('No sessions yet this week.')).toBeTruthy()
    expect(tile('Sessions')).toBe('0')
  })
})

describe('the completion chart', () => {
  it('asks for twelve weeks and leaves a gap, never a 0, where there is no value', async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.stats.set('week', [
      progressPoint('2026-09-28', { volume_completion_pct: 110.00000000000001, minutes_completion_pct: null }),
      progressPoint('2026-10-19', { volume_completion_pct: 80, minutes_completion_pct: 50 }),
    ])
    renderApp('/')
    const table = await screen.findByRole('table', { name: 'Planned work done per week' })
    expect(api.stats.queries).toContain(
      new URLSearchParams({ bucket: 'week', from: '2026-08-03T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' }).toString(),
    )
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(12)
    const cells = (week: string) =>
      within(within(table).getByRole('rowheader', { name: week }).closest('tr')!).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells('Sep 28')).toEqual(['110%', '—'])
    // No sessions that week: not in the answer, and not a zero.
    expect(cells('Oct 12')).toEqual(['—', '—'])
    expect(cells('Oct 19')).toEqual(['80%', '50%'])

    // Two volume points with a gap between them: two separate line pieces.
    const chart = screen.getByRole('img', { name: /Line chart/ })
    const volume = chart.querySelector('.series-1 .line')!.getAttribute('d')!
    expect(volume.match(/M/g)).toHaveLength(2)
    expect(volume).not.toContain('L')
    expect(chart.querySelectorAll('.series-1 .marker')).toHaveLength(2)
    expect(chart.querySelectorAll('.series-2 .marker')).toHaveLength(1)
    expect(chart.getAttribute('aria-label')).toBe(
      'Line chart. Volume: 80% in the week of Oct 19. Minutes: 50% in the week of Oct 19.',
    )
  })

  it('joins consecutive weeks into one line', async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.stats.set('week', [
      progressPoint('2026-10-12', { volume_completion_pct: 90 }),
      progressPoint('2026-10-19', { volume_completion_pct: 100 }),
    ])
    renderApp('/')
    const chart = await screen.findByRole('img', { name: /Line chart/ })
    const volume = chart.querySelector('.series-1 .line')!.getAttribute('d')!
    expect(volume.match(/M/g)).toHaveLength(1)
    expect(volume.match(/L/g)).toHaveLength(1)
  })

  it('says so instead of drawing an empty chart', async () => {
    const api = fakeApi({ profile: 'Ana' })
    // Sessions without a plan: done, but nothing was planned.
    api.stats.set('week', [progressPoint('2026-10-19')])
    renderApp('/')
    expect(await screen.findByText('No planned sessions in the last 12 weeks.')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Line chart/ })).toBeNull()
  })
})

describe('recent sessions', () => {
  it('shows the three newest', async () => {
    const api = fakeApi({ profile: 'Ana' })
    for (const [name, day] of [['A', 17], ['B', 18], ['C', 19], ['D', 20]] as const) {
      api.sessions.seed({
        name,
        notes: '',
        performed_at: `2026-10-${day}T07:00:00Z`,
        plan_id: null,
        exercises: [{ exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 20, avg_bpm: null }],
      })
    }
    renderApp('/')
    const recent = await screen.findByRole('heading', { name: 'Recent sessions' })
    const section = recent.closest('section')!
    await waitFor(() => expect(within(section).getAllByRole('link', { name: /activity/ })).toHaveLength(3))
    expect(
      within(section)
        .getAllByRole('link', { name: /activity/ })
        .map((link) => link.querySelector('.name')?.textContent),
    ).toEqual(['D', 'C', 'B'])
  })

  it('asks for the totals again after a session is deleted', async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.sessions.seed({
      name: 'Morning',
      notes: '',
      performed_at: '2026-10-21T06:00:00Z',
      plan_id: null,
      exercises: [{ exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 20, avg_bpm: null }],
    })
    const { router, user } = renderApp('/')
    await screen.findByRole('link', { name: /Morning/ })
    await waitFor(() => expect(api.stats.queries).toHaveLength(2))

    await user.click(screen.getByRole('link', { name: /Morning/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await heading('Sessions')
    await router.navigate('/')
    await heading('Hi, Ana')
    // Within the 30 s the totals would otherwise stay fresh.
    await waitFor(() => expect(api.stats.queries).toHaveLength(4))
    expect(api.sessions.all()).toEqual([])
  })
})
