import { Link } from 'react-router'
import { describeError } from '../../api/errors'
import { usePlans } from './api'

/** "Plans": the user's training plans, newest first. */
export function PlansPage() {
  const plans = usePlans()
  const items = plans.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <div className="page-head">
        <h1>Plans</h1>
        <Link className="button" to="/plans/new">
          New plan
        </Link>
      </div>

      {plans.isPending ? (
        <p className="status">Loading your plans…</p>
      ) : plans.isError && plans.data === undefined ? (
        <div className="problem" role="alert">
          <p>{describeError(plans.error)}</p>
          <button type="button" onClick={() => void plans.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="status">No plans yet. Create your first training plan.</p>
      ) : (
        <ul className="catalog-list">
          {items.map((plan) => (
            <li key={plan.id}>
              <Link className="catalog-item" to={`/plans/${plan.id}`}>
                <span className="name">{plan.name}</span>
                <span className="hint">
                  {plan.exercises.length === 1 ? '1 exercise' : `${plan.exercises.length} exercises`} ·{' '}
                  {plan.exercises.map((exercise) => exercise.name).join(', ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {plans.isFetchNextPageError && (
        <p className="error" role="alert">
          {describeError(plans.error)}
        </p>
      )}
      {plans.hasNextPage && (
        <button
          type="button"
          className="secondary"
          disabled={plans.isFetchingNextPage}
          onClick={() => void plans.fetchNextPage()}
        >
          {plans.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  )
}
