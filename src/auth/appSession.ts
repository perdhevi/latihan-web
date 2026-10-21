import { createSession } from './session'
import { browserStorage, createTokenStore } from './tokens'

/** The app's one session. Its refresh token is kept in sessionStorage. */
export const session = createSession({ tokens: createTokenStore(browserStorage()) })

/** The authenticated API client every feature uses. */
export const api = session.api
