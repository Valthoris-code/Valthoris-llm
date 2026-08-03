import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
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
      input: resolve(__dirname, 'index.html'),
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
