import { useEffect, useState } from 'react'

type Probe =
  | { state: 'loading' }
  | { state: 'answered'; status: number; body: string }
  | { state: 'failed'; message: string }

// Part 0 only proves the wiring: the browser calls its own origin, Vite
// forwards /api to the Go server, and the server answers with its JSON error
// format. Without a token every /api/v1 route says 401.
function App() {
  const [probe, setProbe] = useState<Probe>({ state: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/exercises', { signal: controller.signal })
      .then(async (response) =>
        setProbe({
          state: 'answered',
          status: response.status,
          body: await response.text(),
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProbe({ state: 'failed', message: String(error) })
      })
    return () => controller.abort()
  }, [])

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1>latihan</h1>
      <p>
        <code>GET /api/v1/exercises</code>
      </p>
      {probe.state === 'loading' && <p>Calling the API…</p>}
      {probe.state === 'answered' && (
        <>
          <p>
            Status <strong>{probe.status}</strong>
          </p>
          <pre>{probe.body}</pre>
        </>
      )}
      {probe.state === 'failed' && <p>Request failed: {probe.message}</p>}
    </main>
  )
}

export default App
