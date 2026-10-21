import { describeError } from '../../api/errors'
import { formatNumber } from '../sessions/format'
import { addDays, useProgress, weekStart, type ProgressPoint } from './api'

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' })
const dateLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', timeZone: 'UTC' })

/**
 * Sessions, sets and minutes this week, and which days had a session. One
 * request, by day: the card adds up the server's daily totals, and the strip
 * shows them. Days are UTC days, as the server counts them.
 */
export function ThisWeek({ now }: { now: Date }) {
  const monday = weekStart(now)
  const progress = useProgress('day', monday, addDays(monday, 7))

  if (progress.isPending) return <p className="status">Loading this week…</p>
  if (progress.isError) {
    return (
      <div className="problem" role="alert">
        <p>This week's totals could not be loaded: {describeError(progress.error)}</p>
        <button type="button" onClick={() => void progress.refetch()}>
          Try again
        </button>
      </div>
    )
  }

  // Days without a session are not in the answer: they count as nothing done.
  const points = progress.data.data
  const byDay = new Map(points.map((point) => [point.bucket.slice(0, 10), point]))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const sum = (pick: (point: ProgressPoint) => number) => points.reduce((total, point) => total + pick(point), 0)
  const sessions = sum((point) => point.sessions)
  const today = now.toISOString().slice(0, 10)

  return (
    <section className="week-card" aria-labelledby="this-week">
      <h2 id="this-week">This week</h2>
      <dl className="tiles">
        <div>
          <dt>Sessions</dt>
          <dd>{formatNumber(sessions)}</dd>
        </div>
        <div>
          <dt>Sets logged</dt>
          <dd>{formatNumber(sum((point) => point.actual.sets))}</dd>
        </div>
        <div>
          <dt>Minutes</dt>
          <dd>{formatNumber(sum((point) => point.actual.minutes))}</dd>
        </div>
      </dl>
      <ol className="strip" aria-label="Days this week">
        {days.map((date) => {
          const key = date.toISOString().slice(0, 10)
          const count = byDay.get(key)?.sessions ?? 0
          const name = `${dayLabel.format(date)} ${dateLabel.format(date)}`
          return (
            <li
              key={key}
              className={[count > 0 ? 'trained' : '', key === today ? 'today' : ''].join(' ').trim() || undefined}
              aria-label={`${name}: ${count === 0 ? 'no session' : count === 1 ? '1 session' : `${count} sessions`}`}
              aria-current={key === today ? 'date' : undefined}
            >
              <span className="day">{dayLabel.format(date)}</span>
              <span className="mark" aria-hidden="true">
                {count > 0 ? count : ''}
              </span>
            </li>
          )
        })}
      </ol>
      {sessions === 0 && <p className="hint">No sessions yet this week.</p>}
      <p className="hint">Weeks run Monday to Sunday in UTC, as the server counts them.</p>
    </section>
  )
}
