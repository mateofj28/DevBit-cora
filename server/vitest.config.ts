import { defineConfig } from 'vitest/config';

export default defineConfig({
  // PGlite (PostgreSQL en WASM) tarda unos segundos en arrancar, sobre todo con varios archivos en paralelo.
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
