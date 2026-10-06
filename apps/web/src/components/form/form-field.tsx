import { useId, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
}

interface FormFieldProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error === undefined ? undefined : errorId, hint === undefined ? undefined : hintId]
      .filter((value) => value !== undefined)
      .join(' ') || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': error !== undefined, 'aria-describedby': describedBy })}
      {hint === undefined || error !== undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
