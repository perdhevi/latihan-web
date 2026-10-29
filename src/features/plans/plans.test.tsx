// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { catalogEntry, fakeApi, heading, origin, renderApp, server, setUpFakeServer, unfolded, type PlanSeed } from '../../test/app'
import { planKeys } from './api'

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

const exercise = (n: number) => unfolded(screen.getByRole('group', { name: `Exercise ${n}` }))
const setOf = (n: number, set: number) => within(exercise(n)).getByRole('group', { name: `Set ${set}` })
const alertText = async () => (await screen.findByRole('alert')).textContent

/** /plans/new with a name and one strength exercise from the catalog, 5 × 60. */
async function fillNewPlan(name = 'Leg day') {
  const app = renderApp('/plans/new')
  const { user } = app
  await user.type(await screen.findByLabelText('Plan name'), name)
  await user.click(screen.getByRole('button', { name: 'Add exercise' }))
  await user.click(await screen.findByRole('button', { name: 'Add Front Squat' }))
  await user.type(within(setOf(1, 1)).getByLabelText('Reps'), '5')
  await user.type(within(setOf(1, 1)).getByLabelText('Weight (kg)'), '60')
  return app
}

describe('the plans list', () => {
  it('shows the plans newest first, each with its exercises', async () => {
    fakeApi({ profile: 'Ana', plans: [legDay, { ...legDay, name: 'Push day' }] })
    renderApp('/plans')
    const links = await screen.findAllByRole('link', { name: /day/ })
    expect(links.map((link) => link.textContent)).toEqual([
      'Push day2 exercises · Front Squat, Bike',
      'Leg day2 exercises · Front Squat, Bike',
    ])
  })

  it('says how to start when there are none', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/plans')
    expect(await screen.findByText('No plans yet. Create your first training plan.')).toBeTruthy()
  })
})

describe('creating a plan', () => {
  it('sends the plan in the contract shape, with an idempotency key, then lists it', async () => {
    const api = fakeApi({ profile: 'Ana', catalog })
    const { router, user } = await fillNewPlan()
    // Add a set (copies the last one), and a free-form timed exercise.
    await user.click(within(exercise(1)).getByRole('button', { name: 'Add set' }))
    await user.clear(within(setOf(1, 2)).getByLabelText('Weight (kg)'))
    await user.type(within(setOf(1, 2)).getByLabelText('Weight (kg)'), '62,5')
    await user.type(screen.getByLabelText('Name', { selector: '.picker input' }), 'Easy run')
    await user.selectOptions(screen.getByLabelText('Kind', { selector: '.picker select' }), 'Cardio')
    await user.click(screen.getByRole('button', { name: 'Add exercise' }))
    await user.type(within(exercise(2)).getByLabelText('Minutes'), '20')

    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/plans')
    expect(await screen.findByRole('link', { name: /Leg day/ })).toBeTruthy()

    const [request] = api.plans.requests
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(request.body).toEqual({
      name: 'Leg day',
      notes: '',
      exercises: [
        {
          exercise_id: squat.id,
          name: 'Front Squat',
          kind: 'strength',
          notes: '',
          sets: [
            { repetitions: 5, weight_kg: 60 },
            { repetitions: 5, weight_kg: 62.5 },
          ],
        },
        { exercise_id: null, name: 'Easy run', kind: 'cardio', notes: '', minutes: 20, avg_bpm: null },
      ],
    })
  })

  it('marks what is wrong and sends nothing', async () => {
    const api = fakeApi({ profile: 'Ana', catalog })
    const { user } = renderApp('/plans/new')
    await user.click(await screen.findByRole('button', { name: 'Save plan' }))
    expect(await alertText()).toMatch('Some fields need fixing')
    expect(screen.getByText('Enter a name for the plan.')).toBeTruthy()
    expect(screen.getByText('Add at least one exercise.')).toBeTruthy()

    await user.type(screen.getByLabelText('Plan name'), 'Leg day')
    await user.click(screen.getByRole('button', { name: 'Add exercise' }))
    await user.click(await screen.findByRole('button', { name: 'Add Front Squat' }))
    await user.type(within(setOf(1, 1)).getByLabelText('Reps'), '0')
    await user.type(within(setOf(1, 1)).getByLabelText('Weight (kg)'), 'heavy')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(within(setOf(1, 1)).getByText('Reps: a whole number from 1 to 1000.')).toBeTruthy()
    expect(within(setOf(1, 1)).getByText('Weight: 0 to 2000 kg, 0 for bodyweight.')).toBeTruthy()
    expect(within(setOf(1, 1)).getByLabelText('Reps').getAttribute('aria-invalid')).toBe('true')
    expect(api.plans.requests).toEqual([])
  })

  it('retries a create whose response was lost with the same key, and gets one plan', async () => {
    const api = fakeApi({ profile: 'Ana', catalog })
    let loseNext = true
    server.use(
      http.post(`${origin}/api/v1/plans`, async ({ request }) => {
        if (!loseNext) return undefined // to the fake
        loseNext = false
        // The server saves it, and the answer never arrives.
        await fetch(request.clone())
        return HttpResponse.error()
      }),
    )
    const { user } = await fillNewPlan()
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await alertText()).toMatch('Could not reach the server')

    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    const [first, retry] = api.plans.requests
    expect(retry.key).toBe(first.key)
    expect(api.plans.all()).toHaveLength(1)
  })

  it('uses a new key once the plan is edited, and the old one again if the edit is undone', async () => {
    const api = fakeApi({ profile: 'Ana', catalog })
    server.use(http.post(`${origin}/api/v1/plans`, () => HttpResponse.error(), { once: true }))
    server.use(http.post(`${origin}/api/v1/plans`, () => HttpResponse.error(), { once: true }))
    const { user } = await fillNewPlan('Leg')
    // MSW tries the newest handler first; each answers once. Record keys here.
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') keys.push(request.headers.get('Idempotency-Key'))
    })
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    await alertText()
    await user.type(screen.getByLabelText('Plan name'), ' day')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    await user.type(screen.getByLabelText('Plan name'), '{Backspace>4/}')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    server.events.removeAllListeners()

    expect(keys[1]).not.toBe(keys[0])
    expect(keys[2]).toBe(keys[0])
    expect(api.plans.all().map((plan) => plan.name)).toEqual(['Leg'])
  })
})

describe('editing a plan', () => {
  it('saves with If-Match set to the version it read', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const [plan] = api.plans.all()
    const { router, user } = renderApp(`/plans/${plan.id}`)
    const name = await screen.findByLabelText('Plan name')
    await user.clear(name)
    await user.type(name, 'Leg day A')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await heading('Plans')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/plans')
    expect(api.plans.requests).toEqual([expect.objectContaining({ method: 'PUT', id: plan.id, ifMatch: '"v1"' })])
    expect(api.plans.all()[0].name).toBe('Leg day A')
  })

  it('offers Reload when the plan changed on another device, then saves over the new version', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const [plan] = api.plans.all()
    const { user } = renderApp(`/plans/${plan.id}`)
    const name = await screen.findByLabelText('Plan name')
    api.plans.renameElsewhere(plan.id, 'Leg day (phone)')
    await user.type(name, '!')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await alertText()).toMatch('This plan changed on another device.')
    expect(api.plans.all()[0].name).toBe('Leg day (phone)')

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect((screen.getByLabelText('Plan name') as HTMLInputElement).value).toBe('Leg day (phone)'))
    await user.type(screen.getByLabelText('Plan name'), '!')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(api.plans.requests.map((request) => request.ifMatch)).toEqual(['"v1"', '"v2"'])
    expect(api.plans.all()[0].name).toBe('Leg day (phone)!')
  })

  it('can keep its own copy after a conflict and save it over the other change', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const [plan] = api.plans.all()
    const { user } = renderApp(`/plans/${plan.id}`)
    const name = await screen.findByLabelText('Plan name')
    api.plans.renameElsewhere(plan.id, 'Leg day (phone)')
    await user.type(name, ' (laptop)')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    await alertText()

    await user.click(screen.getByRole('button', { name: 'Keep my copy' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((screen.getByLabelText('Plan name') as HTMLInputElement).value).toBe('Leg day (laptop)')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(api.plans.all()[0].name).toBe('Leg day (laptop)')
  })

  it('does not let a background refetch move the version it edits', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const [plan] = api.plans.all()
    const { queryClient, user } = renderApp(`/plans/${plan.id}`)
    const name = await screen.findByLabelText('Plan name')
    await user.type(name, '!')

    // Another device saves, and this tab refetches (window focus, say).
    api.plans.renameElsewhere(plan.id, 'Leg day (phone)')
    await queryClient.refetchQueries({ queryKey: planKeys.detail(plan.id) })
    await user.click(screen.getByRole('button', { name: 'Save plan' }))

    // Saved against the version on screen: the change from the phone is not
    // silently overwritten.
    expect(await alertText()).toMatch('This plan changed on another device.')
    expect(api.plans.requests[0].ifMatch).toBe('"v1"')
  })

  it('renames a plan that sessions use, sending its exercises back unchanged', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [{ ...legDay, inUse: true }] })
    const [plan] = api.plans.all()
    const { user } = renderApp(`/plans/${plan.id}`)
    await user.type(await screen.findByLabelText('Plan name'), ' A')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(api.plans.all()[0].name).toBe('Leg day A')
  })

  it('offers Save as new plan when sessions use the targets it changes', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [{ ...legDay, inUse: true }] })
    const [plan] = api.plans.all()
    const { user } = renderApp(`/plans/${plan.id}`)
    await screen.findByLabelText('Plan name')
    const reps = within(setOf(1, 1)).getByLabelText('Reps') as HTMLInputElement
    expect(reps.value).toBe('5')
    await user.clear(reps)
    await user.type(reps, '8')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await alertText()).toMatch("Sessions already use this plan's targets")

    await user.click(screen.getByRole('button', { name: 'Save as new plan' }))
    expect(await heading('Plans')).toBeTruthy()
    const [original, copy] = api.plans.all()
    expect(original.exercises[0].sets).toEqual([{ repetitions: 5, weight_kg: 60 }])
    expect(copy.name).toBe('Leg day')
    expect(copy.exercises[0].sets).toEqual([{ repetitions: 8, weight_kg: 60 }])
    expect(api.plans.requests.at(-1)).toMatchObject({ method: 'POST', key: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  })

  it('saves exercises in the order they were moved to', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { user } = renderApp(`/plans/${api.plans.all()[0].id}`)
    await screen.findByLabelText('Plan name')
    await user.click(within(exercise(1)).getByRole('button', { name: 'Move down' }))
    expect(within(exercise(1)).getByLabelText('Name')).toHaveProperty('value', 'Bike')
    await user.click(screen.getByRole('button', { name: 'Save plan' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(api.plans.requests[0].body?.exercises.map((entry) => entry.name)).toEqual(['Bike', 'Front Squat'])
  })

  it('says so when the plan does not exist', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/plans/0190c6a8-0000-7000-9000-999999999999')
    expect(await heading('Plan not found')).toBeTruthy()
  })
})

describe('deleting a plan', () => {
  it('asks first, then deletes with If-Match', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const [plan] = api.plans.all()
    const { router, user } = renderApp(`/plans/${plan.id}`)
    await user.click(await screen.findByRole('button', { name: 'Delete plan' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this plan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.plans.requests).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Delete plan' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Delete this plan?' })).getByRole('button', { name: 'Delete' }))
    expect(await heading('Plans')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/plans')
    expect(api.plans.requests).toEqual([expect.objectContaining({ method: 'DELETE', ifMatch: '"v1"' })])
    expect(api.plans.all()).toEqual([])
  })

  it('keeps a plan that sessions use, and says why', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [{ ...legDay, inUse: true }] })
    const [plan] = api.plans.all()
    const { user } = renderApp(`/plans/${plan.id}`)
    await user.click(await screen.findByRole('button', { name: 'Delete plan' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await alertText()).toMatch('Sessions use this plan, so it was not deleted.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.plans.all()).toHaveLength(1)
  })
})

describe('unsaved changes', () => {
  it('asks before leaving a changed plan', async () => {
    fakeApi({ profile: 'Ana', catalog })
    const { router, user } = renderApp('/plans/new')
    await user.type(await screen.findByLabelText('Plan name'), 'Leg day')
    const home = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' })

    await user.click(home)
    const dialog = await screen.findByRole('dialog', { name: 'Discard this plan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/plans/new')
    expect((screen.getByLabelText('Plan name') as HTMLInputElement).value).toBe('Leg day')

    await user.click(home)
    await user.click(within(await screen.findByRole('dialog', { name: 'Discard this plan?' })).getByRole('button', { name: 'Discard' }))
    expect(await heading('Hi, Ana')).toBeTruthy()
  })

  it('lets an unchanged plan go without asking', async () => {
    const api = fakeApi({ profile: 'Ana', plans: [legDay] })
    const { user } = renderApp(`/plans/${api.plans.all()[0].id}`)
    await screen.findByLabelText('Plan name')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' }))
    expect(await heading('Hi, Ana')).toBeTruthy()
  })
})
