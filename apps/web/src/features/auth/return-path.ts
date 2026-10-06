import type { Role } from '@scheduling/shared';

import { homePathFor, isAreaOf } from '@/app/navigation';

interface RedirectState {
  readonly from?: unknown;
}

// Only same-app absolute paths: "//evil.example" would be read as a protocol-relative URL.
function safeReturnPath(state: unknown): string | undefined {
  const from = (state as RedirectState | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return undefined;
  return from;
}

export function pathAfterSignIn(state: unknown, role: Role): string {
  const from = safeReturnPath(state);
  return from !== undefined && isAreaOf(role, from) ? from : homePathFor(role);
}
