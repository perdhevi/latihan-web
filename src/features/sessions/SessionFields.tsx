import { useId } from 'react'
import { Field } from '../../shared/ExerciseEditor'
import { fromLocalInput, toLocalInput, type SessionErrors } from './validate'

/** A session's name, when it happened, and notes. Controlled. */
export function SessionFields({
  name,
  notes,
  performedAt,
  errors,
  onChange,
}: {
  name: string
  notes: string
  performedAt: string
  errors: SessionErrors
  onChange: (change: { name?: string; notes?: string; performedAt?: string }) => void
}) {
  const id = useId()
  return (
    <>
      <Field id={`${id}-name`} label="Session name" error={errors.name}>
        <input value={name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <Field id={`${id}-when`} label="When" error={errors.performedAt}>
        <input
          type="datetime-local"
          value={toLocalInput(performedAt)}
          // Kept as an ISO time; an untouched field keeps its seconds.
          onChange={(event) => onChange({ performedAt: fromLocalInput(event.target.value) })}
        />
      </Field>
      <Field id={`${id}-notes`} label="Notes (optional)" error={errors.notes}>
        <textarea rows={2} value={notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </Field>
    </>
  )
}
