import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach } from 'vitest';

// jsdom does not implement scrollIntoView.
Element.prototype.scrollIntoView = () => undefined;

// Vitest globals are off, so RTL cannot register its automatic cleanup.
// Sonner keeps toasts in a module-level store and replays them to the next test's Toaster.
afterEach(() => {
  cleanup();
  toast.dismiss();
});
