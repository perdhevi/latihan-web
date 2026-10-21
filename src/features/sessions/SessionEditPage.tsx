import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { Versioned } from '../../api/concurrency'
import { describeError, isApiError } from '../../api/errors'
import { ChangedElsewhere } from '../../shared/ChangedElsewhere'
import { draftFrom, newDraft } from '../../shared/exercise'
import { ExerciseEditor } from '../../shared/ExerciseEditor'
import { UnsavedChanges } from '../../shared/UnsavedChanges'
import type { SessionRow } from '../active-session/store'
import { useSession, useUpdateSession, type Session } from './api'
import { SessionFields } from './SessionFields'
import { validateSession, type SessionDraft } from './validate'

/** `/sessions/:id/edit`: correct a saved session. */
export function SessionEditPage() {
  const { id = '' } = useParams()
  const session = useSession(id)

  if (isApiError(session.error, 'session_not_found') || isApiError(session.error, 'invalid_id')) {
    return (
      <section>
        <h1>Session not found</h1>
        <p>It may have been deleted on another device.</p>
        <p>
          <Link to="/sessions">Back to your sessions</Link>
        </p>
      </section>
    )
  }
  if (session.data !== undefined) return <SessionEditor key={id} opened={session.data} reload={session.refetch} />
  if (session.isError) throw session.error
  return <p className="status">Loading the session…</p>
}

const draftOf = (session: Session): SessionDraft => ({
  name: session.name,
  notes: session.notes,
  performedAt: session.performed_at,
  planId: session.plan_id ?? null,
  exercises: session.exercises.map((exercise) => ({
    ...draftFrom(exercise),
    plan_exercise_id: exercise.plan_exercise_id ?? null,
  })),
})

// The fields that make the session, without the rows' keys.
const snapshot = (draft: SessionDraft) =>
  JSON.stringify(draft, (field, value: unknown) => (field === 'key' ? undefined : value))

function SessionEditor({
  opened,
  reload,
}: {
  opened: Versioned<Session>
  reload: () => Promise<{ data?: Versioned<Session> }>
}) {
  const id = opened.data.id
  // As for plans: the version on screen, not the cache's latest.
  const [base, setBase] = useState(opened)
  const [draft, setDraft] = useState(() => draftOf(opened.data))
  const [initial, setInitial] = useState(() => snapshot(draft))
  const [showErrors, setShowErrors] = useState(false)
  const [done, setDone] = useState(false)
  const update = useUpdateSession(id)

  if (done) return <Navigate to={`/sessions/${id}`} replace />

  const result = validateSession(draft)
  const errors = showErrors && 'errors' in result ? result.errors : { rows: [] }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowErrors(true)
    if ('value' in result) update.mutate({ session: result.value, etag: base.etag }, { onSuccess: () => setDone(true) })
  }

  async function takeLatest({ keepMine }: { keepMine: boolean }) {
    const latest = (await reload()).data
    if (latest === undefined) return
    setBase(latest)
    if (!keepMine) {
      const fresh = draftOf(latest.data)
      setDraft(fresh)
      setInitial(snapshot(fresh))
    }
    update.reset()
  }

  return (
    <section>
      <h1>Edit session</h1>
      <form className="plan-form" onSubmit={save} noValidate>
        <SessionFields
          name={draft.name}
          notes={draft.notes}
          performedAt={draft.performedAt}
          errors={errors}
          onChange={(change) => setDraft({ ...draft, ...change })}
        />
        <h2>Activities</h2>
        {draft.planId !== null && (
          <p className="hint">Activities marked as planned stay linked to their targets.</p>
        )}
        <ExerciseEditor<SessionRow>
          exercises={draft.exercises}
          errors={errors.rows}
          onChange={(exercises) => setDraft({ ...draft, exercises })}
          create={(picked) => ({ ...newDraft(picked), plan_exercise_id: null })}
          rowNote={(row) => (row.plan_exercise_id === null ? null : <p className="hint">Planned</p>)}
        />
        {errors.exercises !== undefined && <p className="error">{errors.exercises}</p>}

        {showErrors && 'errors' in result && (
          <p className="error" role="alert">
            Some fields need fixing; they are marked above.
          </p>
        )}
        {isApiError(update.error, 'precondition_failed') ? (
          <ChangedElsewhere
            what="session"
            onReload={() => void takeLatest({ keepMine: false })}
            onKeepMine={() => void takeLatest({ keepMine: true })}
          />
        ) : (
          update.isError && (
            <p className="error" role="alert">
              {describeError(update.error)}
            </p>
          )
        )}
        <div className="actions">
          <button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save session'}
          </button>
          <Link className="button secondary" to={`/sessions/${id}`}>
            Cancel
          </Link>
        </div>
        <UnsavedChanges dirty={snapshot(draft) !== initial} title="Discard these changes?" />
      </form>
    </section>
  )
}
