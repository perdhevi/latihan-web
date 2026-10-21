import type { Measurement, MeasurementInput } from './api'

/** The six metrics, in the order the form and the cards show them, with the contract's limits. */
export const metrics = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', min: 0, minIncluded: false, max: 1000 },
  { key: 'height_cm', label: 'Height', unit: 'cm', min: 0, minIncluded: false, max: 300 },
  { key: 'body_fat_percent', label: 'Body fat', unit: '%', min: 0, minIncluded: true, max: 100 },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', min: 0, minIncluded: false, max: 500 },
  { key: 'chest_cm', label: 'Chest', unit: 'cm', min: 0, minIncluded: false, max: 500 },
  { key: 'hip_cm', label: 'Hip', unit: 'cm', min: 0, minIncluded: false, max: 500 },
] as const

export type MetricKey = (typeof metrics)[number]['key']

/** The form: a time and each metric as typed; '' is "not recorded". */
export type MeasurementDraft = { measuredAt: string } & Record<MetricKey, string>
export type MeasurementErrors = Partial<Record<MetricKey | 'measuredAt' | 'form', string>>

export function emptyDraft(now: Date): MeasurementDraft {
  return {
    measuredAt: now.toISOString(),
    ...(Object.fromEntries(metrics.map(({ key }) => [key, ''])) as Record<MetricKey, string>),
  }
}

export function draftFrom(measurement: Measurement): MeasurementDraft {
  return {
    measuredAt: measurement.measured_at,
    ...(Object.fromEntries(
      metrics.map(({ key }) => [key, measurement[key] === null ? '' : String(measurement[key])]),
    ) as Record<MetricKey, string>),
  }
}

/** A decimal as typed, with a point or a comma; NaN when it is not one. */
function parseDecimal(text: string): number {
  const normal = text.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN
}

/**
 * Checks the form against the contract. Every metric is sent, an empty one
 * as null: `PUT` replaces the whole record, so clearing a field clears it on
 * the server, and the request says so explicitly.
 */
export function validateMeasurement(draft: MeasurementDraft): { value: MeasurementInput } | { errors: MeasurementErrors } {
  const errors: MeasurementErrors = {}
  const value = { measured_at: '' } as MeasurementInput
  const time = Date.parse(draft.measuredAt)
  if (Number.isNaN(time)) errors.measuredAt = 'Enter when you measured.'
  else value.measured_at = new Date(time).toISOString()

  for (const { key, label, unit, min, minIncluded, max } of metrics) {
    const text = draft[key].trim()
    if (text === '') {
      value[key] = null
      continue
    }
    const number = parseDecimal(text)
    const low = minIncluded ? number >= min : number > min
    if (!(low && number <= max)) {
      errors[key] = `${label}: ${minIncluded ? `${min} to ${max}` : `more than ${min}, at most ${max}`} ${unit}.`
    } else {
      value[key] = number
    }
  }
  if (metrics.every(({ key }) => draft[key].trim() === '')) {
    errors.form = 'Enter at least one measurement.'
  }
  return Object.keys(errors).length > 0 ? { errors } : { value }
}

export type MetricProgress = {
  key: MetricKey
  label: string
  unit: string
  latest: number
  /** latest minus the first recorded value; null when there is only one. */
  sinceFirst: number | null
}

/**
 * Per metric: the latest value and its change since the first time it was
 * measured, as on mobile. Each metric has its own first and latest, since a
 * measurement may record only some of them. A metric never recorded has no
 * entry.
 */
export function progress(measurements: Measurement[]): MetricProgress[] {
  const oldestFirst = [...measurements].sort(
    (a, b) => a.measured_at.localeCompare(b.measured_at) || a.id.localeCompare(b.id),
  )
  return metrics.flatMap(({ key, label, unit }) => {
    const values = oldestFirst.flatMap((measurement) => (measurement[key] === null ? [] : [measurement[key]]))
    if (values.length === 0) return []
    const latest = values[values.length - 1]
    // Rounded to what was typed: 72.4 − 70.1 is not 2.3000000000000043.
    const sinceFirst = values.length < 2 ? null : Math.round((latest - values[0]) * 100) / 100
    return [{ key, label, unit, latest, sinceFirst }]
  })
}
