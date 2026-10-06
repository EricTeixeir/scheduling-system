import { cn } from '@/lib/utils';

import { initialsOf } from './initials';

export function UserAvatar({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
