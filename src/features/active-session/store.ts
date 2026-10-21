import type { components } from '../../api/schema'
import { draftFrom, type ExerciseDraft } from '../../shared/exercise'

type Plan = components['schemas']['Plan']
type PlanExercise = components['schemas']['PlanExercise']

/** A logged activity. `plan_exercise_id` names the target it answers, or null when unplanned. */
export type SessionRow = ExerciseDraft & { plan_exercise_id: string | null }

/**
 * The workout being recorded. The API has no "active session", so until it
 * is finished this lives only in the browser, like on mobile. It is the only
 * state the web client owns.
 */
export type ActiveSession = {
  version: 1
  name: string
  notes: string
  /** When it was started; sent as performed_at. */
  performedAt: string
  /** The plan's targets as they were at the start; null when training freely. */
  plan: { id: string; name: string; exercises: PlanExercise[] } | null
  exercises: SessionRow[]
  /**
   * Every body Finish has sent, with its idempotency key. Kept with the
   * draft, so a retry after a reload sends the same key: the server replays
   * a create it already made instead of making a second session.
   */
  attempts: { body: string; key: string }[]
}

export type Action =
  | { type: 'start'; plan: Plan | null; now: string }
  | { type: 'details'; name?: string; notes?: string; performedAt?: string }
  | { type: 'exercises'; exercises: SessionRow[] }
  | { type: 'logTarget'; target: PlanExercise }
  | { type: 'attempt'; body: string; key: string }
  | { type: 'detachPlan' }
  | { type: 'clear' }

export function reducer(state: ActiveSession | null, action: Action): ActiveSession | null {
  if (action.type === 'start') {
    // One session at a time; a second Start resumes the first.
    if (state !== null) return state
    const plan = action.plan
    return {
      version: 1,
      name: plan?.name ?? 'Workout',
      notes: '',
      performedAt: action.now,
      plan: plan === null ? null : { id: plan.id, name: plan.name, exercises: plan.exercises },
      exercises: [],
      attempts: [],
    }
  }
  if (state === null) return null
  switch (action.type) {
    case 'details':
      return {
        ...state,
        name: action.name ?? state.name,
        notes: action.notes ?? state.notes,
        performedAt: action.performedAt ?? state.performedAt,
      }
    case 'exercises':
      return { ...state, exercises: action.exercises }
    case 'logTarget':
      // The server refuses a plan_exercise_id that repeats: each target is
      // logged once, starting from its planned values.
      if (state.exercises.some((row) => row.plan_exercise_id === action.target.id)) return state
      return {
        ...state,
        exercises: [...state.exercises, { ...draftFrom(action.target), plan_exercise_id: action.target.id }],
      }
    case 'attempt':
      if (state.attempts.some((attempt) => attempt.body === action.body)) return state
      return { ...state, attempts: [...state.attempts, { body: action.body, key: action.key }] }
    case 'detachPlan':
      return {
        ...state,
        plan: null,
        exercises: state.exercises.map((row) => ({ ...row, plan_exercise_id: null })),
      }
    case 'clear':
      return null
  }
}

/** The key Finish sends with `body`: the one it was first sent with, or a new one. */
export function keyFor(state: ActiveSession, body: string): string {
  return state.attempts.find((attempt) => attempt.body === body)?.key ?? crypto.randomUUID()
}

/** A draft from storage, or null when there is none or it is not one we wrote. */
export function parseDraft(text: string | null): ActiveSession | null {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'exercises' in value &&
      Array.isArray(value.exercises) &&
      'attempts' in value &&
      Array.isArray(value.attempts)
    ) {
      return value as ActiveSession
    }
  } catch {
    // Not JSON: someone else's value, or a write cut short.
  }
  return null
}

export type DraftStore = {
  get: () => ActiveSession | null
  /** False when the browser refused the last write (private mode, full storage). */
  saved: () => boolean
  dispatch: (action: Action) => void
  subscribe: (listener: () => void) => () => void
}

/**
 * The draft, mirrored to `storage` under `key` on every change, so it
 * survives a reload or a closed tab. Another tab's change arrives through
 * the `storage` event. With no storage at all the draft lives in memory.
 */
export function createDraftStore(storage: Storage | null, key: string): DraftStore {
  let state = parseDraft(read(storage, key))
  let saved = storage !== null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  function onStorage(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return
    state = parseDraft(read(storage, key))
    notify()
  }

  return {
    get: () => state,
    saved: () => saved,
    dispatch(action) {
      const next = reducer(state, action)
      if (next === state) return
      state = next
      saved = write(storage, key, next)
      notify()
    },
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}

function read(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(storage: Storage | null, key: string, value: ActiveSession | null): boolean {
  if (storage === null) return false
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** localStorage, or null where the browser refuses it. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
