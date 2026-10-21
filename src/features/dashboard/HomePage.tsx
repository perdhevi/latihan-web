import { useState } from 'react'
import { Link } from 'react-router'
import { describeError } from '../../api/errors'
import { StartSession } from '../active-session/StartSession'
import { useMe } from '../profile/api'
import { useSessions } from '../sessions/api'
import { formatWhen } from '../sessions/format'
import { CompletionChart } from './CompletionChart'
import { ThisWeek } from './ThisWeek'

/** Home: this week, the way in to a workout, what was done lately, and progress. */
export function HomePage() {
  const me = useMe()
  // Fixed for the page's life, so "this week" does not move under the user.
  const [now] = useState(() => new Date())
  return (
    <section className="home">
      <h1>Hi, {me.data?.display_name}</h1>
      {/* Not a <p>: the start dialog inside holds headings and blocks. */}
      <div className="actions">
        <StartSession />
      </div>
      <ThisWeek now={now} />
      <RecentSessions />
      <CompletionChart now={now} />
    </section>
  )
}

function RecentSessions() {
  // The first page of the Sessions list: one cache for both pages.
  const sessions = useSessions()
  const recent = sessions.data?.pages[0]?.items.slice(0, 3) ?? []
  return (
    <section aria-labelledby="recent-title">
      <div className="page-head">
        <h2 id="recent-title">Recent sessions</h2>
        <Link to="/sessions">All sessions</Link>
      </div>
      {sessions.isPending ? (
        <p className="status">Loading your sessions…</p>
      ) : sessions.isError ? (
        <p className="error" role="alert">
          {describeError(sessions.error)}
        </p>
      ) : recent.length === 0 ? (
        <p className="hint">Your completed sessions will appear here.</p>
      ) : (
        <ul className="catalog-list">
          {recent.map((session) => (
            <li key={session.id}>
              <Link className="catalog-item" to={`/sessions/${session.id}`}>
                <span className="name">{session.name}</span>
                <span className="hint">
                  {formatWhen(session.performed_at)} ·{' '}
                  {session.exercises.length === 1 ? '1 activity' : `${session.exercises.length} activities`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
