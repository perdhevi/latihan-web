import { cloneElement, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { categories, categoryLabel, type Category } from '../features/catalog/api'
import { newDraft, type ExerciseDraft, type ExerciseErrors, type PickedExercise } from './exercise'
import { ExercisePicker } from './ExercisePicker'

// The contract's limit on exercises in one plan or session.
const maxExercises = 100

/**
 * The exercises of a plan or a session, edited in place: one group of fields
 * per exercise, shaped by its kind. Strength has sets of reps and weight;
 * every other kind has minutes and an optional average heart rate.
 * Controlled: the caller keeps the drafts and the errors to show.
 *
 * Rows may carry more than a draft (a session's `plan_exercise_id`): edits
 * keep every other field, `create` makes the row for a picked exercise, and
 * `rowNote` adds a line under a row's title.
 */
export function ExerciseEditor<Row extends ExerciseDraft = ExerciseDraft>({
  exercises,
  errors,
  onChange,
  create = newDraft as (picked: PickedExercise) => Row,
  rowNote,
}: {
  exercises: Row[]
  errors: (ExerciseErrors | undefined)[]
  onChange: (exercises: Row[]) => void
  create?: (picked: PickedExercise) => Row
  rowNote?: (row: Row) => ReactNode
}) {
  const [picking, setPicking] = useState(false)

  function update(index: number, draft: ExerciseDraft) {
    // ExerciseRow spreads the row it was given, so the extra fields survive.
    onChange(exercises.map((current, i) => (i === index ? (draft as Row) : current)))
  }

  function move(index: number, by: number) {
    const next = [...exercises]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved)
    onChange(next)
  }

  return (
    <div className="exercise-editor">
      {exercises.map((draft, index) => (
        <ExerciseRow
          key={draft.key}
          index={index}
          draft={draft}
          note={rowNote?.(draft)}
          errors={errors[index]}
          first={index === 0}
          last={index === exercises.length - 1}
          onChange={(next) => update(index, next)}
          onMove={(by) => move(index, by)}
          onRemove={() => onChange(exercises.filter((_, i) => i !== index))}
        />
      ))}

      {picking ? (
        <div className="picker-panel">
          <div className="picker-head">
            <h3>Add exercise</h3>
            <button type="button" className="link" onClick={() => setPicking(false)}>
              Done
            </button>
          </div>
          <ExercisePicker onPick={(picked) => onChange([...exercises, create(picked)])} />
        </div>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={exercises.length >= maxExercises}
          onClick={() => setPicking(true)}
        >
          Add exercise
        </button>
      )}
    </div>
  )
}

function ExerciseRow({
  index,
  draft,
  note,
  errors = {},
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  draft: ExerciseDraft
  note?: ReactNode
  errors?: ExerciseErrors
  first: boolean
  last: boolean
  onChange: (draft: ExerciseDraft) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const id = useId()
  const set = <Field extends keyof ExerciseDraft>(field: Field, value: ExerciseDraft[Field]) =>
    onChange({ ...draft, [field]: value })

  return (
    <fieldset className="exercise-row">
      <legend>Exercise {index + 1}</legend>
      {note}

      <Field id={`${id}-name`} label="Name" error={errors.name}>
        <input value={draft.name} onChange={(event) => set('name', event.target.value)} />
      </Field>

      {draft.exercise_id === null ? (
        <Field id={`${id}-kind`} label="Kind">
          <select value={draft.kind} onChange={(event) => set('kind', event.target.value as Category)}>
            {categories.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        // The server takes the kind from the catalog and refuses another.
        <p className="hint">{categoryLabel(draft.kind)} · from the catalog</p>
      )}

      {draft.kind === 'strength' ? (
        <div className="sets">
          {draft.sets.map((entry, setIndex) => {
            const setErrors = errors.setErrors?.[setIndex] ?? {}
            const changeSet = (field: 'repetitions' | 'weight_kg', value: string) =>
              set(
                'sets',
                draft.sets.map((current, i) => (i === setIndex ? { ...current, [field]: value } : current)),
              )
            return (
              <div key={setIndex} className="set-row" role="group" aria-label={`Set ${setIndex + 1}`}>
                <span className="set-label">Set {setIndex + 1}</span>
                <Field id={`${id}-set${setIndex}-reps`} label="Reps" error={setErrors.repetitions}>
                  <input
                    inputMode="numeric"
                    value={entry.repetitions}
                    onChange={(event) => changeSet('repetitions', event.target.value)}
                  />
                </Field>
                <Field id={`${id}-set${setIndex}-weight`} label="Weight (kg)" error={setErrors.weight_kg}>
                  <input
                    inputMode="decimal"
                    value={entry.weight_kg}
                    onChange={(event) => changeSet('weight_kg', event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="link"
                  aria-label={`Remove set ${setIndex + 1}`}
                  disabled={draft.sets.length === 1}
                  onClick={() => set('sets', draft.sets.filter((_, i) => i !== setIndex))}
                >
                  Remove
                </button>
              </div>
            )
          })}
          {errors.sets !== undefined && <p className="error">{errors.sets}</p>}
          <p className="hint">Use 0 kg for bodyweight.</p>
          <button
            type="button"
            className="secondary"
            disabled={draft.sets.length >= 100}
            // A new set starts as a copy of the last one, as it usually is.
            onClick={() => set('sets', [...draft.sets, { ...draft.sets[draft.sets.length - 1] }])}
          >
            Add set
          </button>
        </div>
      ) : (
        <div className="timed">
          <Field id={`${id}-minutes`} label="Minutes" error={errors.minutes}>
            <input inputMode="decimal" value={draft.minutes} onChange={(event) => set('minutes', event.target.value)} />
          </Field>
          <Field id={`${id}-bpm`} label="Average BPM (optional)" error={errors.avg_bpm}>
            <input inputMode="numeric" value={draft.avg_bpm} onChange={(event) => set('avg_bpm', event.target.value)} />
          </Field>
        </div>
      )}

      <Field id={`${id}-notes`} label="Notes (optional)" error={errors.notes}>
        <input value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>

      <div className="row-actions">
        <button type="button" className="link" disabled={first} onClick={() => onMove(-1)}>
          Move up
        </button>
        <button type="button" className="link" disabled={last} onClick={() => onMove(1)}>
          Move down
        </button>
        <button type="button" className="link danger-text" onClick={onRemove}>
          Remove exercise
        </button>
      </div>
    </fieldset>
  )
}

/** A label, one control, and the message for it when it is wrong. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactElement<InputHTMLAttributes<HTMLElement>>
}) {
  const control = cloneElement(children, {
    id,
    'aria-invalid': error !== undefined || undefined,
    'aria-describedby': error === undefined ? undefined : `${id}-error`,
  })
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {error !== undefined && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  )
}
