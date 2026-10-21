import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { unwrap } from '../../api/client'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'

export type CatalogExercise = components['schemas']['CatalogExercise']
export type Category = CatalogExercise['category']
type CatalogPage = { items: CatalogExercise[]; limit: number; next_cursor: string | null }

/** The contract's categories, in the order the filter shows them. */
export const categories = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'stretching', label: 'Stretching' },
] as const satisfies readonly { value: Category; label: string }[]

/** A category from untrusted input (the URL), or undefined for "all". */
export function parseCategory(value: string | null): Category | undefined {
  return categories.find((category) => category.value === value)?.value
}

export function categoryLabel(category: Category): string {
  return categories.find(({ value }) => value === category)?.label ?? category
}

const pageSize = 20

// The catalog is the same for every user and changes only with a server
// release, so it may be cached far longer than personal data.
const catalogStaleTime = 10 * 60_000

export const catalogKeys = {
  all: ['exercises'] as const,
  list: (category: Category | undefined) => ['exercises', 'list', category ?? 'all'] as const,
  detail: (id: string) => ['exercises', 'detail', id] as const,
}

/**
 * The catalog, one page of 20 at a time, alphabetical. `fetchNextPage()`
 * follows `next_cursor`; `hasNextPage` turns false when the server sends none.
 */
export function useCatalog(category: Category | undefined) {
  const { api } = useAuth()
  return useInfiniteQuery({
    queryKey: catalogKeys.list(category),
    staleTime: catalogStaleTime,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/api/v1/exercises', {
          params: { query: { limit: pageSize, cursor: pageParam, category } },
          signal,
        }),
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  })
}

/**
 * One catalog exercise. Taken from a list already in the cache when there is
 * one, so opening an entry from the list costs no request; a link straight to
 * an entry asks the server.
 */
export function useCatalogExercise(id: string) {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  // The entry, and the age of the list it came from: an old list is refetched.
  const cached = () => findInLists(queryClient, id)
  return useQuery({
    queryKey: catalogKeys.detail(id),
    staleTime: catalogStaleTime,
    initialData: () => cached()?.exercise,
    initialDataUpdatedAt: () => cached()?.updatedAt,
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/exercises/{id}', { params: { path: { id } }, signal })),
  })
}

function findInLists(queryClient: QueryClient, id: string) {
  const lists = queryClient.getQueryCache().findAll({ queryKey: [...catalogKeys.all, 'list'] })
  for (const list of lists) {
    const data = list.state.data as InfiniteData<CatalogPage> | undefined
    for (const page of data?.pages ?? []) {
      const exercise = page.items.find((item) => item.id === id)
      if (exercise !== undefined) return { exercise, updatedAt: list.state.dataUpdatedAt }
    }
  }
  return undefined
}
