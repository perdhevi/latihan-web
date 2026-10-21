import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Field } from '../../shared/ExerciseEditor'
import { UnsavedChanges } from '../../shared/UnsavedChanges'
import { fromLocalInput, toLocalInput } from '../sessions/validate'
import type { MeasurementInput } from './api'
import { metrics, validateMeasurement, type MeasurementDraft } from './model'

/**
 * When, and up to six body measurements; each is optional, at least one is
 * needed. Unsaved changes ask before leaving; the page unmounts the form
 * after a save.
 */
export function MeasurementForm({
  initial,
  submitLabel,
  busy,
  problem,
  onSubmit,
}: {
  initial: MeasurementDraft
  submitLabel: string
  busy: boolean
  problem?: ReactNode
  onSubmit: (measurement: MeasurementInput) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const id = useId()
  const result = validateMeasurement(draft)
  const errors = showErrors && 'errors' in result ? result.errors : {}
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowErrors(true)
    if ('value' in result) onSubmit(result.value)
  }

  return (
    <form className="plan-form" onSubmit={submit} noValidate>
      <Field id={`${id}-when`} label="When" error={errors.measuredAt}>
        <input
          type="datetime-local"
          value={toLocalInput(draft.measuredAt)}
          onChange={(event) => setDraft({ ...draft, measuredAt: fromLocalInput(event.target.value) })}
        />
      </Field>
      <p className="hint">Fill in what you measured; leave the rest empty.</p>
      <div className="metric-fields">
        {metrics.map(({ key, label, unit }) => (
          <Field key={key} id={`${id}-${key}`} label={`${label} (${unit})`} error={errors[key]}>
            <input
              inputMode="decimal"
              value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </Field>
        ))}
      </div>
      {showErrors && 'errors' in result && (
        <p className="error" role="alert">
          {errors.form ?? 'Some fields need fixing; they are marked above.'}
        </p>
      )}
      {problem}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
      <UnsavedChanges dirty={dirty} title="Discard this measurement?" />
    </form>
  )
}
