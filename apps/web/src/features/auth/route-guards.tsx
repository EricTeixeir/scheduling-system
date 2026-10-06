import type { Role, User } from '@scheduling/shared';
import type { ReactNode } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { homePathFor, PATHS } from '@/app/navigation';
import { FullScreenLoader } from '@/components/states/page-skeleton';
import { StatusMessage } from '@/components/states/status-message';
import { Button } from '@/components/ui/button';
import { messageFor } from '@/lib/errors/messages';

import { AuthenticatedUserContext, useAuthenticatedUser } from './authenticated-user';
import { useCurrentUser } from './use-current-user';
import { ForbiddenPage } from './forbidden-page';
import { pathAfterSignIn } from './return-path';

function SessionCheckFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="px-4">
      <StatusMessage
        icon={WifiOff}
        tone="destructive"
        title="Não foi possível verificar sua sessão"
        description={messageFor(error)}
        action={
          <Button onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Tentar novamente
          </Button>
        }
      />
    </div>
  );
}

function WhenSessionKnown({ children }: { readonly children: (user: User | null) => ReactNode }) {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser();
  if (isPending) return <FullScreenLoader />;
  if (isError) {
    return (
      <SessionCheckFailed
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  return children(user);
}

export function RequireAuth() {
  const location = useLocation();
  return (
    <WhenSessionKnown>
      {(user) => {
        if (user !== null) {
          return (
            <AuthenticatedUserContext value={user}>
              <Outlet />
            </AuthenticatedUserContext>
          );
        }
        const from = `${location.pathname}${location.search}${location.hash}`;
        return <Navigate to={PATHS.login} replace state={{ from }} />;
      }}
    </WhenSessionKnown>
  );
}

export function GuestOnly() {
  const location = useLocation();
  return (
    <WhenSessionKnown>
      {(user) =>
        user === null ? (
          <Outlet />
        ) : (
          <Navigate to={pathAfterSignIn(location.state, user.role)} replace />
        )
      }
    </WhenSessionKnown>
  );
}

export function RequireRole({ role }: { readonly role: Role }) {
  const user = useAuthenticatedUser();
  return user.role === role ? <Outlet /> : <ForbiddenPage />;
}

export function HomeRedirect() {
  const user = useAuthenticatedUser();
  return <Navigate to={homePathFor(user.role)} replace />;
}
