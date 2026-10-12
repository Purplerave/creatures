import { defineConfig } from 'vite';

// Vite sirve index.html y empaqueta src/main.ts; el preview usa un host generado por la plataforma.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
