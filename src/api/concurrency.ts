import { useCallback, useRef, useState } from 'react'

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

/**
 * Idempotency keys for a form that may send different bodies: the same body
 * always gets the same key, for as long as the form is open. A retry is
 * replayed; an edited body is a new request with a new key (the server
 * refuses a key reused with another body); and an edit that is undone gets
 * its first key back, in case that request was saved and only its response
 * lost.
 */
export function useIdempotencyKeys(): (body: unknown) => string {
  const keys = useRef(new Map<string, string>())
  return useCallback((body: unknown) => {
    const text = JSON.stringify(body)
    let key = keys.current.get(text)
    if (key === undefined) {
      key = crypto.randomUUID()
      keys.current.set(text, key)
    }
    return key
  }, [])
}

/**
 * A record and the version it was read at: the `ETag` of the response that
 * carried it. The tag is opaque; the client only ever sends it back.
 * List items carry no ETag, so a record is read on its own before a write.
 */
export type Versioned<T> = { data: T; etag: string | null }

/**
 * The `If-Match` header for a write based on a read at `etag`. The server
 * applies the write only if the record is still at that version, and
 * otherwise answers `412 precondition_failed` instead of overwriting.
 */
export function ifMatch(etag: string | null): { 'If-Match'?: string } {
  return etag === null ? {} : { 'If-Match': etag }
}
