import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // Production is served from the root of the custom domain
  // (https://valthoris.com/ — see the CNAME file), so root-absolute asset
  // URLs are correct and are the only ones that stay valid for *every*
  // route depth, including nested deep links such as "/lookup/phone".
  //
  // Override with VITE_BASE_PATH (e.g. "/Valthoris-llm/") when publishing to
  // a GitHub Pages project sub-path instead of the custom domain.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      // Allow `import ... from 'declarations/backend'` in TypeScript
      declarations: resolve(__dirname, '../../declarations'),
    },
  },
  // Prevent Vite from obfuscating BigInt serialisation
  define: {
    global: 'globalThis',
  },
  build: {
    outDir:    'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        // GitHub Pages serves 404.html for any path that is not a real file.
        // Building it from the same template as index.html makes deep links
        // (e.g. /lookup/phone) boot the SPA directly at the requested URL,
        // instead of bouncing through a redirect that can loop forever.
        main:     resolve(__dirname, 'index.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
  server: {
    // Proxy canister calls to local dfx replica during development
    proxy: {
      '/api': {
        target:      'http://127.0.0.1:4943',
        changeOrigin: true,
      },
    },
  },
});
