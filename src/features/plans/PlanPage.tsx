import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useIdempotencyKeys, type Versioned } from '../../api/concurrency'
import { describeError, isApiError } from '../../api/errors'
import { ChangedElsewhere } from '../../shared/ChangedElsewhere'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { draftFrom } from '../../shared/exercise'
import { useCreatePlan, useDeletePlan, usePlan, useUpdatePlan, type Plan, type PlanValue } from './api'
import { PlanForm, type Intent } from './PlanForm'

/** `/plans/:id`: edit or delete one plan. */
export function PlanPage() {
  const { id = '' } = useParams()
  const plan = usePlan(id)

  if (isApiError(plan.error, 'plan_not_found') || isApiError(plan.error, 'invalid_id')) {
    return (
      <section>
        <h1>Plan not found</h1>
        <p>It may have been deleted on another device.</p>
        <p>
          <Link to="/plans">Back to your plans</Link>
        </p>
      </section>
    )
  }
  // The editor works on the version it was opened with; see PlanEditor.
  if (plan.data !== undefined) return <PlanEditor key={id} opened={plan.data} reload={plan.refetch} />
  if (plan.isError) throw plan.error
  return <p className="status">Loading the plan…</p>
}

const draftOf = (plan: Plan) => ({ name: plan.name, notes: plan.notes, exercises: plan.exercises.map(draftFrom) })

function PlanEditor({
  opened,
  reload,
}: {
  opened: Versioned<Plan>
  reload: () => Promise<{ data?: Versioned<Plan> }>
}) {
  const id = opened.data.id
  // The version the user is editing. Not the cache's latest: a background
  // refetch must not quietly move the If-Match forward, or a save would
  // overwrite changes the user never saw.
  const [base, setBase] = useState(opened)
  // Changing it remounts the form with the base's values ("Reload").
  const [formVersion, setFormVersion] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [done, setDone] = useState(false)
  const update = useUpdatePlan(id)
  const copy = useCreatePlan()
  const remove = useDeletePlan(id)
  const keyFor = useIdempotencyKeys()

  if (done) return <Navigate to="/plans" replace />

  function save(plan: PlanValue, intent: Intent) {
    const onSuccess = () => setDone(true)
    if (intent === 'copy') {
      copy.mutate({ plan, idempotencyKey: keyFor(plan) }, { onSuccess })
    } else {
      copy.reset()
      update.mutate({ plan, etag: base.etag }, { onSuccess })
    }
  }

  async function takeLatest({ keepMine }: { keepMine: boolean }) {
    const latest = (await reload()).data
    if (latest === undefined) return
    setBase(latest)
    if (!keepMine) setFormVersion((version) => version + 1)
    update.reset()
    remove.reset()
  }

  function deletePlan() {
    remove.mutate(
      { etag: base.etag },
      {
        onSuccess: () => setDone(true),
        onError: (error) => {
          // Already gone, which is what the user wanted.
          if (isApiError(error, 'plan_not_found')) setDone(true)
          setConfirmDelete(false)
        },
      },
    )
  }

  const error = copy.error ?? update.error ?? remove.error
  let problem = null
  if (isApiError(error, 'precondition_failed')) {
    problem = (
      <ChangedElsewhere
        what="plan"
        onReload={() => void takeLatest({ keepMine: false })}
        onKeepMine={() => void takeLatest({ keepMine: true })}
      />
    )
  } else if (isApiError(error, 'plan_in_use') || (isApiError(error, 'plan_not_found') && error === update.error)) {
    problem = (
      <div className="problem conflict" role="alert">
        <p>
          {isApiError(error, 'plan_in_use')
            ? "Sessions already use this plan's targets, so its exercises cannot change. Renaming it still works."
            : 'This plan was deleted on another device.'}
        </p>
        <div className="actions">
          <button type="submit" name="intent" value="copy" disabled={copy.isPending}>
            {copy.isPending ? 'Saving…' : 'Save as new plan'}
          </button>
        </div>
      </div>
    )
  } else if (isApiError(error, 'resource_in_use')) {
    problem = (
      <p className="error" role="alert">
        Sessions use this plan, so it was not deleted. Delete those sessions first, or keep the plan.
      </p>
    )
  } else if (error !== null) {
    problem = (
      <p className="error" role="alert">
        {describeError(error)}
      </p>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>{base.data.name}</h1>
        <button type="button" className="secondary danger-text" onClick={() => setConfirmDelete(true)}>
          Delete plan
        </button>
      </div>
      <PlanForm
        key={formVersion}
        initial={draftOf(base.data)}
        submitLabel="Save plan"
        busy={update.isPending || copy.isPending}
        problem={problem}
        onSubmit={save}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this plan?"
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={deletePlan}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>This cannot be undone. A plan that sessions use cannot be deleted.</p>
      </ConfirmDialog>
    </section>
  )
}
