import { createBrowserRouter, type RouteObject } from 'react-router';

import { RouterErrorFallback } from '@/components/error-boundary/router-error-fallback';
import { AdminAppointmentsPage } from '@/features/appointments/admin/admin-appointments-page';
import { BookPage } from '@/features/appointments/booking/book-page';
import { MyAppointmentsPage } from '@/features/appointments/my-appointments/my-appointments-page';
import { AuthLayout } from '@/features/auth/auth-layout';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { GuestOnly, HomeRedirect, RequireAuth, RequireRole } from '@/features/auth/route-guards';
import { ScheduleBlocksPage } from '@/features/schedule-blocks/schedule-blocks-page';

import { PATHS } from './navigation';
import { NotFoundPage } from './pages/not-found-page';
import { AppShell } from './shell/app-shell';

export const routes: RouteObject[] = [
  {
    errorElement: <RouterErrorFallback />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: PATHS.login, element: <LoginPage /> },
              { path: PATHS.register, element: <RegisterPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomeRedirect /> },
              {
                element: <RequireRole role="CLIENT" />,
                children: [
                  { path: PATHS.book, element: <BookPage /> },
                  { path: PATHS.myAppointments, element: <MyAppointmentsPage /> },
                ],
              },
              {
                element: <RequireRole role="ADMIN" />,
                children: [
                  { path: PATHS.admin, element: <AdminAppointmentsPage /> },
                  { path: PATHS.scheduleBlocks, element: <ScheduleBlocksPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
