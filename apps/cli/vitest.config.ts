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
      // (37.4 statements / 28.2 branches / 35.8 functions / 37.7 lines) so
      // normal platform drift does not fail CI, and moves up as tests land.
      thresholds: {
        'src/commands/**': {
          statements: 36,
          branches: 26,
          functions: 34,
          lines: 36,
        },
      },
    },
  },
});
