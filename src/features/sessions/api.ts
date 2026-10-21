import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap, unwrapVersioned } from '../../api/client'
import { ifMatch, type Versioned } from '../../api/concurrency'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'
import type { ExerciseValue } from '../../shared/exercise'

export type Session = components['schemas']['Session']
export type Comparison = components['schemas']['Comparison']
export type ExerciseComparison = components['schemas']['ExerciseComparison']

/** A session as the API takes it: each exercise may answer one target of the plan. */
export type SessionValue = {
  name: string
  notes: string
  performed_at: string
  plan_id: string | null
  exercises: (ExerciseValue & { plan_exercise_id: string | null })[]
}

export const sessionKeys = {
  all: ['sessions'] as const,
  list: ['sessions', 'list'] as const,
  detail: (id: string) => ['sessions', 'detail', id] as const,
  // Under the session's key: whatever refreshes the session refreshes it.
  comparison: (id: string) => ['sessions', 'detail', id, 'comparison'] as const,
}

/** The user's sessions, newest first, 20 at a time. */
export function useSessions() {
  const { api } = useAuth()
  return useInfiniteQuery({
    queryKey: sessionKeys.list,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      unwrap(api.GET('/api/v1/sessions', { params: { query: { limit: 20, cursor: pageParam } }, signal })),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  })
}

/**
 * One session with the ETag it was read at. `enabled: false` stops reading
 * it, e.g. once the page has deleted it and is about to leave.
 */
export function useSession(id: string, { enabled = true } = {}) {
  const { api } = useAuth()
  return useQuery({
    queryKey: sessionKeys.detail(id),
    enabled,
    queryFn: ({ signal }) => unwrapVersioned(api.GET('/api/v1/sessions/{id}', { params: { path: { id } }, signal })),
  })
}

/**
 * What the session's plan asked for next to what was done
 * (`GET /plans/{plan_id}/comparison`). Only for a session with a plan.
 */
export function useComparison(session: Session) {
  const { api } = useAuth()
  const planId = session.plan_id ?? null
  return useQuery({
    queryKey: sessionKeys.comparison(session.id),
    enabled: planId !== null,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/plans/{id}/comparison', {
          params: { path: { id: planId! }, query: { session_id: session.id } },
          signal,
        }),
      ),
  })
}

function useStoreSession() {
  const queryClient = useQueryClient()
  return (session: Versioned<Session>) => {
    queryClient.setQueryData(sessionKeys.detail(session.data.id), session)
    // An edit changes what was done, so the comparison is out of date.
    queryClient.removeQueries({ queryKey: sessionKeys.comparison(session.data.id) })
    void queryClient.invalidateQueries({ queryKey: sessionKeys.list })
  }
}

/** Saves a finished session. The key comes with the draft (see active-session/store.ts). */
export function useCreateSession() {
  const { api } = useAuth()
  const store = useStoreSession()
  return useMutation({
    mutationFn: ({ session, idempotencyKey }: { session: SessionValue; idempotencyKey: string }) =>
      unwrapVersioned(
        api.POST('/api/v1/sessions', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: session }),
      ),
    onSuccess: store,
  })
}

/** Replaces a saved session, if it is still at the version `etag` was read at. */
export function useUpdateSession(id: string) {
  const { api } = useAuth()
  const store = useStoreSession()
  return useMutation({
    mutationFn: ({ session, etag }: { session: SessionValue; etag: string | null }) =>
      unwrapVersioned(
        api.PUT('/api/v1/sessions/{id}', { params: { path: { id }, header: ifMatch(etag) }, body: session }),
      ),
    onSuccess: store,
  })
}

/** Deletes a session at the version `etag` was read at. */
export function useDeleteSession(id: string) {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ etag }: { etag: string | null }) =>
      unwrap(api.DELETE('/api/v1/sessions/{id}', { params: { path: { id }, header: ifMatch(etag) } })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: sessionKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list })
    },
  })
}
