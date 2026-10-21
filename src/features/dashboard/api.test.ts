import { describe, expect, it } from 'vitest'
import { weekStart } from './api'

const monday = (iso: string) => weekStart(new Date(iso)).toISOString()

describe('the UTC week', () => {
  it('starts on Monday at 00:00 UTC', () => {
    expect(monday('2026-10-21T10:00:00Z')).toBe('2026-10-19T00:00:00.000Z')
    expect(monday('2026-10-19T00:00:00Z')).toBe('2026-10-19T00:00:00.000Z')
  })

  it('keeps Sunday evening in the week that is ending', () => {
    expect(monday('2026-10-25T23:59:59Z')).toBe('2026-10-19T00:00:00.000Z')
    expect(monday('2026-10-26T00:00:00Z')).toBe('2026-10-26T00:00:00.000Z')
  })

  it('counts in UTC, not local time: Monday 05:00 in Jakarta is still last week', () => {
    // 2026-10-26 05:00 +07:00 is Sunday 22:00 UTC.
    expect(monday('2026-10-26T05:00:00+07:00')).toBe('2026-10-19T00:00:00.000Z')
  })

  it('crosses month and year ends', () => {
    expect(monday('2027-01-01T12:00:00Z')).toBe('2026-12-28T00:00:00.000Z')
  })
})
