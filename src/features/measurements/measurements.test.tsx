// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { fakeApi, heading, renderApp, server, setUpFakeServer } from '../../test/app'

setUpFakeServer()

type MeasurementInput = components['schemas']['MeasurementInput']

const none = { weight_kg: null, height_cm: null, body_fat_percent: null, waist_cm: null, chest_cm: null, hip_cm: null }
const at = (day: string, values: Partial<MeasurementInput>): MeasurementInput => ({
  measured_at: `2026-10-${day}T07:00:00Z`,
  ...none,
  ...values,
})
const alertText = async () => (await screen.findByRole('alert')).textContent
const card = (label: string) =>
  within(screen.getByText(label, { selector: '.metric-cards .label' }).closest('li')!)

describe('the display name', () => {
  it('renames with If-Match, and the top bar follows', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user } = renderApp('/profile')
    const name = await screen.findByLabelText('Display name')
    await user.clear(name)
    await user.type(name, '  Ana Lim ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect((await screen.findByRole('status')).textContent).toBe('Saved.')
    expect(api.renames).toEqual([{ ifMatch: '"u1"', body: { display_name: 'Ana Lim' } }])
    expect(screen.getByText('Ana Lim', { selector: '.who' })).toBeTruthy()
  })

  it('offers Reload when the name changed on another device', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user } = renderApp('/profile')
    const name = await screen.findByLabelText('Display name')
    api.profile = 'Ana (phone)'
    api.profileVersion++
    await user.type(name, '!')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await alertText()).toMatch('This profile changed on another device.')

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByLabelText('Display name')).toHaveProperty('value', 'Ana (phone)'))
  })

  it('rejects a blank name without a request', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user } = renderApp('/profile')
    await user.clear(await screen.findByLabelText('Display name'))
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(screen.getByText('Enter a display name.')).toBeTruthy()
    expect(api.renames).toEqual([])
  })
})

describe('adding a measurement', () => {
  it('refuses an empty form without a request', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user } = renderApp('/profile/measurements/new')
    await user.click(await screen.findByRole('button', { name: 'Save measurement' }))
    expect(await alertText()).toBe('Enter at least one measurement.')
    expect(api.measurements.requests).toEqual([])
  })

  it('checks each metric against its limits', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user } = renderApp('/profile/measurements/new')
    await user.type(await screen.findByLabelText('Weight (kg)'), '0')
    await user.type(screen.getByLabelText('Body fat (%)'), '101')
    await user.click(screen.getByRole('button', { name: 'Save measurement' }))
    expect(screen.getByText('Weight: more than 0, at most 1000 kg.')).toBeTruthy()
    expect(screen.getByText('Body fat: 0 to 100 %.')).toBeTruthy()
    expect(api.measurements.requests).toEqual([])
  })

  it('sends what was filled in, null for the rest, with an idempotency key', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { router, user } = renderApp('/profile/measurements/new')
    await user.type(await screen.findByLabelText('Weight (kg)'), '72,5')
    await user.type(screen.getByLabelText('Body fat (%)'), '0')
    await user.click(screen.getByRole('button', { name: 'Save measurement' }))
    expect(await heading('Profile')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/profile')

    const [request] = api.measurements.requests
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(request.body).toEqual({
      measured_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      weight_kg: 72.5,
      height_cm: null,
      body_fat_percent: 0,
      waist_cm: null,
      chest_cm: null,
      hip_cm: null,
    })
    // Weight and body fat, each measured once so far.
    expect(await screen.findAllByText('First measurement', { selector: '.hint' })).toHaveLength(2)
  })
})

describe('editing a measurement', () => {
  it('sends null for a cleared field, with If-Match', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const saved = api.measurements.seed(at('20', { weight_kg: 72, waist_cm: 80 }))
    const { user } = renderApp(`/profile/measurements/${saved.id}`)
    await user.clear(await screen.findByLabelText('Waist (cm)'))
    await user.click(screen.getByRole('button', { name: 'Save measurement' }))
    expect(await heading('Profile')).toBeTruthy()
    expect(api.measurements.requests).toEqual([
      expect.objectContaining({ method: 'PUT', ifMatch: '"m1"', body: expect.objectContaining({ weight_kg: 72, waist_cm: null }) }),
    ])
    expect(api.measurements.all()[0].waist_cm).toBeNull()
  })

  it('sends an untouched time back as it came', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const saved = api.measurements.seed(at('20', { weight_kg: 72 }))
    const { user } = renderApp(`/profile/measurements/${saved.id}`)
    await user.type(await screen.findByLabelText('Weight (kg)'), '.4')
    await user.click(screen.getByRole('button', { name: 'Save measurement' }))
    await heading('Profile')
    expect(api.measurements.requests[0].body).toMatchObject({ measured_at: '2026-10-20T07:00:00.000Z', weight_kg: 72.4 })
  })

  it('offers Reload when it changed on another device', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const saved = api.measurements.seed(at('20', { weight_kg: 72 }))
    const { user } = renderApp(`/profile/measurements/${saved.id}`)
    const weight = await screen.findByLabelText('Weight (kg)')
    api.measurements.editElsewhere(saved.id, { weight_kg: 71 })
    await user.type(weight, '.5')
    await user.click(screen.getByRole('button', { name: 'Save measurement' }))
    expect(await alertText()).toMatch('This measurement changed on another device.')
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByLabelText('Weight (kg)')).toHaveProperty('value', '71'))
  })

  it('deletes after asking, and does not read it again', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const saved = api.measurements.seed(at('20', { weight_kg: 72 }))
    const { user } = renderApp(`/profile/measurements/${saved.id}`)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Delete measurement?' })).getByRole('button', { name: 'Delete' }))
    expect(await heading('Profile')).toBeTruthy()
    expect(await screen.findByText('No measurements yet. Add your starting point.')).toBeTruthy()
    expect(api.measurements.requests).toEqual([expect.objectContaining({ method: 'DELETE', ifMatch: '"m1"' })])
    expect(api.measurements.reads(saved.id)).toBe(1)
  })
})

describe('change since first', () => {
  it('shows each metric from its own first and latest entry', async () => {
    const api = fakeApi({ profile: 'Ana' })
    api.measurements.seed(at('01', { weight_kg: 74, waist_cm: 84 }))
    api.measurements.seed(at('10', { weight_kg: 73.1, body_fat_percent: 20 }))
    api.measurements.seed(at('20', { weight_kg: 72.4 }))
    renderApp('/profile')
    await screen.findByText('Weight', { selector: '.metric-cards .label' })

    expect(card('Weight').getByText('72.4 kg')).toBeTruthy()
    // 72.4 − 74, rounded: not −1.5999999999999943.
    expect(card('Weight').getByText('−1.6 kg since first entry')).toBeTruthy()
    // Measured once each: nothing to compare with.
    expect(card('Waist').getByText('First measurement')).toBeTruthy()
    expect(card('Body fat').getByText('First measurement')).toBeTruthy()
    // Never measured: no card.
    expect(screen.queryByText('Height', { selector: '.metric-cards .label' })).toBeNull()

    const history = screen.getAllByRole('link', { name: /Weight/ })
    expect(history.map((link) => link.querySelector('.hint')?.textContent)).toEqual([
      'Weight 72.4 kg',
      'Weight 73.1 kg · Body fat 20 %',
      'Weight 74 kg · Waist 84 cm',
    ])
  })

  it('reads every page, so "first" is the oldest entry', async () => {
    const api = fakeApi({ profile: 'Ana' })
    // 120 entries: the oldest is on the second page of 100.
    for (let i = 0; i < 120; i++) {
      api.measurements.seed({ ...none, measured_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(), weight_kg: 80 - i / 10 })
    }
    const pages: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/measurements?')) pages.push(new URL(request.url).search)
    })
    renderApp('/profile')
    // 80 − 68.1 (the 120th) = −11.9.
    expect(await screen.findByText('−11.9 kg since first entry')).toBeTruthy()
    expect(pages).toEqual(['?limit=100', '?limit=100&cursor=100'])
    server.events.removeAllListeners()
  })

  it('says how to start when there are none', async () => {
    fakeApi({ profile: 'Ana' })
    renderApp('/profile')
    expect(await screen.findByText('No measurements yet. Add your starting point.')).toBeTruthy()
  })
})
