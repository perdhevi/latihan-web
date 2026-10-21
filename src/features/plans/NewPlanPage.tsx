import { useState } from 'react'
import { Navigate } from 'react-router'
import { useIdempotencyKeys } from '../../api/concurrency'
import { describeError } from '../../api/errors'
import { useCreatePlan } from './api'
import { PlanForm } from './PlanForm'

/** "New plan". Back to the list once it is saved. */
export function NewPlanPage() {
  const create = useCreatePlan()
  // One key per body: a retry of the same plan is replayed, an edited plan
  // is a new request.
  const keyFor = useIdempotencyKeys()
  const [done, setDone] = useState(false)

  // Unmounting the form lifts its unsaved-changes guard.
  if (done) return <Navigate to="/plans" replace />

  return (
    <section>
      <h1>New plan</h1>
      <PlanForm
        initial={{ name: '', notes: '', exercises: [] }}
        submitLabel="Save plan"
        busy={create.isPending}
        problem={
          create.isError && (
            <p className="error" role="alert">
              {describeError(create.error)}
            </p>
          )
        }
        onSubmit={(plan) =>
          create.mutate({ plan, idempotencyKey: keyFor(plan) }, { onSuccess: () => setDone(true) })
        }
      />
    </section>
  )
}
