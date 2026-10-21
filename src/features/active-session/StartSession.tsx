import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { describeError } from '../../api/errors'
import { Modal } from '../../shared/ConfirmDialog'
import { usePlans, type Plan } from '../plans/api'
import { useActiveSession } from './context'

/**
 * "Start a new session", or "Resume active session" while one is in
 * progress. Starting asks which plan to train against, as on mobile.
 */
export function StartSession() {
  const { draft, dispatch } = useActiveSession()
  const [choosing, setChoosing] = useState(false)
  const navigate = useNavigate()

  if (draft !== null) {
    return (
      <Link className="button" to="/session/active">
        Resume active session
      </Link>
    )
  }

  function start(plan: Plan | null) {
    dispatch({ type: 'start', plan, now: new Date().toISOString() })
    setChoosing(false)
    navigate('/session/active')
  }

  return (
    <>
      <button type="button" onClick={() => setChoosing(true)}>
        Start a new session
      </button>
      <Modal open={choosing} title="Start from a plan?" onClose={() => setChoosing(false)}>
        {choosing && <PlanChoices onChoose={start} />}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setChoosing(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  )
}

/** The user's plans, then "No plan, train freely". Mounted only while the dialog is open. */
function PlanChoices({ onChoose }: { onChoose: (plan: Plan | null) => void }) {
  const plans = usePlans()
  const items = plans.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="choices">
      {plans.isPending && <p className="hint">Loading your plans…</p>}
      {plans.isError && plans.data === undefined && (
        <p className="error" role="alert">
          Your plans could not be loaded: {describeError(plans.error)} You can still train freely.
        </p>
      )}
      {items.map((plan) => (
        <button key={plan.id} type="button" className="choice" onClick={() => onChoose(plan)}>
          <span className="name">{plan.name}</span>
          <span className="hint">
            {plan.exercises.length === 1 ? '1 exercise' : `${plan.exercises.length} exercises`}
          </span>
        </button>
      ))}
      {plans.hasNextPage && (
        <button type="button" className="link" disabled={plans.isFetchingNextPage} onClick={() => void plans.fetchNextPage()}>
          More plans
        </button>
      )}
      <button type="button" className="choice" onClick={() => onChoose(null)}>
        <span className="name">No plan, train freely</span>
      </button>
    </div>
  )
}
