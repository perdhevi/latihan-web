import { useId, useState, type ReactNode } from 'react'

/**
 * One exercise as a card that folds down to its heading and a summary line.
 * The same card shows a session's results and holds a plan's or a session's
 * fields while they are edited, so both read alike.
 *
 * The heading wraps the toggle button (the accordion pattern), so the card
 * is found by its exercise's name. Pass `open` to control it; otherwise it
 * keeps its own state, starting from `defaultOpen`. `locked` keeps it open
 * (a row with errors to fix).
 */
export function ExerciseCard({
  as: Tag = 'article',
  label,
  className = '',
  eyebrow,
  title,
  summary,
  open: controlled,
  defaultOpen = false,
  onToggle,
  locked = false,
  children,
}: {
  as?: 'article' | 'fieldset'
  /** The card's accessible name, when it is a group of fields. */
  label?: string
  className?: string
  eyebrow?: ReactNode
  title: ReactNode
  summary?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
  locked?: boolean
  children: ReactNode
}) {
  const id = useId()
  const [own, setOwn] = useState(defaultOpen)
  const open = locked || (controlled ?? own)

  function toggle() {
    setOwn(!open)
    onToggle?.(!open)
  }

  return (
    <Tag className={`exercise-card ${className}`} aria-label={label}>
      {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
      <h3 className="card-heading">
        <button
          type="button"
          className="card-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          disabled={locked}
          onClick={toggle}
        >
          <span className="chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {title}
        </button>
      </h3>
      {summary !== undefined && <p className="hint card-summary">{summary}</p>}
      {open && (
        <div id={`${id}-body`} className="card-body">
          {children}
        </div>
      )}
    </Tag>
  )
}
