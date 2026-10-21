import { useMe } from '../profile/api'

export function HomePage() {
  const me = useMe()
  return (
    <section>
      <h1>Hi, {me.data?.display_name}</h1>
      <p>This week's totals, recent sessions and a Start button come here.</p>
      <p className="hint">Arrives in Part 8.</p>
    </section>
  )
}
