import { useId, useState, type KeyboardEvent } from 'react'
import { categories, type Category } from '../features/catalog/api'
import { CatalogList } from '../features/catalog/CatalogList'
import { checkExerciseName, type PickedExercise } from './exercise'

export type { PickedExercise }

/**
 * Choose an exercise from the catalog, or name your own. Holds no form of
 * its own, so it can sit inside the plan and session forms (Parts 5 and 6).
 */
export function ExercisePicker({ onPick }: { onPick: (picked: PickedExercise) => void }) {
  const [category, setCategory] = useState<Category | undefined>()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Category>('strength')
  const [message, setMessage] = useState<string | null>(null)
  const id = useId()

  function addOwn() {
    const problem = checkExerciseName(name)
    setMessage(problem)
    if (problem !== null) return
    onPick({ exercise_id: null, name: name.trim(), kind })
    setName('')
  }

  function onEnter(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the exercise instead of submitting the surrounding form.
    if (event.key !== 'Enter') return
    event.preventDefault()
    addOwn()
  }

  return (
    <div className="picker">
      <h3>From the catalog</h3>
      <CatalogList
        category={category}
        onCategoryChange={setCategory}
        onSelect={(exercise) => onPick({ exercise_id: exercise.id, name: exercise.name, kind: exercise.category })}
        selectLabel="Add"
      />

      <h3>Your own exercise</h3>
      <div className="own">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={onEnter} />
        <label htmlFor={`${id}-kind`}>Kind</label>
        <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as Category)}>
          {categories.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" onClick={addOwn}>
          Add exercise
        </button>
      </div>
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
