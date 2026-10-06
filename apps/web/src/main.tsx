import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';
import { AppErrorBoundary } from './components/error-boundary/app-error-boundary';
import { installGlobalErrorHandlers } from './lib/global-error-handlers';

installGlobalErrorHandlers();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const router = createAppRouter();

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary scope="root" layout="screen">
      <AppProviders router={router} />
    </AppErrorBoundary>
  </StrictMode>,
);
