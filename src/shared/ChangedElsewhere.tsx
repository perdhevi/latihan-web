/**
 * The answer to `412 precondition_failed`: the record changed on another
 * device since this page read it. Reload drops the user's edits for the
 * latest version; Keep my copy takes only the latest version tag, so the
 * next save deliberately overwrites the other change.
 */
export function ChangedElsewhere({
  what,
  onReload,
  onKeepMine,
}: {
  /** "plan", "session" */
  what: string
  onReload: () => void
  onKeepMine: () => void
}) {
  return (
    <div className="problem conflict" role="alert">
      <p>This {what} changed on another device.</p>
      <p className="hint">Reload it to see those changes, or keep your copy and save it over them.</p>
      <div className="actions">
        <button type="button" onClick={onReload}>
          Reload
        </button>
        <button type="button" className="secondary" onClick={onKeepMine}>
          Keep my copy
        </button>
      </div>
    </div>
  )
}
