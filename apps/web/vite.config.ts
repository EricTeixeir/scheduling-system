import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

// `vite --mode https` serves the dev server over a self-signed certificate. The session cookies
// are Secure, so a phone on the LAN (not localhost) only keeps them over HTTPS.
export default defineProject(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'https' ? [basicSsl()] : [])],
  resolve: { tsconfigPaths: true },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Same-origin through the proxy, so the HttpOnly cookies need no CORS setup in development.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
