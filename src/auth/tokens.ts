import type { components } from '../api/schema'

type TokenResponse = components['schemas']['TokenResponse']

/** The part of the Web Storage API the store needs, so tests can pass a fake. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * The session's tokens. The access token lives only in memory: a reload drops
 * it and the next request fetches a new one. The refresh token is also written
 * to storage (sessionStorage in the browser) so the session survives a reload
 * but not the tab.
 */
export interface TokenStore {
  readonly access: string | null
  readonly refresh: string | null
  set(tokens: Pick<TokenResponse, 'access_token' | 'refresh_token'>): void
  clear(): void
  /** Called after every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export const refreshTokenKey = 'latihan.refresh_token'

/**
 * sessionStorage, or null where it does not exist (Node) or the browser
 * refuses it (blocked site data throws a SecurityError on access).
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/**
 * A token store backed by `storage`. Storage failures are ignored: the session
 * then lasts only until the next reload, which is the memory-only behaviour.
 */
export function createTokenStore(storage: KeyValueStorage | null): TokenStore {
  let access: string | null = null
  let refresh: string | null = null
  try {
    refresh = storage?.getItem(refreshTokenKey) ?? null
  } catch {
    refresh = null
  }
  const listeners = new Set<() => void>()

  function update(nextAccess: string | null, nextRefresh: string | null) {
    access = nextAccess
    refresh = nextRefresh
    try {
      if (nextRefresh === null) storage?.removeItem(refreshTokenKey)
      else storage?.setItem(refreshTokenKey, nextRefresh)
    } catch {
      // Quota or privacy settings; memory still holds the session.
    }
    for (const listener of listeners) listener()
  }

  return {
    get access() {
      return access
    },
    get refresh() {
      return refresh
    },
    set: (tokens) => update(tokens.access_token, tokens.refresh_token),
    clear: () => update(null, null),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** An in-memory KeyValueStorage, for tests and as a stand-in for a reload. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  readonly items: Map<string, string>
} {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
  }
}
