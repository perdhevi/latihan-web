import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useIdempotencyKeys, type Versioned } from '../../api/concurrency'
import { describeError, isApiError } from '../../api/errors'
import { ChangedElsewhere } from '../../shared/ChangedElsewhere'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { useCreateMeasurement, useDeleteMeasurement, useMeasurement, useUpdateMeasurement, type Measurement } from './api'
import { MeasurementForm } from './MeasurementForm'
import { draftFrom, emptyDraft } from './model'

/** `/profile/measurements/new`. */
export function NewMeasurementPage() {
  const create = useCreateMeasurement()
  // One key per body, as for plans: a retry is replayed, an edit is new.
  const keyFor = useIdempotencyKeys()
  const [initial] = useState(() => emptyDraft(new Date()))
  const [done, setDone] = useState(false)

  if (done) return <Navigate to="/profile" replace />
  return (
    <section>
      <h1>New measurement</h1>
      <MeasurementForm
        initial={initial}
        submitLabel="Save measurement"
        busy={create.isPending}
        problem={
          create.isError && (
            <p className="error" role="alert">
              {describeError(create.error)}
            </p>
          )
        }
        onSubmit={(measurement) =>
          create.mutate({ measurement, idempotencyKey: keyFor(measurement) }, { onSuccess: () => setDone(true) })
        }
      />
    </section>
  )
}

/** `/profile/measurements/:id`: correct or delete one measurement. */
export function MeasurementPage() {
  const { id = '' } = useParams()
  const remove = useDeleteMeasurement(id)
  // Not read again once deleted (see SessionPage).
  const measurement = useMeasurement(id, { enabled: !remove.isSuccess })

  if (remove.isSuccess) return <Navigate to="/profile" replace />
  if (isApiError(measurement.error, 'measurement_not_found') || isApiError(measurement.error, 'invalid_id')) {
    return (
      <section>
        <h1>Measurement not found</h1>
        <p>It may have been deleted on another device.</p>
        <p>
          <Link to="/profile">Back to your profile</Link>
        </p>
      </section>
    )
  }
  if (measurement.data === undefined) {
    if (measurement.isError) throw measurement.error
    return <p className="status">Loading the measurement…</p>
  }
  return <MeasurementEditor key={id} opened={measurement.data} reload={measurement.refetch} remove={remove} />
}

function MeasurementEditor({
  opened,
  reload,
  remove,
}: {
  opened: Versioned<Measurement>
  reload: () => Promise<{ data?: Versioned<Measurement> }>
  remove: ReturnType<typeof useDeleteMeasurement>
}) {
  const id = opened.data.id
  // As for plans: edit the version on screen, not the cache's latest.
  const [base, setBase] = useState(opened)
  const [formVersion, setFormVersion] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [done, setDone] = useState(false)
  const update = useUpdateMeasurement(id)

  if (done) return <Navigate to="/profile" replace />

  async function takeLatest({ keepMine }: { keepMine: boolean }) {
    const latest = (await reload()).data
    if (latest === undefined) return
    setBase(latest)
    if (!keepMine) setFormVersion((version) => version + 1)
    update.reset()
    remove.reset()
  }

  const error = update.error ?? remove.error
  const problem = isApiError(error, 'precondition_failed') ? (
    <ChangedElsewhere
      what="measurement"
      onReload={() => void takeLatest({ keepMine: false })}
      onKeepMine={() => void takeLatest({ keepMine: true })}
    />
  ) : (
    error !== null && (
      <p className="error" role="alert">
        {describeError(error)}
      </p>
    )
  )

  return (
    <section>
      <div className="page-head">
        <h1>Edit measurement</h1>
        <button type="button" className="secondary danger-text" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      </div>
      <MeasurementForm
        key={formVersion}
        initial={draftFrom(base.data)}
        submitLabel="Save measurement"
        busy={update.isPending}
        problem={problem}
        onSubmit={(measurement) => update.mutate({ measurement, etag: base.etag }, { onSuccess: () => setDone(true) })}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete measurement?"
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { etag: base.etag },
            {
              onError: (failure) => {
                // Already gone: what the user wanted. The page leaves on success.
                if (isApiError(failure, 'measurement_not_found')) setDone(true)
                setConfirmDelete(false)
              },
            },
          )
        }
        onCancel={() => setConfirmDelete(false)}
      >
        <p>This cannot be undone.</p>
      </ConfirmDialog>
    </section>
  )
}
