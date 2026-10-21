import type { components } from '../api/schema'
import type { Category } from '../features/catalog/api'

type ExerciseSet = components['schemas']['Set']
type TimedKind = Exclude<Category, 'strength'>

/**
 * One exercise of a plan or session, as the API takes it. The contract's
 * `oneOf`: strength has sets and nothing timed; every other kind has minutes
 * and an optional average heart rate, and no sets.
 */
export type ExerciseValue =
  | { exercise_id: string | null; name: string; kind: 'strength'; notes: string; sets: ExerciseSet[] }
  | { exercise_id: string | null; name: string; kind: TimedKind; notes: string; minutes: number; avg_bpm: number | null }

/**
 * What a plan or session row starts from. A catalog entry sets `exercise_id`
 * (the server keeps the link); a free-form exercise has `exercise_id: null`.
 */
export type PickedExercise = { exercise_id: string | null; name: string; kind: Category }

/**
 * An exercise being edited. Numbers are kept as typed, so "62," or "" can be
 * shown and corrected; both the strength and the timed fields are kept, so
 * switching the kind back and forth loses nothing. `key` identifies the row
 * while it is moved around.
 */
export type ExerciseDraft = {
  key: string
  exercise_id: string | null
  name: string
  kind: Category
  notes: string
  sets: SetDraft[]
  minutes: string
  avg_bpm: string
}
export type SetDraft = { repetitions: string; weight_kg: string }

export type SetErrors = { repetitions?: string; weight_kg?: string }
export type ExerciseErrors = {
  name?: string
  notes?: string
  sets?: string
  setErrors?: SetErrors[]
  minutes?: string
  avg_bpm?: string
}

// The contract's limits (ExerciseInput, Set).
const maxName = 200
const maxNotes = 1000
const maxSets = 100

const blankSet: SetDraft = { repetitions: '', weight_kg: '' }

/** A row for a newly picked exercise: one empty set, or empty minutes. */
export function newDraft(picked: PickedExercise): ExerciseDraft {
  return { key: crypto.randomUUID(), ...picked, notes: '', sets: [blankSet], minutes: '', avg_bpm: '' }
}

/** A row for an exercise the API returned. */
export function draftFrom(exercise: {
  exercise_id?: string | null
  name: string
  kind: Category
  notes: string
  sets?: ExerciseSet[] | null
  minutes?: number | null
  avg_bpm?: number | null
}): ExerciseDraft {
  const sets = (exercise.sets ?? []).map((set) => ({
    repetitions: String(set.repetitions),
    weight_kg: String(set.weight_kg),
  }))
  return {
    key: crypto.randomUUID(),
    exercise_id: exercise.exercise_id ?? null,
    name: exercise.name,
    kind: exercise.kind,
    notes: exercise.notes,
    sets: sets.length === 0 ? [blankSet] : sets,
    minutes: exercise.minutes == null ? '' : String(exercise.minutes),
    avg_bpm: exercise.avg_bpm == null ? '' : String(exercise.avg_bpm),
  }
}

/** Unicode code points, as the server counts. */
export const length = (text: string) => [...text].length

/** Returns the message to show, or null when the name may be used. */
export function checkExerciseName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Enter a name for the exercise.'
  if (length(trimmed) > maxName) return `An exercise name has at most ${maxName} characters.`
  return null
}

/** A whole number as typed, or NaN. */
function parseWhole(text: string): number {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN
}

/** A decimal as typed, with a point or a comma ("62,5"), or NaN. */
function parseDecimal(text: string): number {
  const normal = text.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN
}

/**
 * Checks one row against the contract. Returns the value to send, or the
 * message for each field that is wrong.
 */
export function validateExercise(draft: ExerciseDraft): { value: ExerciseValue } | { errors: ExerciseErrors } {
  const errors: ExerciseErrors = {}
  const name = draft.name.trim()
  const nameProblem = checkExerciseName(name)
  if (nameProblem !== null) errors.name = nameProblem
  if (length(draft.notes.trim()) > maxNotes) errors.notes = `Notes have at most ${maxNotes} characters.`
  const base = { exercise_id: draft.exercise_id, name, notes: draft.notes.trim() }

  if (draft.kind === 'strength') {
    if (draft.sets.length === 0) errors.sets = 'Add at least one set.'
    if (draft.sets.length > maxSets) errors.sets = `A strength exercise has at most ${maxSets} sets.`
    const sets: ExerciseSet[] = []
    const setErrors = draft.sets.map((set) => {
      const problems: SetErrors = {}
      const repetitions = parseWhole(set.repetitions)
      const weight = parseDecimal(set.weight_kg)
      if (!(repetitions >= 1 && repetitions <= 1000)) problems.repetitions = 'Reps: a whole number from 1 to 1000.'
      if (!(weight >= 0 && weight <= 2000)) problems.weight_kg = 'Weight: 0 to 2000 kg, 0 for bodyweight.'
      sets.push({ repetitions, weight_kg: weight })
      return problems
    })
    if (setErrors.some((problems) => Object.keys(problems).length > 0)) errors.setErrors = setErrors
    if (Object.keys(errors).length > 0) return { errors }
    return { value: { ...base, kind: 'strength', sets } }
  }

  const minutes = parseDecimal(draft.minutes)
  if (!(minutes > 0 && minutes <= 1440)) errors.minutes = 'Minutes: more than 0, at most 1440.'
  const bpm = draft.avg_bpm.trim() === '' ? null : parseWhole(draft.avg_bpm)
  if (bpm !== null && !(bpm >= 1 && bpm <= 300)) errors.avg_bpm = 'Average BPM: a whole number from 1 to 300, or empty.'
  if (Object.keys(errors).length > 0) return { errors }
  return { value: { ...base, kind: draft.kind, minutes, avg_bpm: bpm } }
}

/** One line about a saved exercise: "3 sets · 10 × 60 kg" or "30 min · 140 bpm". */
export function summarize(exercise: ExerciseValue | Parameters<typeof draftFrom>[0]): string {
  if (exercise.kind === 'strength') {
    const sets = ('sets' in exercise ? exercise.sets : null) ?? []
    const first = sets[0]
    const count = sets.length === 1 ? '1 set' : `${sets.length} sets`
    return first === undefined ? count : `${count} · ${first.repetitions} × ${first.weight_kg} kg`
  }
  const minutes = 'minutes' in exercise ? exercise.minutes : null
  const bpm = 'avg_bpm' in exercise ? exercise.avg_bpm : null
  return bpm == null ? `${minutes} min` : `${minutes} min · ${bpm} bpm`
}
