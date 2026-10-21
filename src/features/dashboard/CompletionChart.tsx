import { useEffect, useRef, useState } from 'react'
import { describeError } from '../../api/errors'
import { formatPercent } from '../sessions/format'
import { addDays, useProgress, weekStart, type ProgressPoint } from './api'

const weeks = 12
const weekLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

type Week = { start: Date; volume: number | null; minutes: number | null }

/**
 * The share of planned work done, per week, for the last twelve weeks:
 * planned strength volume and planned minutes. A week with no planned work
 * of a kind (no sessions, or plans that asked for none) has no value, and
 * the chart leaves a gap there rather than plotting 0.
 */
export function CompletionChart({ now }: { now: Date }) {
  const thisWeek = weekStart(now)
  const from = addDays(thisWeek, -7 * (weeks - 1))
  const progress = useProgress('week', from, addDays(thisWeek, 7))

  if (progress.isPending) return <p className="status">Loading progress…</p>
  if (progress.isError) {
    return (
      <div className="problem" role="alert">
        <p>Progress could not be loaded: {describeError(progress.error)}</p>
        <button type="button" onClick={() => void progress.refetch()}>
          Try again
        </button>
      </div>
    )
  }

  // The server leaves out weeks without sessions; place the ones it sent.
  const byWeek = new Map<string, ProgressPoint>(progress.data.data.map((point) => [point.bucket.slice(0, 10), point]))
  const series: Week[] = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(from, 7 * i)
    const point = byWeek.get(start.toISOString().slice(0, 10))
    return {
      start,
      volume: point?.volume_completion_pct ?? null,
      minutes: point?.minutes_completion_pct ?? null,
    }
  })

  return (
    <section aria-labelledby="completion-title">
      <h2 id="completion-title">Planned work done, last {weeks} weeks</h2>
      <p className="hint">
        Of what your plans asked for each week, how much you did. A gap is a week whose plans asked for none of it.
      </p>
      {series.every((week) => week.volume === null && week.minutes === null) ? (
        <p className="status">No planned sessions in the last {weeks} weeks.</p>
      ) : (
        <>
          <Chart series={series} />
          <details className="chart-table">
            <summary>Show as a table</summary>
            <table className="compare">
              <caption>Planned work done per week</caption>
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  <th scope="col">Volume</th>
                  <th scope="col">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {series.map((week) => (
                  <tr key={week.start.toISOString()}>
                    <th scope="row">{weekLabel.format(week.start)}</th>
                    <td>{formatPercent(week.volume)}</td>
                    <td>{formatPercent(week.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  )
}

// Geometry in CSS pixels. The SVG is drawn at its container's width, not
// scaled to it, so text stays at its real size on a phone.
const height = 220
const margin = { top: 12, right: 72, bottom: 28, left: 44 }
const plotHeight = height - margin.top - margin.bottom

/** The element's width, following resizes; `fallback` until measured (and in tests). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

const seriesSpec = [
  { key: 'volume', label: 'Volume', className: 'series-1' },
  { key: 'minutes', label: 'Minutes', className: 'series-2' },
] as const

function Chart({ series }: { series: Week[] }) {
  const [active, setActive] = useState<number | null>(null)
  const { ref, width } = useWidth(640)
  const plotWidth = Math.max(width - margin.left - margin.right, 120)
  // Week labels about 56px apart: every other one on a desktop, fewer on a phone.
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.floor(plotWidth / 56)))
  const values = series.flatMap((week) => [week.volume, week.minutes]).filter((value) => value !== null)
  // Always show 100% (the plan); go higher only when the data does.
  const top = Math.max(100, Math.ceil(Math.max(...values) / 50) * 50)
  const ticks = Array.from({ length: top / 50 + 1 }, (_, i) => i * 50)
  const slot = plotWidth / series.length
  const x = (i: number) => margin.left + slot * (i + 0.5)
  const y = (value: number) => margin.top + plotHeight * (1 - value / top)

  /** One path per run of weeks with a value: a null breaks the line. */
  function path(key: 'volume' | 'minutes') {
    let d = ''
    let drawing = false
    series.forEach((week, i) => {
      const value = week[key]
      if (value === null) {
        drawing = false
        return
      }
      d += `${drawing ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)} `
      drawing = true
    })
    return d.trim()
  }

  // Direct labels at each series' last value, kept 14 units apart.
  const ends = seriesSpec.map((spec) => {
    const index = series.findLastIndex((week) => week[spec.key] !== null)
    return { spec, index, y: index < 0 ? null : y(series[index][spec.key]!) }
  })
  const [first, second] = ends
  if (first.y !== null && second.y !== null && Math.abs(first.y - second.y) < 14) {
    const middle = (first.y + second.y) / 2
    const upper = first.y <= second.y ? first : second
    const lower = upper === first ? second : first
    upper.y = middle - 7
    lower.y = middle + 7
  }

  const shown = active === null ? null : series[active]
  const summary = `Line chart. ${seriesSpec
    .map((spec) => {
      const last = [...series].reverse().find((week) => week[spec.key] !== null)
      return last === undefined ? `${spec.label}: no data` : `${spec.label}: ${formatPercent(last[spec.key])} in the week of ${weekLabel.format(last.start)}`
    })
    .join('. ')}.`

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setActive(null)}>
      <ul className="legend" aria-hidden="true">
        {seriesSpec.map((spec) => (
          <li key={spec.key} className={spec.className}>
            <svg width="22" height="10" viewBox="0 0 22 10">
              <line x1="0" y1="5" x2="22" y2="5" />
              {spec.key === 'volume' ? <circle cx="11" cy="5" r="4" /> : <rect x="7" y="1" width="8" height="8" />}
            </svg>
            {spec.label}
          </li>
        ))}
      </ul>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
        {ticks.map((tick) => (
          <g key={tick} className={tick === 100 ? 'grid target' : 'grid'}>
            <line x1={margin.left} x2={margin.left + plotWidth} y1={y(tick)} y2={y(tick)} />
            <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {tick}%
            </text>
          </g>
        ))}
        {series.map((week, i) =>
          // Counted back from this week, which always has a label.
          (series.length - 1 - i) % labelEvery !== 0 ? null : (
            <text key={i} className="axis" x={x(i)} y={height - 8} textAnchor="middle">
              {weekLabel.format(week.start)}
            </text>
          ),
        )}
        {active !== null && (
          <line className="crosshair" x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotHeight} />
        )}
        {seriesSpec.map((spec) => (
          <g key={spec.key} className={spec.className}>
            <path className="line" d={path(spec.key)} />
            {series.map((week, i) => {
              const value = week[spec.key]
              if (value === null) return null
              return spec.key === 'volume' ? (
                <circle key={i} className="marker" cx={x(i)} cy={y(value)} r={i === active ? 5.5 : 4} />
              ) : (
                <rect
                  key={i}
                  className="marker"
                  x={x(i) - (i === active ? 5.5 : 4)}
                  y={y(value) - (i === active ? 5.5 : 4)}
                  width={i === active ? 11 : 8}
                  height={i === active ? 11 : 8}
                />
              )
            })}
          </g>
        ))}
        {ends.map(({ spec, index, y: labelY }) =>
          index < 0 || labelY === null ? null : (
            <text key={spec.key} className="end-label" x={x(index) + 10} y={labelY} dy="0.32em">
              {spec.label} {formatPercent(series[index][spec.key])}
            </text>
          ),
        )}
        {/* Hit areas: a whole week's column, wider than any mark. */}
        {series.map((week, i) => (
          <rect
            key={week.start.toISOString()}
            className="hit"
            x={x(i) - slot / 2}
            y={margin.top}
            width={slot}
            height={plotHeight}
            onMouseEnter={() => setActive(i)}
          />
        ))}
      </svg>
      {shown !== null && active !== null && (
        <div
          className="tooltip"
          aria-hidden="true"
          // Centred on the week, but kept inside the chart's edges.
          style={{ left: `${Math.min(Math.max(x(active), 70), width - 70)}px` }}
        >
          <strong>Week of {weekLabel.format(shown.start)}</strong>
          <span>Volume {formatPercent(shown.volume)}</span>
          <span>Minutes {formatPercent(shown.minutes)}</span>
        </div>
      )}
    </div>
  )
}
