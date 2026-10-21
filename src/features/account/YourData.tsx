import { useId, useState } from 'react'
import { describeError, isApiError } from '../../api/errors'
import { useAuth } from '../../auth/context'
import { Modal } from '../../shared/ConfirmDialog'
import { useActiveSession } from '../active-session/context'
import { useErase, useExport } from './api'

/** The word to type before an erase. */
const confirmWord = 'ERASE'

/** "Your data": take it with you, or leave. */
export function YourData() {
  const exporter = useExport()
  const [erasing, setErasing] = useState(false)
  const id = useId()

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Your data</h2>
      <p className="hint">
        Everything the server holds about you (profile, measurements, plans and sessions) as one JSON file.
      </p>
      <div className="actions">
        <button type="button" className="secondary" disabled={exporter.isPending} onClick={() => exporter.mutate()}>
          {exporter.isPending ? 'Preparing…' : 'Export my data'}
        </button>
        <button type="button" className="secondary danger-text" onClick={() => setErasing(true)}>
          Erase my account
        </button>
      </div>
      {exporter.isSuccess && (
        <p className="hint" role="status">
          Downloaded {exporter.data}.
        </p>
      )}
      {exporter.isError && (
        <p className="error" role="alert">
          {describeError(exporter.error)}
          {isApiError(exporter.error, 'network_error') && ' Nothing was saved; try again.'}
        </p>
      )}
      {/* Mounted only while open, so the typed word starts empty each time. */}
      {erasing && <EraseDialog onCancel={() => setErasing(false)} />}
    </section>
  )
}

function EraseDialog({ onCancel }: { onCancel: () => void }) {
  const erase = useErase()
  const { forget } = useAuth()
  const { dispatch } = useActiveSession()
  const [typed, setTyped] = useState('')
  const id = useId()
  const confirmed = typed.trim() === confirmWord

  function eraseAccount() {
    erase.mutate(undefined, {
      onSuccess: () => {
        // What this browser still holds: the session in progress, and the
        // tokens. The cached data goes with the sign-out (see Root).
        dispatch({ type: 'clear' })
        // The sign-in guard then takes the user to the sign-in page.
        forget('Your account and its data were erased.')
      },
    })
  }

  return (
    <Modal open title="Erase your account?" onClose={() => !erase.isPending && onCancel()}>
      <p>
        This deletes your profile, measurements, plans and sessions, and your login. It cannot be undone; export
        your data first if you want to keep it.
      </p>
      <p className="hint">
        The server's backups keep the erased data until they expire, and its audit log keeps that an erasure
        happened, under an ID that no longer identifies you.
      </p>
      <div className="field">
        <label htmlFor={`${id}-confirm`}>Type {confirmWord} to confirm</label>
        <input
          id={`${id}-confirm`}
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {erase.isError && (
        <p className="error" role="alert">
          {describeError(erase.error)} Nothing was erased, or only part of it; erasing again finishes the job.
        </p>
      )}
      <div className="actions">
        <button type="button" className="secondary" disabled={erase.isPending} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger" disabled={!confirmed || erase.isPending} onClick={eraseAccount}>
          {erase.isPending ? 'Erasing…' : 'Erase my account'}
        </button>
      </div>
    </Modal>
  )
}
