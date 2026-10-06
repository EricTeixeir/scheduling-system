import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';

import { Brand } from '@/components/brand';
import { AppErrorBoundary } from '@/components/error-boundary/app-error-boundary';
import { ThemeToggle } from '@/components/theme-toggle';

const LoginGalaxy = lazy(() => import('@/components/backgrounds/login-galaxy'));
const supportsWebGl = typeof window.WebGLRenderingContext === 'function';

export function AuthLayout() {
  const { pathname } = useLocation();

  return (
    <div className="relative flex min-h-dvh flex-col bg-linear-to-b from-accent/70 via-background to-background">
      {supportsWebGl ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <Suspense fallback={null}>
            <LoginGalaxy />
          </Suspense>
        </div>
      ) : null}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>
      <main className="relative flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Brand />
          </div>
          <AppErrorBoundary scope="auth-page" resetKeys={[pathname]}>
            <Outlet />
          </AppErrorBoundary>
        </div>
      </main>
    </div>
  );
}
