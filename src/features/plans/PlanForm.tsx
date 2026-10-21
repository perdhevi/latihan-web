import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { length, validateExercise, type ExerciseDraft, type ExerciseErrors, type ExerciseValue } from '../../shared/exercise'
import { ExerciseEditor, Field } from '../../shared/ExerciseEditor'
import type { PlanValue } from './api'

export type PlanDraft = { name: string; notes: string; exercises: ExerciseDraft[] }

/** What a submit button asks for: save, or (after plan_in_use) save as a new plan. */
export type Intent = 'save' | 'copy'

type PlanErrors = { name?: string; notes?: string; exercises?: string; rows: (ExerciseErrors | undefined)[] }

// The contract's limits (PlanInput).
const maxName = 200
const maxNotes = 4000

function validatePlan(draft: PlanDraft): { value: PlanValue } | { errors: PlanErrors } {
  const errors: PlanErrors = { rows: [] }
  const name = draft.name.trim()
  if (name === '') errors.name = 'Enter a name for the plan.'
  else if (length(name) > maxName) errors.name = `A plan name has at most ${maxName} characters.`
  if (length(draft.notes.trim()) > maxNotes) errors.notes = `Notes have at most ${maxNotes} characters.`
  if (draft.exercises.length === 0) errors.exercises = 'Add at least one exercise.'

  const exercises: ExerciseValue[] = []
  for (const row of draft.exercises) {
    const result = validateExercise(row)
    if ('errors' in result) errors.rows.push(result.errors)
    else {
      errors.rows.push(undefined)
      exercises.push(result.value)
    }
  }
  const wrong = errors.name ?? errors.notes ?? errors.exercises ?? errors.rows.find((row) => row !== undefined)
  if (wrong !== undefined) return { errors }
  return { value: { name, notes: draft.notes.trim(), exercises } }
}

// The fields that make the plan, without the rows' keys.
const snapshot = (draft: PlanDraft) =>
  JSON.stringify([draft.name, draft.notes, draft.exercises], (field, value: unknown) =>
    field === 'key' ? undefined : value,
  )

/**
 * The plan's name, notes and exercises. Checks them against the contract
 * before `onSubmit` sees them. While there are unsaved changes, leaving the
 * page asks first ("Discard this plan?"), as on mobile; the caller unmounts
 * the form once a save succeeds, which lets the user go.
 *
 * `problem` is shown above the buttons; a submit button inside it with
 * `name="intent"` and `value="copy"` submits the same values as a copy.
 */
export function PlanForm({
  initial,
  submitLabel,
  busy,
  problem,
  onSubmit,
}: {
  initial: PlanDraft
  submitLabel: string
  busy: boolean
  problem?: ReactNode
  onSubmit: (plan: PlanValue, intent: Intent) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [initialSnapshot] = useState(() => snapshot(initial))
  const id = useId()
  const dirty = snapshot(draft) !== initialSnapshot
  const result = validatePlan(draft)
  const errors = showErrors && 'errors' in result ? result.errors : { rows: [] }

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      currentLocation.pathname !== nextLocation.pathname &&
      // Signed out, or the profile is gone: the app is moving the user, and
      // keeping them here would not keep the plan.
      nextLocation.pathname !== '/sign-in' &&
      nextLocation.pathname !== '/welcome',
  )

  useEffect(() => {
    if (!dirty) return
    // Closing the tab or reloading: the browser asks with its own words.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const intent: Intent = submitter instanceof HTMLButtonElement && submitter.value === 'copy' ? 'copy' : 'save'
    setShowErrors(true)
    if ('value' in result) onSubmit(result.value, intent)
  }

  return (
    <form className="plan-form" onSubmit={submit} noValidate>
      <Field id={`${id}-name`} label="Plan name" error={errors.name}>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </Field>
      <Field id={`${id}-notes`} label="Notes (optional)" error={errors.notes}>
        <textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </Field>

      <h2>Exercises</h2>
      <ExerciseEditor
        exercises={draft.exercises}
        errors={errors.rows}
        onChange={(exercises) => setDraft({ ...draft, exercises })}
      />
      {errors.exercises !== undefined && <p className="error">{errors.exercises}</p>}

      {showErrors && 'errors' in result && (
        <p className="error" role="alert">
          Some fields need fixing; they are marked above.
        </p>
      )}
      {problem}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard this plan?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        <p>Unsaved changes will be lost.</p>
      </ConfirmDialog>
    </form>
  )
}
