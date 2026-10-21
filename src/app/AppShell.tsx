import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { ActiveSessionProvider } from '../features/active-session/ActiveSessionProvider'
import { useMe } from '../features/profile/api'

// Mobile's five destinations, in the same order.
const destinations = [
  { to: '/', label: 'Home', end: true },
  { to: '/sessions', label: 'Sessions', end: false },
  { to: '/ideas', label: 'Ideas', end: false },
  { to: '/plans', label: 'Plans', end: false },
  { to: '/profile', label: 'Profile', end: false },
]

/**
 * The frame around every signed-in page: a top bar, and the navigation as a
 * side bar on wide screens or a bottom bar under 640px (see index.css).
 */
export function AppShell() {
  const { signOut } = useAuth()
  const me = useMe()
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">latihan</span>
        <span className="who">{me.data?.display_name}</span>
        <button type="button" className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <nav className="nav" aria-label="Main">
        {destinations.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        {/* The profile gate has loaded `me`; the draft is kept per user. */}
        {me.data !== undefined && (
          <ActiveSessionProvider key={me.data.id} userId={me.data.id}>
            <Outlet />
          </ActiveSessionProvider>
        )}
      </main>
    </div>
  )
}
