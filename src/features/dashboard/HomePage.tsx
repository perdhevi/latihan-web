import { StartSession } from '../active-session/StartSession'
import { useMe } from '../profile/api'

export function HomePage() {
  const me = useMe()
  return (
    <section>
      <h1>Hi, {me.data?.display_name}</h1>
      {/* Not a <p>: the start dialog inside holds headings and blocks. */}
      <div className="actions">
        <StartSession />
      </div>
      <p>This week's totals and recent sessions come here.</p>
      <p className="hint">Arrives in Part 8.</p>
    </section>
  )
}
