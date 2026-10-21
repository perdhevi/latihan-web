import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useIdempotencyKey } from '../../api/concurrency'
import { describeError, isApiError } from '../../api/errors'
import { useAuth } from '../../auth/context'
import { returnPath } from '../../auth/redirect'
import { checkDisplayName, useCreateProfile, useMe } from './api'

/**
 * "Create cloud profile": the first screen of a new account. The API keeps
 * the account (sign-in) and the profile (the user's data) apart, so a fresh
 * account must create a profile before anything else answers.
 */
export function WelcomePage() {
  const { signOut } = useAuth()
  // The gate that sent us here has just been told profile_required.
  const me = useMe({ retryOnMount: false })
  const create = useCreateProfile()
  // Every retry of the same name reuses the key. A new name is a new body,
  // and the server refuses a key reused with another body (422).
  const { key, renew } = useIdempotencyKey()
  const location = useLocation()
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const noProfile = isApiError(me.error, 'profile_required')
  // Has a profile (just created, or already had one): on to the app. A
  // profile deleted elsewhere stays cached next to the error; that one is gone.
  if (me.data !== undefined && !noProfile) return <Navigate to={returnPath(location.state)} replace />
  if (me.isError && !noProfile) throw me.error
  if (me.isPending) return <p className="status">Loading your profile…</p>

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = checkDisplayName(name)
    setMessage(problem)
    if (problem !== null) return
    create.mutate(
      { displayName: name, idempotencyKey: key },
      {
        onError: (error) => {
          if (!isApiError(error, 'profile_exists')) setMessage(describeError(error))
        },
      },
    )
  }

  return (
    <main className="auth">
      <h1>latihan</h1>
      <h2>Create your cloud profile</h2>
      <p>Your plans, sessions and measurements are stored with this profile.</p>
      <form onSubmit={submit} noValidate>
        <label>
          Display name
          <input
            autoComplete="nickname"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              renew()
            }}
            required
          />
        </label>
        {message !== null && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Please wait…' : 'Create profile'}
        </button>
      </form>
      <p>
        Wrong account?{' '}
        <button type="button" className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
    </main>
  )
}
