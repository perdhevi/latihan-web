import { useEffect, useState } from 'react'
import { unwrap } from './api/client'
import { ApiError } from './api/errors'
import { api } from './auth/appSession'
import { useAuth } from './auth/context'
import { SignInPage } from './auth/SignInPage'

type Probe =
  | { state: 'loading' }
  | { state: 'loaded'; count: number }
  | { state: 'failed'; error: ApiError }

// Signed out: the sign-in page. Signed in: still the probe page from Part 1,
// now with a token, so the API answers 200 instead of 401. Part 3 replaces
// this with routes and the app shell.
function App() {
  const { status } = useAuth()
  if (status === 'unknown') {
    return (
      <main className="auth">
        <p>Restoring your session…</p>
      </main>
    )
  }
  return status === 'signedIn' ? <Probe /> : <SignInPage />
}

function Probe() {
  const { signOut } = useAuth()
  const [probe, setProbe] = useState<Probe>({ state: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    unwrap(
      api.GET('/api/v1/exercises', {
        params: { query: { limit: 20 } },
        signal: controller.signal,
      }),
    )
      .then((page) => setProbe({ state: 'loaded', count: page.items.length }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError) setProbe({ state: 'failed', error })
        else throw error
      })
    return () => controller.abort()
  }, [])

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1>latihan</h1>
      <p>
        <code>GET /api/v1/exercises?limit=20</code>
      </p>
      {probe.state === 'loading' && <p>Calling the API…</p>}
      {probe.state === 'loaded' && <p>{probe.count} exercises on the first page.</p>}
      {probe.state === 'failed' && (
        <dl>
          <dt>Status</dt>
          <dd>{probe.error.status}</dd>
          <dt>Code</dt>
          <dd>
            <code>{probe.error.code}</code>
          </dd>
          <dt>Message</dt>
          <dd>{probe.error.message}</dd>
          {probe.error.requestId && (
            <>
              <dt>Request ID</dt>
              <dd>
                <code>{probe.error.requestId}</code>
              </dd>
            </>
          )}
        </dl>
      )}
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}

export default App
