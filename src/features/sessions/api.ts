import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrapVersioned } from '../../api/client'
import { ifMatch, type Versioned } from '../../api/concurrency'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'
import type { ExerciseValue } from '../../shared/exercise'

export type Session = components['schemas']['Session']

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
}

/** One session with the ETag it was read at. */
export function useSession(id: string) {
  const { api } = useAuth()
  return useQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: ({ signal }) => unwrapVersioned(api.GET('/api/v1/sessions/{id}', { params: { path: { id } }, signal })),
  })
}

function useStoreSession() {
  const queryClient = useQueryClient()
  return (session: Versioned<Session>) => {
    queryClient.setQueryData(sessionKeys.detail(session.data.id), session)
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
