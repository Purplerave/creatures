import { defineConfig } from 'vite';

// Config mínima de Fase 0: Vite sirve index.html y empaqueta src/main.ts.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
