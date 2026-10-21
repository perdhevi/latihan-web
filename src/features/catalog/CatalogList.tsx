import { describeError } from '../../api/errors'
import { categories, categoryLabel, useCatalog, type CatalogExercise, type Category } from './api'

/**
 * The catalog with a category filter, 20 entries at a time. Used by the Ideas
 * page and by the exercise picker; each decides what selecting an entry does
 * and where the chosen category is kept.
 */
export function CatalogList({
  category,
  onCategoryChange,
  onSelect,
  selectLabel,
}: {
  category: Category | undefined
  onCategoryChange: (category: Category | undefined) => void
  onSelect: (exercise: CatalogExercise) => void
  /** Spoken label of an entry's button, e.g. "Show" or "Add". */
  selectLabel: string
}) {
  const catalog = useCatalog(category)
  const exercises = catalog.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="catalog">
      <div className="chips" role="group" aria-label="Category">
        <button type="button" aria-pressed={category === undefined} onClick={() => onCategoryChange(undefined)}>
          All
        </button>
        {categories.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={category === value} onClick={() => onCategoryChange(value)}>
            {label}
          </button>
        ))}
      </div>

      {catalog.isPending ? (
        <p className="status">Loading exercises…</p>
      ) : catalog.isError && catalog.data === undefined ? (
        <div className="problem" role="alert">
          <p>{describeError(catalog.error)}</p>
          <button type="button" onClick={() => void catalog.refetch()}>
            Try again
          </button>
        </div>
      ) : exercises.length === 0 ? (
        <p className="status">No exercises in this category.</p>
      ) : (
        <ul className="catalog-list">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                className="catalog-item"
                aria-label={`${selectLabel} ${exercise.name}`}
                onClick={() => onSelect(exercise)}
              >
                <span className="name">{exercise.name}</span>
                <span className="hint">
                  {categoryLabel(exercise.category)} · {exercise.muscle_group} · {exercise.equipment}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {catalog.isFetchNextPageError && (
        <p className="error" role="alert">
          {describeError(catalog.error)}
        </p>
      )}
      {catalog.hasNextPage && (
        <button
          type="button"
          className="secondary"
          disabled={catalog.isFetchingNextPage}
          onClick={() => void catalog.fetchNextPage()}
        >
          {catalog.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
