import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { createDraftStore, keyFor, parseDraft, reducer, type ActiveSession } from './store'

type Plan = components['schemas']['Plan']

const plan: Plan = {
  id: 'p1',
  user_id: 'u1',
  name: 'Leg day',
  notes: '',
  exercises: [{ id: 't1', exercise_id: null, name: 'Squat', kind: 'strength', notes: '', sets: [{ repetitions: 5, weight_kg: 60 }] }],
  created_at: '2026-10-21T00:00:00Z',
  updated_at: '2026-10-21T00:00:00Z',
}
const started = reducer(null, { type: 'start', plan, now: '2026-10-21T08:00:00.000Z' }) as ActiveSession

/** A Storage over a Map, for Node. */
function memory(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
}

describe('the session reducer', () => {
  it('starts once; a second start keeps the first session', () => {
    expect(started).toMatchObject({ name: 'Leg day', performedAt: '2026-10-21T08:00:00.000Z', plan: { id: 'p1' } })
    expect(reducer(started, { type: 'start', plan: null, now: 'later' })).toBe(started)
    expect(reducer(null, { type: 'start', plan: null, now: 'now' })).toMatchObject({ name: 'Workout', plan: null })
  })

  it('logs a target once, linked to it, from its planned values', () => {
    const once = reducer(started, { type: 'logTarget', target: plan.exercises[0] })!
    expect(once.exercises).toMatchObject([{ plan_exercise_id: 't1', name: 'Squat', sets: [{ repetitions: '5', weight_kg: '60' }] }])
    expect(reducer(once, { type: 'logTarget', target: plan.exercises[0] })).toBe(once)
  })

  it('detaches the plan from the session and its activities', () => {
    const logged = reducer(started, { type: 'logTarget', target: plan.exercises[0] })!
    const free = reducer(logged, { type: 'detachPlan' })!
    expect(free.plan).toBeNull()
    expect(free.exercises.map((row) => row.plan_exercise_id)).toEqual([null])
  })

  it('gives a body the key it was first sent with', () => {
    const tried = reducer(started, { type: 'attempt', body: '{"a":1}', key: 'k1' })!
    expect(keyFor(tried, '{"a":1}')).toBe('k1')
    expect(keyFor(tried, '{"a":2}')).not.toBe('k1')
    expect(reducer(tried, { type: 'attempt', body: '{"a":1}', key: 'k2' })).toBe(tried)
  })
})

describe('the draft store', () => {
  it('writes every change and reads it back in a new store', () => {
    const storage = memory()
    const first = createDraftStore(storage, 'k')
    first.dispatch({ type: 'start', plan: null, now: 'now' })
    first.dispatch({ type: 'details', name: 'Evening' })
    expect(createDraftStore(storage, 'k').get()).toMatchObject({ name: 'Evening' })
    first.dispatch({ type: 'clear' })
    expect(storage.getItem('k')).toBeNull()
  })

  it('keeps working in memory when storage refuses, and says so', () => {
    const storage = { ...memory(), setItem: () => { throw new Error('full') } } as Storage
    const store = createDraftStore(storage, 'k')
    store.dispatch({ type: 'start', plan: null, now: 'now' })
    expect(store.get()).toMatchObject({ name: 'Workout' })
    expect(store.saved()).toBe(false)
    expect(createDraftStore(null, 'k').saved()).toBe(false)
  })

  it('ignores what it did not write', () => {
    expect(parseDraft('not json')).toBeNull()
    expect(parseDraft('{"version":2,"exercises":[],"attempts":[]}')).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})
