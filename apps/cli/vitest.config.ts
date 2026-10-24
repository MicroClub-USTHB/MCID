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
      // old suite tested. The floor moved up with the review tests; it sits
      // one point under the measured CI run and moves again as tests land.
      thresholds: {
        'src/commands/**': {
          statements: 36,
          branches: 26,
          functions: 36,
          lines: 36,
        },
      },
    },
  },
});
