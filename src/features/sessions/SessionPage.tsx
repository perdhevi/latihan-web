import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { describeError, isApiError } from '../../api/errors'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { ExerciseCard } from '../../shared/ExerciseCard'
import { summarize } from '../../shared/exercise'
import { categoryLabel } from '../catalog/api'
import { useComparison, useDeleteSession, useSession, type ExerciseComparison, type Session } from './api'
import { formatDelta, formatNumber, formatSet, formatWhen, missing } from './format'

/** `/sessions/:id`: what was done, next to what was planned. */
export function SessionPage() {
  const { id = '' } = useParams()
  const remove = useDeleteSession(id)
  // Deleting removes it from the cache while this page still shows it;
  // reading it again then would only find it gone.
  const session = useSession(id, { enabled: !remove.isSuccess })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleted, setDeleted] = useState(false)

  if (deleted) return <Navigate to="/sessions" replace />
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
  if (session.data === undefined) {
    if (session.isError) throw session.error
    return <p className="status">Loading the session…</p>
  }

  const { data, etag } = session.data

  function deleteSession() {
    // The version on screen: there is no form here, so what is shown is the
    // latest this page has read, and that is what the user agreed to delete.
    remove.mutate(
      { etag },
      {
        onSuccess: () => setDeleted(true),
        onError: (error) => {
          if (isApiError(error, 'session_not_found')) setDeleted(true)
          else if (isApiError(error, 'precondition_failed')) void session.refetch()
          setConfirmDelete(false)
        },
      },
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{data.name}</h1>
          <p className="hint">{formatWhen(data.performed_at)}</p>
        </div>
        <div className="actions">
          <Link className="button secondary" to={`/sessions/${data.id}/edit`}>
            Edit
          </Link>
          <button type="button" className="secondary danger-text" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>
      </div>
      {data.notes !== '' && <p className="description">{data.notes}</p>}
      {isApiError(remove.error, 'precondition_failed') ? (
        <p className="error" role="alert">
          This session changed on another device. It is shown as it is now; delete it again if you still want to.
        </p>
      ) : (
        remove.isError &&
        !isApiError(remove.error, 'session_not_found') && (
          <p className="error" role="alert">
            {describeError(remove.error)}
          </p>
        )
      )}

      {data.plan_id == null ? (
        <>
          <p className="hint">Trained freely, without a plan.</p>
          <Activities session={data} />
        </>
      ) : (
        <PlannedVersusDone session={data} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this session?"
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={deleteSession}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>This cannot be undone. Its plan is kept.</p>
      </ConfirmDialog>
    </section>
  )
}

/** The activities as logged, for a session without a plan or without its comparison. */
function Activities({ session }: { session: Session }) {
  return (
    <div className="comparison">
      {session.exercises.map((exercise, index) => (
        <ExerciseCard
          key={index}
          className="compare-card"
          title={exercise.name}
          summary={`${categoryLabel(exercise.kind)} · ${summarize(exercise)}`}
        >
          {exercise.kind === 'strength' ? (
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Set</th>
                  <th scope="col">Done</th>
                </tr>
              </thead>
              <tbody>
                {(exercise.sets ?? []).map((set, n) => (
                  <tr key={n}>
                    <th scope="row">{n + 1}</th>
                    <td>{formatSet(set)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              {formatNumber(exercise.minutes)} min
              {exercise.avg_bpm != null && ` · ${exercise.avg_bpm} bpm`}
            </p>
          )}
          {exercise.notes !== '' && <p className="hint">{exercise.notes}</p>}
        </ExerciseCard>
      ))}
    </div>
  )
}

const statusLabel: Record<ExerciseComparison['status'], string> = {
  matched: 'Planned and logged',
  missed: 'Planned but not logged',
  unplanned: 'Not in the plan',
}

function PlannedVersusDone({ session }: { session: Session }) {
  const comparison = useComparison(session)

  if (comparison.isPending) return <p className="status">Loading the comparison with the plan…</p>
  if (comparison.isError) {
    const gone = isApiError(comparison.error, 'comparison_not_found') || isApiError(comparison.error, 'plan_not_found')
    return (
      <>
        <div className="problem" role={gone ? undefined : 'alert'}>
          <p className={gone ? 'hint' : undefined}>
            {gone
              ? 'The comparison with its plan is not available.'
              : `The comparison with its plan could not be loaded: ${describeError(comparison.error)}`}
          </p>
          {!gone && (
            <button type="button" onClick={() => void comparison.refetch()}>
              Try again
            </button>
          )}
        </div>
        <Activities session={session} />
      </>
    )
  }

  const { data } = comparison
  const planned = data.exercises.filter((entry) => entry.status !== 'unplanned')
  const logged = planned.filter((entry) => entry.status === 'matched').length
  const extra = data.exercises.length - planned.length

  return (
    <>
      <h2>Planned versus done</h2>
      <p className="hint">
        {logged} of {planned.length} planned {planned.length === 1 ? 'exercise' : 'exercises'} logged
        {extra > 0 && ` · ${extra} not in the plan`}. Differences are what you did minus what was planned.
      </p>
      <table className="compare totals">
        <caption>Totals</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Planned</th>
            <th scope="col">Done</th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['Sets', 'sets', ''],
              ['Reps', 'repetitions', ''],
              ['Volume', 'volume_kg', 'kg'],
              ['Minutes', 'minutes', 'min'],
            ] as const
          ).map(([label, field, unit]) => (
            <tr key={field}>
              <th scope="row">{label}</th>
              <td>{formatNumber(data.planned_totals[field])}</td>
              <td>{formatNumber(data.actual_totals[field])}</td>
              <td>{formatDelta(data.delta[field], unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="comparison">
        {data.exercises.map((entry, index) => (
          <ComparisonCard key={entry.plan_exercise_id ?? `extra-${index}`} entry={entry} />
        ))}
      </div>
    </>
  )
}

function ComparisonCard({ entry }: { entry: ExerciseComparison }) {
  const shown = entry.actual ?? entry.planned
  const kind = shown?.kind ?? 'strength'
  return (
    <ExerciseCard
      className={`compare-card ${entry.status}`}
      eyebrow={statusLabel[entry.status]}
      title={shown?.name}
      summary={
        (entry.actual === null ? 'Not logged' : `Done: ${summarize(entry.actual)}`) +
        (entry.planned === null ? '' : ` · Planned: ${summarize(entry.planned)}`)
      }
    >
      {kind === 'strength' ? (
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Set</th>
              <th scope="col">Planned</th>
              <th scope="col">Done</th>
              <th scope="col">Reps ±</th>
              <th scope="col">Weight ±</th>
            </tr>
          </thead>
          <tbody>
            {entry.sets.map((set) => (
              <tr key={set.number}>
                <th scope="row">{set.number}</th>
                <td>{formatSet(set.planned)}</td>
                <td>{formatSet(set.actual)}</td>
                <td>{formatDelta(set.repetitions_delta)}</td>
                <td>{formatDelta(set.weight_kg_delta, 'kg')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="compare">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Planned</th>
              <th scope="col">Done</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Minutes</th>
              <td>{formatNumber(entry.planned?.minutes)}</td>
              <td>{formatNumber(entry.actual?.minutes)}</td>
              {/* Only when both were recorded: a skipped run is not "−20 min" of running done. */}
              <td>
                {entry.status === 'matched' ? formatDelta(entry.delta.minutes, 'min') : missing}
              </td>
            </tr>
            <tr>
              <th scope="row">Average BPM</th>
              <td>{formatNumber(entry.planned?.avg_bpm)}</td>
              <td>{formatNumber(entry.actual?.avg_bpm)}</td>
              <td>{formatDelta(entry.avg_bpm_delta)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {entry.actual?.notes ? <p className="hint">{entry.actual.notes}</p> : null}
    </ExerciseCard>
  )
}
