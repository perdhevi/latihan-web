import { length, validateExercise, type ExerciseErrors } from '../../shared/exercise'
import type { SessionRow } from '../active-session/store'
import type { SessionValue } from './api'

export type SessionDraft = {
  name: string
  notes: string
  performedAt: string
  planId: string | null
  exercises: SessionRow[]
}

export type SessionErrors = {
  name?: string
  notes?: string
  performedAt?: string
  exercises?: string
  rows: (ExerciseErrors | undefined)[]
}

// The contract's limits (SessionInput).
const maxName = 200
const maxNotes = 4000

/** Checks a session against the contract: the value to send, or the message for each wrong field. */
export function validateSession(draft: SessionDraft): { value: SessionValue } | { errors: SessionErrors } {
  const errors: SessionErrors = { rows: [] }
  const name = draft.name.trim()
  if (name === '') errors.name = 'Enter a name for the session.'
  else if (length(name) > maxName) errors.name = `A session name has at most ${maxName} characters.`
  if (length(draft.notes.trim()) > maxNotes) errors.notes = `Notes have at most ${maxNotes} characters.`
  if (Number.isNaN(Date.parse(draft.performedAt))) errors.performedAt = 'Enter when you trained.'
  if (draft.exercises.length === 0) errors.exercises = 'Log at least one activity.'

  const exercises: SessionValue['exercises'] = []
  for (const row of draft.exercises) {
    const result = validateExercise(row)
    if ('errors' in result) errors.rows.push(result.errors)
    else {
      errors.rows.push(undefined)
      exercises.push({ ...result.value, plan_exercise_id: row.plan_exercise_id })
    }
  }
  const wrong =
    errors.name ?? errors.notes ?? errors.performedAt ?? errors.exercises ?? errors.rows.find((row) => row !== undefined)
  if (wrong !== undefined) return { errors }
  return {
    value: {
      name,
      notes: draft.notes.trim(),
      performed_at: new Date(draft.performedAt).toISOString(),
      plan_id: draft.planId,
      exercises,
    },
  }
}

/** An ISO time as a datetime-local input shows it, in this browser's time zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** A datetime-local value (local time, no zone) as an ISO time, or '' when it is incomplete. */
export function fromLocalInput(value: string): string {
  const date = new Date(value)
  return value === '' || Number.isNaN(date.getTime()) ? '' : date.toISOString()
}
