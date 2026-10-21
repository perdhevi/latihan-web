import { useQuery } from '@tanstack/react-query'
import { unwrap } from '../../api/client'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'

export type ProgressPoint = components['schemas']['ProgressPoint']
type Bucket = 'day' | 'week' | 'month'

export const statsKeys = {
  all: ['stats'] as const,
  progress: (bucket: Bucket, from: string, to: string) => ['stats', 'progress', bucket, from, to] as const,
}

const day = 24 * 60 * 60 * 1000

/**
 * Monday 00:00 UTC of the week `date` falls in. The API buckets in UTC
 * (ISO weeks start on Monday), so "this week" here is the server's week, not
 * the browser's: near midnight on a Sunday the two can differ.
 */
export function weekStart(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const sinceMonday = (new Date(midnight).getUTCDay() + 6) % 7
  return new Date(midnight - sinceMonday * day)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * day)
}

/**
 * Planned versus done per bucket, from..to (to exclusive), oldest first.
 * Buckets with no sessions are left out by the server.
 */
export function useProgress(bucket: Bucket, from: Date, to: Date) {
  const { api } = useAuth()
  const range = { from: from.toISOString(), to: to.toISOString() }
  return useQuery({
    queryKey: statsKeys.progress(bucket, range.from, range.to),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/stats/progress', { params: { query: { bucket, ...range } }, signal })),
  })
}
