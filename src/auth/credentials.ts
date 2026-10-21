import { isApiError } from '../api/errors'

export type CredentialsMode = 'signIn' | 'register'

// The contract's limits (Credentials in openapi.yaml). The server counts
// characters as Unicode code points, so a string's .length (UTF-16 units)
// would count an emoji twice.
const maxEmail = 254
const minPassword = 12
const maxPassword = 128

const characters = (value: string) => [...value].length

/**
 * A quick check before calling the API, so an obvious mistake does not cost a
 * round trip (or a login attempt toward the lockout). The server stays
 * authoritative. Returns the message to show, or null.
 */
export function checkCredentials(mode: CredentialsMode, email: string, password: string): string | null {
  const trimmed = email.trim()
  if (trimmed === '') return 'Enter your email address.'
  if (characters(trimmed) > maxEmail) return `An email address has at most ${maxEmail} characters.`
  if (password === '') return 'Enter your password.'
  // Signing in with an old, shorter password should still reach the server.
  if (mode === 'register') {
    const length = characters(password)
    if (length < minPassword || length > maxPassword) {
      return `Choose a password of ${minPassword} to ${maxPassword} characters.`
    }
  }
  return null
}

/** The message for a failed sign-in or registration. */
export function describeAuthError(error: unknown): string {
  if (isApiError(error, 'rate_limited')) {
    return error.retryAfter === undefined
      ? 'Too many attempts. Wait a moment and try again.'
      : `Too many attempts. Try again in ${waitTime(error.retryAfter)}.`
  }
  if (isApiError(error, 'invalid_credentials')) {
    return 'Wrong email or password. After five failed attempts the account is locked for 15 minutes.'
  }
  if (isApiError(error, 'email_taken')) return 'An account with this email already exists. Sign in instead.'
  if (isApiError(error)) return error.message
  return 'Something went wrong. Try again.'
}

function waitTime(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}
