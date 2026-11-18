import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Command tests run real commander programs; give them room for the
    // occasional listener/polling round-trip without flaking CI.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // The command surface must stay covered, not just the lib/ helpers the
      // old suite tested. Each floor sits ~1.5pt under the measured run
      // (46.2 statements / 36.8 branches / 43.3 functions / 46.6 lines) so
      // normal platform drift does not fail CI, and moves up as tests land.
      thresholds: {
        'src/commands/**': {
          statements: 44,
          branches: 35,
          functions: 41,
          lines: 44,
        },
      },
    },
  },
});
