import type { Location } from 'react-router'

/** Navigation state a guard sets when it sends the user elsewhere. */
export type FromState = { from: Pick<Location, 'pathname' | 'search' | 'hash'> }

/** The page a guard sent the user away from, to return to once it lets them in. */
export function returnPath(state: unknown, fallback = '/'): string {
  const from = (state as Partial<FromState> | null)?.from
  return from === undefined ? fallback : from.pathname + from.search + from.hash
}
