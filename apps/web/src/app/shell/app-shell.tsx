import { lazy, Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { Brand } from '@/components/brand';
import { AppErrorBoundary } from '@/components/error-boundary/app-error-boundary';
import { ThemeToggle } from '@/components/theme-toggle';
import { useLogout } from '@/features/auth/use-auth-mutations';
import { useAuthenticatedUser } from '@/features/auth/authenticated-user';
import { useMediaQuery } from '@/hooks/use-media-query';

import { PATHS } from '../navigation';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { UserMenu } from './user-menu';

const AppDotGrid = lazy(() => import('@/components/backgrounds/app-dot-grid'));
const DOT_GRID_MEDIA =
  '(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export function AppShell() {
  const user = useAuthenticatedUser();
  const { pathname } = useLocation();
  const logoutMutation = useLogout();
  const showDotGrid = useMediaQuery(DOT_GRID_MEDIA);
  const logout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {showDotGrid ? (
        <div className="pointer-events-none fixed inset-0" aria-hidden="true">
          <Suspense fallback={null}>
            <AppDotGrid />
          </Suspense>
        </div>
      ) : null}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <div className="md:hidden">
            <MobileNav user={user} onLogout={logout} loggingOut={logoutMutation.isPending} />
          </div>
          <Link
            to={PATHS.home}
            aria-label="Página inicial"
            className="flex min-h-11 items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Brand />
          </Link>
          <nav aria-label="Principal" className="ml-6 hidden md:block">
            <NavLinks role={user.role} orientation="horizontal" />
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="hidden md:block">
              <UserMenu user={user} onLogout={logout} loggingOut={logoutMutation.isPending} />
            </div>
          </div>
        </div>
      </header>
      <main
        id="conteudo"
        className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10"
      >
        <AppErrorBoundary scope="page" resetKeys={[pathname]}>
          <Outlet />
        </AppErrorBoundary>
      </main>
    </div>
  );
}
