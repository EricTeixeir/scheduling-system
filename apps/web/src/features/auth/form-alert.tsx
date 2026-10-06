import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';

export function FormAlert({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
