import { CalendarClock } from 'lucide-react';

import { cn } from '@/lib/utils';

const BRAND_NAME = 'Agendo';

export function Brand({ className }: { readonly className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <CalendarClock className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="text-lg">{BRAND_NAME}</span>
    </span>
  );
}
