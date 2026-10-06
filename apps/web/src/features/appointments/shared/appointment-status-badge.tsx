import type { AppointmentStatus } from '@scheduling/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { statusPresentationOf, toneClassesOf } from './status-presentation';

export function AppointmentStatusBadge({ status }: { readonly status: AppointmentStatus }) {
  const { label, tone, icon: Icon } = statusPresentationOf(status);
  return (
    <Badge variant="secondary" className={cn('gap-1.5 px-2.5', toneClassesOf(tone))}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
