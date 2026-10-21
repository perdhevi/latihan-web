import { Link } from 'react-router'
import { describeError } from '../../api/errors'
import { StartSession } from '../active-session/StartSession'
import { useSessions } from './api'
import { formatWhen } from './format'

/** "Sessions": what the user has done, newest first. */
export function SessionsPage() {
  const sessions = useSessions()
  const items = sessions.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <div className="page-head">
        <h1>Sessions</h1>
        <StartSession />
      </div>

      {sessions.isPending ? (
        <p className="status">Loading your sessions…</p>
      ) : sessions.isError && sessions.data === undefined ? (
        <div className="problem" role="alert">
          <p>{describeError(sessions.error)}</p>
          <button type="button" onClick={() => void sessions.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="status">No completed sessions yet.</p>
      ) : (
        <ul className="catalog-list">
          {items.map((session) => (
            <li key={session.id}>
              <Link className="catalog-item" to={`/sessions/${session.id}`}>
                <span className="name">{session.name}</span>
                <span className="hint">
                  {formatWhen(session.performed_at)} ·{' '}
                  {session.exercises.length === 1 ? '1 activity' : `${session.exercises.length} activities`} ·{' '}
                  {session.plan_id == null ? 'free' : 'from a plan'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sessions.isFetchNextPageError && (
        <p className="error" role="alert">
          {describeError(sessions.error)}
        </p>
      )}
      {sessions.hasNextPage && (
        <button
          type="button"
          className="secondary"
          disabled={sessions.isFetchingNextPage}
          onClick={() => void sessions.fetchNextPage()}
        >
          {sessions.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  )
}
