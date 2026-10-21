import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { isApiError } from '../api/errors'

/**
 * Shown when a page fails to render, including a failed API call a page
 * cannot handle itself. An API failure shows the request ID, so a report can
 * be matched to the server log.
 */
export function ErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  return (
    <section className="error-page" role="alert">
      <h1>Something went wrong</h1>
      {isApiError(error) ? (
        <>
          <p>{error.message}</p>
          <dl>
            <dt>Status</dt>
            <dd>{error.status === 0 ? 'no response' : error.status}</dd>
            <dt>Code</dt>
            <dd>
              <code>{error.code}</code>
            </dd>
            {error.requestId !== undefined && (
              <>
                <dt>Request ID</dt>
                <dd>
                  <code>{error.requestId}</code>
                </dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p>The page could not be shown.</p>
      )}
      <p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </p>
    </section>
  )
}

export function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to Home</Link>
      </p>
    </section>
  )
}
