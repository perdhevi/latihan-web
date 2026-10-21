import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { Versioned } from '../../api/concurrency'
import { describeError, isApiError } from '../../api/errors'
import { ChangedElsewhere } from '../../shared/ChangedElsewhere'
import { Field } from '../../shared/ExerciseEditor'
import { YourData } from '../account/YourData'
import { useMeasurements } from '../measurements/api'
import { metrics, progress } from '../measurements/model'
import { formatDelta, formatNumber, formatWhen } from '../sessions/format'
import { checkDisplayName, useMeVersioned, useRenameProfile, type User } from './api'

/** "Profile": the display name, and body measurements over time. */
export function ProfilePage() {
  const me = useMeVersioned()
  return (
    <section className="home">
      <h1>Profile</h1>
      {/* The profile gate has loaded it; render once the version is known. */}
      {me.data !== undefined && <DisplayName opened={me.data} reload={me.refetch} />}
      <Measurements />
      <YourData />
    </section>
  )
}

function DisplayName({
  opened,
  reload,
}: {
  opened: Versioned<User>
  reload: () => Promise<{ data?: Versioned<User> }>
}) {
  // The version the field was filled from; see PlanEditor.
  const [base, setBase] = useState(opened)
  const [name, setName] = useState(opened.data.display_name)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const rename = useRenameProfile()
  const id = useId()

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = checkDisplayName(name)
    setMessage(problem)
    setSaved(false)
    if (problem !== null) return
    rename.mutate(
      { displayName: name, etag: base.etag },
      {
        onSuccess: (me) => {
          setBase(me)
          setName(me.data.display_name)
          setSaved(true)
        },
      },
    )
  }

  async function takeLatest({ keepMine }: { keepMine: boolean }) {
    const latest = (await reload()).data
    if (latest === undefined) return
    setBase(latest)
    if (!keepMine) setName(latest.data.display_name)
    rename.reset()
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Your name</h2>
      <form className="name-form" onSubmit={save} noValidate>
        <Field id={`${id}-name`} label="Display name" error={message ?? undefined}>
          <input
            autoComplete="nickname"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
          />
        </Field>
        <button type="submit" disabled={rename.isPending || name.trim() === base.data.display_name}>
          {rename.isPending ? 'Saving…' : 'Save name'}
        </button>
      </form>
      {saved && (
        <p className="hint" role="status">
          Saved.
        </p>
      )}
      {isApiError(rename.error, 'precondition_failed') ? (
        <ChangedElsewhere
          what="profile"
          onReload={() => void takeLatest({ keepMine: false })}
          onKeepMine={() => void takeLatest({ keepMine: true })}
        />
      ) : (
        rename.isError && (
          <p className="error" role="alert">
            {describeError(rename.error)}
          </p>
        )
      )}
    </section>
  )
}

function Measurements() {
  const measurements = useMeasurements()
  const id = useId()

  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="page-head">
        <h2 id={`${id}-title`}>Body measurements</h2>
        <Link className="button" to="/profile/measurements/new">
          Add measurement
        </Link>
      </div>
      {measurements.isPending ? (
        <p className="status">Loading your measurements…</p>
      ) : measurements.isError ? (
        <div className="problem" role="alert">
          <p>{describeError(measurements.error)}</p>
          <button type="button" onClick={() => void measurements.refetch()}>
            Try again
          </button>
        </div>
      ) : measurements.data.length === 0 ? (
        <p className="status">No measurements yet. Add your starting point.</p>
      ) : (
        <>
          <ul className="metric-cards">
            {progress(measurements.data).map((metric) => (
              <li key={metric.key}>
                <span className="label">{metric.label}</span>
                <span className="value">
                  {formatNumber(metric.latest)} {metric.unit}
                </span>
                <span className="hint">
                  {metric.sinceFirst === null
                    ? 'First measurement'
                    : `${formatDelta(metric.sinceFirst, metric.unit)} since first entry`}
                </span>
              </li>
            ))}
          </ul>
          <h3>History</h3>
          <ul className="catalog-list">
            {measurements.data.map((measurement) => (
              <li key={measurement.id}>
                <Link className="catalog-item" to={`/profile/measurements/${measurement.id}`}>
                  <span className="name">{formatWhen(measurement.measured_at)}</span>
                  <span className="hint">
                    {metrics
                      .filter(({ key }) => measurement[key] !== null)
                      .map(({ key, label, unit }) => `${label} ${formatNumber(measurement[key])} ${unit}`)
                      .join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
