import { useCallback, useState } from 'react'

/**
 * A key for the `Idempotency-Key` header of one intended create. The server
 * replays the first response to a retry with the same key and body, so a
 * create whose response was lost cannot run twice.
 *
 * The key is made when the form opens and kept across retries. Call `renew()`
 * when the body changes (the server answers 422 to a key reused with another
 * body) and after a success, so the next, separate create gets its own key.
 */
export function useIdempotencyKey(): { key: string; renew: () => void } {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const renew = useCallback(() => setKey(crypto.randomUUID()), [])
  return { key, renew }
}
