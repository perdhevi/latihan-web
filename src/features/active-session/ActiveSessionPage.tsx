import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { describeError, isApiError } from '../../api/errors'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { newDraft, summarize } from '../../shared/exercise'
import { ExerciseEditor } from '../../shared/ExerciseEditor'
import { useCreateSession } from '../sessions/api'
import { SessionFields } from '../sessions/SessionFields'
import { validateSession } from '../sessions/validate'
import { useActiveSession } from './context'
import { StartSession } from './StartSession'
import { keyFor, type SessionRow } from './store'

/**
 * The workout being recorded. Every change is kept in this browser at once;
 * nothing reaches the server until Finish.
 */
export function ActiveSessionPage() {
  const { draft, saved, dispatch } = useActiveSession()
  const create = useCreateSession()
  const [showErrors, setShowErrors] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [finished, setFinished] = useState<string | null>(null)

  if (finished !== null) return <Navigate to={`/sessions/${finished}`} replace />

  if (draft === null) {
    return (
      <section>
        <h1>Session</h1>
        <p>No session in progress.</p>
        <StartSession />
      </section>
    )
  }

  const plan = draft.plan
  const result = validateSession({ ...draft, planId: plan?.id ?? null })
  const errors = showErrors && 'errors' in result ? result.errors : { rows: [] }

  function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowErrors(true)
    if (!('value' in result) || draft === null) return
    const session = result.value
    const body = JSON.stringify(session)
    const idempotencyKey = keyFor(draft, body)
    // Stored before it is sent: a reload during the request still knows it.
    dispatch({ type: 'attempt', body, key: idempotencyKey })
    create.mutate(
      { session, idempotencyKey },
      {
        // The draft goes only once the server has the session.
        onSuccess: ({ data }) => {
          dispatch({ type: 'clear' })
          setFinished(data.id)
        },
      },
    )
  }

  const planGone = isApiError(create.error, 'invalid_reference') && plan !== null

  return (
    <section>
      <p className="eyebrow">In progress</p>
      <h1>{draft.name.trim() === '' ? 'Session' : draft.name}</h1>
      <p className="hint">
        {draft.exercises.length === 1 ? '1 activity logged' : `${draft.exercises.length} activities logged`} ·{' '}
        {saved ? 'Saved on this device' : 'Not saved on this device: this browser refuses storage, so keep this tab open'}
      </p>

      <form className="plan-form" onSubmit={finish} noValidate>
        <SessionFields
          name={draft.name}
          notes={draft.notes}
          performedAt={draft.performedAt}
          errors={errors}
          onChange={(change) => dispatch({ type: 'details', ...change })}
        />

        <h2>{plan === null ? 'Plan' : `Plan · ${plan.name}`}</h2>
        {plan === null ? (
          <p className="hint">No plan for this session. Add an activity to train freely.</p>
        ) : (
          <>
            <p className="hint">Targets are a guide. Log your actual results below.</p>
            <ul className="catalog-list targets">
              {plan.exercises.map((target) => {
                const logged = draft.exercises.some((row) => row.plan_exercise_id === target.id)
                return (
                  <li key={target.id} className="target">
                    <span>
                      <span className="name">{target.name}</span>
                      <span className="hint">{summarize(target)}</span>
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={logged ? `${target.name} logged` : `Log ${target.name}`}
                      disabled={logged || draft.exercises.length >= 100}
                      onClick={() => dispatch({ type: 'logTarget', target })}
                    >
                      {logged ? 'Logged' : 'Log'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <h2>Logged activities</h2>
        {draft.exercises.length === 0 && (
          <p className="hint">Nothing logged yet. Choose a planned activity or add your own.</p>
        )}
        <ExerciseEditor<SessionRow>
          exercises={draft.exercises}
          errors={errors.rows}
          onChange={(exercises) => dispatch({ type: 'exercises', exercises })}
          create={(picked) => ({ ...newDraft(picked), plan_exercise_id: null })}
          rowNote={(row) => {
            const target = plan?.exercises.find((entry) => entry.id === row.plan_exercise_id)
            return target === undefined ? null : <p className="hint">Target: {summarize(target)}</p>
          }}
        />
        {errors.exercises !== undefined && <p className="error">{errors.exercises}</p>}

        {showErrors && 'errors' in result && (
          <p className="error" role="alert">
            Some fields need fixing; they are marked above.
          </p>
        )}
        {planGone ? (
          <div className="problem conflict" role="alert">
            <p>The plan this session follows no longer exists, so it cannot be saved against it.</p>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'detachPlan' })
                  create.reset()
                }}
              >
                Keep the activities, without the plan
              </button>
            </div>
          </div>
        ) : (
          create.isError && (
            <p className="error" role="alert">
              {describeError(create.error)} What you logged is still here.
            </p>
          )
        )}
        <div className="actions">
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Finish session'}
          </button>
          <button type="button" className="secondary danger-text" onClick={() => setConfirmDiscard(true)}>
            Discard session
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this session?"
        confirmLabel="Discard"
        cancelLabel="Keep it"
        onConfirm={() => {
          dispatch({ type: 'clear' })
          setConfirmDiscard(false)
        }}
        onCancel={() => setConfirmDiscard(false)}
      >
        <p>What you logged will be lost. Nothing has been saved to your account yet.</p>
      </ConfirmDialog>
    </section>
  )
}
