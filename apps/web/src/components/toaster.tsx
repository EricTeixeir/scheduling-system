import { Toaster as SonnerToaster } from 'sonner';

import { useTheme } from '@/lib/theme/theme-context';

export function Toaster() {
  const { theme } = useTheme();

  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'font-sans' } }}
    />
  );
}
