import { useEffect, useEffectEvent, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { describeError, isApiError } from '../../api/errors'
import { categoryLabel, parseCategory, useCatalogExercise } from './api'
import { CatalogList } from './CatalogList'

/** Marks a history entry pushed by opening an exercise, so Close can go back. */
type OpenedState = { opened: true }

/**
 * "Ideas": the exercise catalog. The filter and the open exercise live in the
 * URL (`/ideas?category=cardio&exercise=<id>`), so both survive a reload and
 * can be linked to; Back closes an exercise opened from the list.
 */
export function IdeasPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const category = parseCategory(params.get('category'))
  const openId = params.get('exercise')

  function withParam(name: string, value: string | undefined) {
    const next = new URLSearchParams(params)
    if (value === undefined) next.delete(name)
    else next.set(name, value)
    return next
  }

  function close() {
    if ((location.state as OpenedState | null)?.opened) navigate(-1)
    else setParams(withParam('exercise', undefined), { replace: true })
  }

  return (
    <section>
      <h1>Ideas</h1>
      <p className="hint">The shared exercise catalog. Plans and sessions can use any entry.</p>
      <CatalogList
        category={category}
        // A filter is not a place to go back to.
        onCategoryChange={(value) => setParams(withParam('category', value), { replace: true })}
        onSelect={(exercise) =>
          setParams(withParam('exercise', exercise.id), { state: { opened: true } satisfies OpenedState })
        }
        selectLabel="Show"
      />
      {openId !== null && <ExerciseDrawer key={openId} id={openId} onClose={close} />}
    </section>
  )
}

function ExerciseDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const exercise = useCatalogExercise(id)
  const closeButton = useRef<HTMLButtonElement>(null)

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
  })
  useEffect(() => {
    closeButton.current?.focus()
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <aside className="drawer" role="dialog" aria-labelledby="exercise-title">
      <button ref={closeButton} type="button" className="link close" onClick={onClose}>
        Close
      </button>
      {exercise.data !== undefined ? (
        <>
          <p className="eyebrow">{categoryLabel(exercise.data.category)}</p>
          <h2 id="exercise-title">{exercise.data.name}</h2>
          <dl className="facts">
            <dt>Muscle group</dt>
            <dd>{exercise.data.muscle_group}</dd>
            <dt>Equipment</dt>
            <dd>{exercise.data.equipment}</dd>
          </dl>
          {exercise.data.description === '' ? (
            <p className="hint">No description yet.</p>
          ) : (
            <p className="description">{exercise.data.description}</p>
          )}
        </>
      ) : exercise.isError ? (
        <>
          <h2 id="exercise-title">Exercise</h2>
          {isApiError(exercise.error, 'exercise_not_found') || isApiError(exercise.error, 'invalid_id') ? (
            <p>This exercise is not in the catalog.</p>
          ) : (
            <div className="problem" role="alert">
              <p>{describeError(exercise.error)}</p>
              <button type="button" onClick={() => void exercise.refetch()}>
                Try again
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2 id="exercise-title">Exercise</h2>
          <p className="status">Loading…</p>
        </>
      )}
    </aside>
  )
}
