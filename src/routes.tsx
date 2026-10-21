import type { RouteObject } from 'react-router'
import { AppShell } from './app/AppShell'
import { ErrorPage, NotFound } from './app/ErrorPage'
import { Placeholder } from './app/Placeholder'
import { Root } from './app/Root'
import { RequireAuth } from './auth/RequireAuth'
import { SignInPage } from './auth/SignInPage'
import { IdeasPage } from './features/catalog/IdeasPage'
import { HomePage } from './features/dashboard/HomePage'
import { NewPlanPage } from './features/plans/NewPlanPage'
import { PlanPage } from './features/plans/PlanPage'
import { PlansPage } from './features/plans/PlansPage'
import { RequireProfile } from './features/profile/RequireProfile'
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
                      {
                        path: '/sessions',
                        element: <Placeholder title="Sessions" part={7}>Your previous sessions, newest first.</Placeholder>,
                      },
                      {
                        path: '/sessions/:id',
                        element: <Placeholder title="Session" part={7}>What you did, next to what was planned.</Placeholder>,
                      },
                      {
                        path: '/session/active',
                        element: <Placeholder title="Session in progress" part={6}>The workout you are recording.</Placeholder>,
                      },
                      { path: '/ideas', element: <IdeasPage /> },
                      { path: '/plans', element: <PlansPage /> },
                      { path: '/plans/new', element: <NewPlanPage /> },
                      { path: '/plans/:id', element: <PlanPage /> },
                      {
                        path: '/profile',
                        element: <Placeholder title="Profile" part={9}>Your name and body measurements.</Placeholder>,
                      },
                      {
                        path: '/profile/measurements/new',
                        element: <Placeholder title="New measurement" part={9}>Record a body measurement.</Placeholder>,
                      },
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
