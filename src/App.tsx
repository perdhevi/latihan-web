import { useEffect, useState } from 'react'
import { api, unwrap } from './api/client'
import { ApiError } from './api/errors'

type Probe =
  | { state: 'loading' }
  | { state: 'loaded'; count: number }
  | { state: 'failed'; error: ApiError }

// Still a probe page, now through the typed client: the path and its query
// parameters are checked against the contract, and a failure arrives as an
// ApiError carrying the contract's error code. Without a token the API
// answers 401 unauthenticated; Part 2 adds signing in.
function App() {
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
    </main>
  )
}

export default App
