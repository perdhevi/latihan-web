// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { meQueryKey } from '../profile/api'
import { apiError, fakeApi, origin, renderApp, server, setUpFakeServer, user } from '../../test/app'
import { filenameFrom } from './api'

setUpFakeServer()

// jsdom has no object URLs and does not download: record what the page asks for.
let saved: { name: string; text: Promise<string> }[] = []
beforeEach(() => {
  saved = []
  const blobs = new Map<string, Blob>()
  let made = 0
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${++made}`
    blobs.set(url, blob as Blob)
    return url
  }
  URL.revokeObjectURL = () => {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, text: blobs.get(this.href)!.text() })
  })
})
afterEach(() => vi.restoreAllMocks())

const draftKey = `latihan.activeSession.v1.${user('').id}`

describe('exporting', () => {
  it("downloads the server's document under the server's file name", async () => {
    fakeApi({ profile: 'Ana' })
    const { user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Export my data' }))
    expect((await screen.findByRole('status')).textContent).toBe('Downloaded latihan-export.json.')
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('latihan-export.json')
    expect(JSON.parse(await saved[0].text)).toMatchObject({ format: 'latihan-export/1', user: { display_name: 'Ana' } })
  })

  it('shows the wait when the export is rate limited', async () => {
    fakeApi({ profile: 'Ana' })
    server.use(
      http.get(`${origin}/api/v1/account/export`, () =>
        apiError(429, 'rate_limited', 'rate limit exceeded', { 'Retry-After': '900' }),
      ),
    )
    const { user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Export my data' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Too many requests. Try again in 15 minutes.')
    expect(saved).toEqual([])
  })

  it('says nothing was saved when the download breaks off', async () => {
    fakeApi({ profile: 'Ana' })
    server.use(http.get(`${origin}/api/v1/account/export`, () => HttpResponse.error()))
    const { user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Export my data' }))
    expect((await screen.findByRole('alert')).textContent).toMatch('Nothing was saved; try again.')
  })
})

describe('the export file name', () => {
  it('comes from Content-Disposition, as a name and never a path', () => {
    expect(filenameFrom('attachment; filename="latihan-export.json"')).toBe('latihan-export.json')
    expect(filenameFrom("attachment; filename*=UTF-8''ana%20data.json")).toBe('ana data.json')
    expect(filenameFrom('attachment; filename="../../etc/passwd"')).toBe('passwd')
    expect(filenameFrom('attachment; filename=".."')).toBe('latihan-export.json')
    expect(filenameFrom(null)).toBe('latihan-export.json')
  })
})

describe('erasing the account', () => {
  it('asks for the word first, and Cancel sends nothing', async () => {
    const api = fakeApi({ profile: 'Ana' })
    const { user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Erase my account' }))
    const dialog = screen.getByRole('dialog', { name: 'Erase your account?' })
    const erase = within(dialog).getByRole('button', { name: 'Erase my account' })
    expect(erase).toHaveProperty('disabled', true)
    await person.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'erase')
    // The exact word, not something like it.
    expect(erase).toHaveProperty('disabled', true)

    await person.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.erases).toBe(0)
  })

  it('erases, then forgets everything this browser held and says so', async () => {
    const api = fakeApi({ profile: 'Ana' })
    // A session in progress, kept in this browser.
    localStorage.setItem(
      draftKey,
      JSON.stringify({ version: 1, name: 'Workout', notes: '', performedAt: '2026-10-21T08:00:00Z', plan: null, exercises: [], attempts: [] }),
    )
    const { router, queryClient, tokens, user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Erase my account' }))
    const dialog = screen.getByRole('dialog', { name: 'Erase your account?' })
    await person.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE')
    await person.click(within(dialog).getByRole('button', { name: 'Erase my account' }))

    expect((await screen.findByRole('status')).textContent).toBe('Your account and its data were erased.')
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(api.erases).toBe(1)
    // Tokens, the draft and the cached data are gone; no logout was sent
    // for a login that no longer exists.
    expect(tokens.refresh).toBeNull()
    expect(tokens.access).toBeNull()
    expect(localStorage.getItem(draftKey)).toBeNull()
    await waitFor(() => expect(queryClient.getQueryData(meQueryKey)).toBeUndefined())
    expect(api.logoutCalls).toBe(0)
  })

  it('keeps the user signed in when the erase fails, and says erasing again finishes it', async () => {
    const api = fakeApi({ profile: 'Ana' })
    server.use(
      http.delete(`${origin}/api/v1/account`, () => apiError(503, 'not_ready', 'service unavailable'), { once: true }),
    )
    const { router, tokens, user: person } = renderApp('/profile')
    await person.click(await screen.findByRole('button', { name: 'Erase my account' }))
    const dialog = screen.getByRole('dialog', { name: 'Erase your account?' })
    await person.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE')
    await person.click(within(dialog).getByRole('button', { name: 'Erase my account' }))
    expect((await within(dialog).findByRole('alert')).textContent).toMatch('erasing again finishes the job')
    expect(router.state.location.pathname).toBe('/profile')
    expect(tokens.refresh).not.toBeNull()

    // Again: the fake's own handler answers 204.
    await person.click(within(dialog).getByRole('button', { name: 'Erase my account' }))
    expect(await screen.findByText('Your account and its data were erased.')).toBeTruthy()
    expect(api.erases).toBe(1)
  })
})
