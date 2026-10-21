import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap, unwrapVersioned } from '../../api/client'
import { ifMatch, type Versioned } from '../../api/concurrency'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'
import type { ExerciseValue } from '../../shared/exercise'

export type Plan = components['schemas']['Plan']
export type PlanValue = { name: string; notes: string; exercises: ExerciseValue[] }

export const planKeys = {
  all: ['plans'] as const,
  list: ['plans', 'list'] as const,
  detail: (id: string) => ['plans', 'detail', id] as const,
}

/** The user's plans, newest first, 20 at a time. */
export function usePlans() {
  const { api } = useAuth()
  return useInfiniteQuery({
    queryKey: planKeys.list,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      unwrap(api.GET('/api/v1/plans', { params: { query: { limit: 20, cursor: pageParam } }, signal })),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  })
}

/** One plan with the ETag it was read at, for a later PUT or DELETE. */
export function usePlan(id: string) {
  const { api } = useAuth()
  return useQuery({
    queryKey: planKeys.detail(id),
    queryFn: ({ signal }) => unwrapVersioned(api.GET('/api/v1/plans/{id}', { params: { path: { id } }, signal })),
  })
}

/** After a write, the server's answer is the newest version: keep it. */
function useStorePlan() {
  const queryClient = useQueryClient()
  return (plan: Versioned<Plan>) => {
    queryClient.setQueryData(planKeys.detail(plan.data.id), plan)
    void queryClient.invalidateQueries({ queryKey: planKeys.list })
  }
}

/**
 * Creates a plan. The caller keeps one idempotency key per intended plan and
 * sends it again on a retry, so a create whose response was lost is replayed
 * by the server instead of making a second plan.
 */
export function useCreatePlan() {
  const { api } = useAuth()
  const store = useStorePlan()
  return useMutation({
    mutationFn: ({ plan, idempotencyKey }: { plan: PlanValue; idempotencyKey: string }) =>
      unwrapVersioned(
        api.POST('/api/v1/plans', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: plan }),
      ),
    onSuccess: store,
  })
}

/**
 * Replaces a plan, if it is still at the version `etag` was read at;
 * otherwise `412 precondition_failed`. A plan sessions use only takes a new
 * name and notes (`409 plan_in_use` for anything else).
 */
export function useUpdatePlan(id: string) {
  const { api } = useAuth()
  const store = useStorePlan()
  return useMutation({
    mutationFn: ({ plan, etag }: { plan: PlanValue; etag: string | null }) =>
      unwrapVersioned(
        api.PUT('/api/v1/plans/{id}', { params: { path: { id }, header: ifMatch(etag) }, body: plan }),
      ),
    onSuccess: store,
  })
}

/** Deletes a plan at the version `etag` was read at. `409 resource_in_use` while sessions use it. */
export function useDeletePlan(id: string) {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ etag }: { etag: string | null }) =>
      unwrap(api.DELETE('/api/v1/plans/{id}', { params: { path: { id }, header: ifMatch(etag) } })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: planKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: planKeys.list })
    },
  })
}
