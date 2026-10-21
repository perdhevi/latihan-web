/** A route whose screen arrives in a later part of the build. */
export function Placeholder({ title, part, children }: { title: string; part: number; children: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{children}</p>
      <p className="hint">Arrives in Part {part}.</p>
    </section>
  )
}
