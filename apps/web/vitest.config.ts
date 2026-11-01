import { defineConfig } from 'vitest/config';

// `unit`: no external services. `db`: `*.db.test.ts` against a real Postgres 16 that Testcontainers
// starts once per run (needs Docker); `pnpm test --project unit` skips it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.db.test.ts'],
        },
      },
      {
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['src/server/db/test/global-setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
