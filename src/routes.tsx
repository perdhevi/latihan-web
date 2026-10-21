import type { RouteObject } from 'react-router'
import { AppShell } from './app/AppShell'
import { ErrorPage, NotFound } from './app/ErrorPage'
import { Root } from './app/Root'
import { RequireAuth } from './auth/RequireAuth'
import { SignInPage } from './auth/SignInPage'
import { ActiveSessionPage } from './features/active-session/ActiveSessionPage'
import { IdeasPage } from './features/catalog/IdeasPage'
import { HomePage } from './features/dashboard/HomePage'
import { MeasurementPage, NewMeasurementPage } from './features/measurements/MeasurementPages'
import { NewPlanPage } from './features/plans/NewPlanPage'
import { PlanPage } from './features/plans/PlanPage'
import { PlansPage } from './features/plans/PlansPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { RequireProfile } from './features/profile/RequireProfile'
import { SessionEditPage } from './features/sessions/SessionEditPage'
import { SessionPage } from './features/sessions/SessionPage'
import { SessionsPage } from './features/sessions/SessionsPage'
import { WelcomePage } from './features/profile/WelcomePage'

/**
 * Every route of the app. Guards are layout routes: RequireAuth lets only a
 * signed-in user through, RequireProfile only one with a profile.
 *
 *   /sign-in                 anyone
 *   /welcome                 signed in, creates the profile
 *   everything else          signed in with a profile, inside the app shell
 */
export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/sign-in', element: <SignInPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/welcome', element: <WelcomePage /> },
          {
            element: <RequireProfile />,
            children: [
              {
                element: <AppShell />,
                children: [
                  {
                    // Inside the shell, so a failing page keeps the navigation.
                    errorElement: <ErrorPage />,
                    children: [
                      { path: '/', element: <HomePage /> },
                      { path: '/sessions', element: <SessionsPage /> },
                      { path: '/sessions/:id', element: <SessionPage /> },
                      { path: '/sessions/:id/edit', element: <SessionEditPage /> },
                      { path: '/session/active', element: <ActiveSessionPage /> },
                      { path: '/ideas', element: <IdeasPage /> },
                      { path: '/plans', element: <PlansPage /> },
                      { path: '/plans/new', element: <NewPlanPage /> },
                      { path: '/plans/:id', element: <PlanPage /> },
                      { path: '/profile', element: <ProfilePage /> },
                      { path: '/profile/measurements/new', element: <NewMeasurementPage /> },
                      { path: '/profile/measurements/:id', element: <MeasurementPage /> },
                      { path: '*', element: <NotFound /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]
