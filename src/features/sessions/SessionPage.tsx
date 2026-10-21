import { Link, useParams } from 'react-router'

/** `/sessions/:id`. Part 7 shows the session next to its plan; until then, a way to correct it. */
export function SessionPage() {
  const { id = '' } = useParams()
  return (
    <section>
      <h1>Session</h1>
      <p>What you did, next to what was planned.</p>
      <p className="hint">Arrives in Part 7.</p>
      <p>
        <Link to={`/sessions/${id}/edit`}>Edit this session</Link>
      </p>
    </section>
  )
}
