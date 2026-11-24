import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Démarre une base PostgreSQL et une base MongoDB éphémères (Testcontainers) pour toute la campagne.
    globalSetup: ['./test/support/base-de-test.global-setup.ts'],
    setupFiles: ['./test/support/base-de-test.setup.ts'],
    // Les fichiers partagent la même base : en parallèle, leurs données se mélangeraient.
    fileParallelism: false,
    // Le premier lancement télécharge les images PostgreSQL et MongoDB.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
