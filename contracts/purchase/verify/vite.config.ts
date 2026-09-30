import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// @midnight-ntwrk/compact-runtime loads its WebAssembly core through an ES
// module import of a .wasm file, which vite-plugin-wasm makes loadable in the
// browser. `dedupe` keeps a single copy of the runtime in the page.
export default defineConfig({
  // Relative asset paths, so the built page also works from a subdirectory.
  base: './',
  plugins: [wasm()],
  resolve: {
    dedupe: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
