import { describe, expect, it } from 'vitest'
import { draftFrom, newDraft, validateExercise, type ExerciseValue } from './exercise'

const value = (result: ReturnType<typeof validateExercise>) => ('value' in result ? result.value : result.errors)

describe('exercise drafts', () => {
  it('turn a saved exercise back into the same value, so an untouched plan in use still matches', () => {
    const saved: ExerciseValue[] = [
      { exercise_id: null, name: 'Squat', kind: 'strength', notes: 'slow', sets: [{ repetitions: 5, weight_kg: 62.5 }, { repetitions: 3, weight_kg: 0 }] },
      { exercise_id: null, name: 'Run', kind: 'cardio', notes: '', minutes: 22.5, avg_bpm: 150 },
      { exercise_id: null, name: 'Hips', kind: 'mobility', notes: '', minutes: 5, avg_bpm: null },
    ]
    for (const exercise of saved) expect(value(validateExercise(draftFrom(exercise)))).toEqual(exercise)
  })

  it('read a decimal comma, and trim names and notes', () => {
    const draft = { ...newDraft({ exercise_id: null, name: '  Squat ', kind: 'strength' }), notes: ' ok ' }
    draft.sets = [{ repetitions: '5', weight_kg: '62,5' }]
    expect(value(validateExercise(draft))).toEqual({
      exercise_id: null,
      name: 'Squat',
      kind: 'strength',
      notes: 'ok',
      sets: [{ repetitions: 5, weight_kg: 62.5 }],
    })
  })

  it('send only the fields of the current kind, and keep the others for switching back', () => {
    const draft = { ...newDraft({ exercise_id: null, name: 'Row', kind: 'strength' }), minutes: '12' }
    draft.sets = [{ repetitions: '10', weight_kg: '40' }]
    expect(value(validateExercise({ ...draft, kind: 'cardio' }))).toEqual({
      exercise_id: null,
      name: 'Row',
      kind: 'cardio',
      notes: '',
      minutes: 12,
      avg_bpm: null,
    })
    expect(value(validateExercise(draft))).toMatchObject({ kind: 'strength', sets: [{ repetitions: 10, weight_kg: 40 }] })
  })

  it('hold the contract limits', () => {
    const timed = { ...newDraft({ exercise_id: null, name: 'Run', kind: 'cardio' }) }
    expect(value(validateExercise({ ...timed, minutes: '0' }))).toEqual({ minutes: 'Minutes: more than 0, at most 1440.' })
    expect(value(validateExercise({ ...timed, minutes: '1441' }))).toHaveProperty('minutes')
    expect(value(validateExercise({ ...timed, minutes: '30', avg_bpm: '301' }))).toHaveProperty('avg_bpm')
    expect(value(validateExercise({ ...timed, minutes: '30', avg_bpm: '72.5' }))).toHaveProperty('avg_bpm')

    const strength = newDraft({ exercise_id: null, name: 'Squat', kind: 'strength' })
    expect(value(validateExercise({ ...strength, sets: [] }))).toEqual({ sets: 'Add at least one set.' })
    expect(value(validateExercise({ ...strength, sets: [{ repetitions: '1001', weight_kg: '2000' }] }))).toEqual({
      setErrors: [{ repetitions: 'Reps: a whole number from 1 to 1000.' }],
    })
    expect(value(validateExercise({ ...strength, name: '💪'.repeat(200), sets: [{ repetitions: '1', weight_kg: '0' }] }))).toHaveProperty('kind')
    expect(value(validateExercise({ ...strength, name: 'a'.repeat(201) }))).toHaveProperty('name')
  })
})
