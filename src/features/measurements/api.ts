import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap, unwrapVersioned } from '../../api/client'
import { ifMatch, type Versioned } from '../../api/concurrency'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'

export type Measurement = components['schemas']['Measurement']
export type MeasurementInput = components['schemas']['MeasurementInput']

export const measurementKeys = {
  all: ['measurements'] as const,
  list: ['measurements', 'list'] as const,
  detail: (id: string) => ['measurements', 'detail', id] as const,
}

const me = { userID: 'me' }
// Enough for years of weekly measurements; past it, "since first" would be
// "since the oldest loaded".
const maxPages = 20

/**
 * Every measurement, newest first. "Change since first" needs the oldest
 * one, so all pages are read (100 at a time), not just the first.
 */
export function useMeasurements() {
  const { api } = useAuth()
  return useQuery({
    queryKey: measurementKeys.list,
    queryFn: async ({ signal }) => {
      const all: Measurement[] = []
      let cursor: string | undefined
      for (let page = 0; page < maxPages; page++) {
        const result = await unwrap(
          api.GET('/api/v1/users/{userID}/measurements', {
            params: { path: me, query: { limit: 100, cursor } },
            signal,
          }),
        )
        all.push(...result.items)
        if (result.next_cursor === null) break
        cursor = result.next_cursor
      }
      return all
    },
  })
}

/** One measurement with the ETag it was read at. */
export function useMeasurement(id: string, { enabled = true } = {}) {
  const { api } = useAuth()
  return useQuery({
    queryKey: measurementKeys.detail(id),
    enabled,
    queryFn: ({ signal }) =>
      unwrapVersioned(
        api.GET('/api/v1/users/{userID}/measurements/{id}', { params: { path: { ...me, id } }, signal }),
      ),
  })
}

function useStoreMeasurement() {
  const queryClient = useQueryClient()
  return (measurement: Versioned<Measurement>) => {
    queryClient.setQueryData(measurementKeys.detail(measurement.data.id), measurement)
    void queryClient.invalidateQueries({ queryKey: measurementKeys.list })
  }
}

/** Records a measurement; the caller keeps one idempotency key per body. */
export function useCreateMeasurement() {
  const { api } = useAuth()
  const store = useStoreMeasurement()
  return useMutation({
    mutationFn: ({ measurement, idempotencyKey }: { measurement: MeasurementInput; idempotencyKey: string }) =>
      unwrapVersioned(
        api.POST('/api/v1/users/{userID}/measurements', {
          params: { path: me, header: { 'Idempotency-Key': idempotencyKey } },
          body: measurement,
        }),
      ),
    onSuccess: store,
  })
}

/** Replaces a measurement (an omitted metric is cleared), if still at the version `etag` was read at. */
export function useUpdateMeasurement(id: string) {
  const { api } = useAuth()
  const store = useStoreMeasurement()
  return useMutation({
    mutationFn: ({ measurement, etag }: { measurement: MeasurementInput; etag: string | null }) =>
      unwrapVersioned(
        api.PUT('/api/v1/users/{userID}/measurements/{id}', {
          params: { path: { ...me, id }, header: ifMatch(etag) },
          body: measurement,
        }),
      ),
    onSuccess: store,
  })
}

export function useDeleteMeasurement(id: string) {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ etag }: { etag: string | null }) =>
      unwrap(
        api.DELETE('/api/v1/users/{userID}/measurements/{id}', { params: { path: { ...me, id }, header: ifMatch(etag) } }),
      ),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: measurementKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: measurementKeys.list })
    },
  })
}
