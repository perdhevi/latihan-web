import { describe, expect, it } from 'vitest'
import type { Measurement } from './api'
import { draftFrom, emptyDraft, progress, validateMeasurement } from './model'

const measurement = (day: string, values: Partial<Measurement>): Measurement => ({
  id: day,
  user_id: 'u',
  measured_at: `2026-10-${day}T07:00:00Z`,
  weight_kg: null,
  height_cm: null,
  body_fat_percent: null,
  waist_cm: null,
  chest_cm: null,
  hip_cm: null,
  created_at: '',
  updated_at: '',
  ...values,
})

describe('a measurement form', () => {
  it('turns a saved measurement back into the same value', () => {
    const saved = measurement('20', { weight_kg: 72.4, body_fat_percent: 0, hip_cm: 99.5 })
    const result = validateMeasurement(draftFrom(saved))
    expect(result).toEqual({
      value: {
        measured_at: '2026-10-20T07:00:00.000Z',
        weight_kg: 72.4,
        height_cm: null,
        body_fat_percent: 0,
        waist_cm: null,
        chest_cm: null,
        hip_cm: 99.5,
      },
    })
  })

  it('needs at least one metric, and a time', () => {
    expect(validateMeasurement(emptyDraft(new Date()))).toEqual({ errors: { form: 'Enter at least one measurement.' } })
    expect(validateMeasurement({ ...emptyDraft(new Date()), measuredAt: '', weight_kg: '70' })).toEqual({
      errors: { measuredAt: 'Enter when you measured.' },
    })
  })

  it('holds each limit, inclusive only for body fat', () => {
    const draft = emptyDraft(new Date())
    expect(validateMeasurement({ ...draft, body_fat_percent: '0' })).toHaveProperty('value')
    expect(validateMeasurement({ ...draft, body_fat_percent: '100' })).toHaveProperty('value')
    expect(validateMeasurement({ ...draft, height_cm: '0' })).toHaveProperty('errors.height_cm')
    expect(validateMeasurement({ ...draft, height_cm: '300' })).toHaveProperty('value')
    expect(validateMeasurement({ ...draft, waist_cm: '500,1' })).toHaveProperty('errors.waist_cm')
    expect(validateMeasurement({ ...draft, chest_cm: 'ten' })).toHaveProperty('errors.chest_cm')
  })
})

describe('change since first', () => {
  it('compares each metric with its own first entry, in time order', () => {
    // Out of order on purpose: the API sends newest first.
    const result = progress([
      measurement('20', { weight_kg: 72.4 }),
      measurement('01', { weight_kg: 74, waist_cm: 84 }),
      measurement('10', { weight_kg: 73.1, waist_cm: 82.5 }),
    ])
    expect(result).toEqual([
      { key: 'weight_kg', label: 'Weight', unit: 'kg', latest: 72.4, sinceFirst: -1.6 },
      { key: 'waist_cm', label: 'Waist', unit: 'cm', latest: 82.5, sinceFirst: -1.5 },
    ])
  })

  it('has nothing to compare for a metric measured once', () => {
    expect(progress([measurement('01', { body_fat_percent: 0 })])).toEqual([
      { key: 'body_fat_percent', label: 'Body fat', unit: '%', latest: 0, sinceFirst: null },
    ])
  })
})
