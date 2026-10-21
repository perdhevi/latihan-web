/*
 * How sessions and comparisons read on screen. One rule above all: a value
 * the API sends as null was not recorded, and shows as "—", never as 0.
 */

export const missing = '—'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

/** 62.5 → "62.5"; null → "—". */
export function formatNumber(value: number | null | undefined): string {
  return value == null ? missing : number.format(value)
}

/**
 * A difference, actual minus planned: "+1", "−2.5", "0"; null → "—".
 * Uses a true minus sign, so "−" lines up with "+" and is read as minus.
 */
export function formatDelta(value: number | null | undefined, unit = ''): string {
  if (value == null) return missing
  const suffix = unit === '' ? '' : ` ${unit}`
  if (value === 0) return `0${suffix}`
  return `${value > 0 ? '+' : '−'}${number.format(Math.abs(value))}${suffix}`
}

/** "110%", rounded; null → "—". The API sends floats such as 110.00000000000001. */
export function formatPercent(value: number | null): string {
  return value === null ? missing : `${Math.round(value)}%`
}

/** A set: "6 × 62.5 kg"; null → "—". */
export function formatSet(set: { repetitions: number; weight_kg: number } | null): string {
  return set === null ? missing : `${set.repetitions} × ${number.format(set.weight_kg)} kg`
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** When a session happened, in this browser's time zone. */
export function formatWhen(iso: string): string {
  return dateTime.format(new Date(iso))
}
