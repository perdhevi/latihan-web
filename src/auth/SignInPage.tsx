import { useState, type FormEvent } from 'react'
import { useAuth } from './context'
import { checkCredentials, describeAuthError, type CredentialsMode } from './credentials'

export function SignInPage() {
  const { signIn, register } = useAuth()
  const [mode, setMode] = useState<CredentialsMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const registering = mode === 'register'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = checkCredentials(mode, email, password)
    setMessage(problem)
    if (problem !== null) return
    setBusy(true)
    try {
      await (registering ? register : signIn)(email, password)
      // Signed in: AuthProvider re-renders the app, this page unmounts.
    } catch (error) {
      setMessage(describeAuthError(error))
      setBusy(false)
    }
  }

  function switchMode() {
    setMode(registering ? 'signIn' : 'register')
    setMessage(null)
  }

  return (
    <main className="auth">
      <h1>latihan</h1>
      <h2>{registering ? 'Create an account' : 'Sign in'}</h2>
      <form onSubmit={submit} noValidate>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {registering && <p className="hint">12 to 128 characters. A few unrelated words work well.</p>}
        {message !== null && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p>
        {registering ? 'Already have an account?' : 'New here?'}{' '}
        <button type="button" className="link" onClick={switchMode} disabled={busy}>
          {registering ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </main>
  )
}
