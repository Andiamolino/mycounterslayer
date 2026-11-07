import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Abort with an error instead of waiting silently on a hang.
  // globalTimeout: whole run (159 tests take a few minutes on a free system).
  globalTimeout: 15 * 60 * 1000,
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    // Covers build + preview start (default 60 s is too tight for a cold build under load).
    timeout: 180 * 1000
  },
  // Default (half the cores = 7 workers) saturates the 14-core machine (load 20-30): software-rendered
  // WebGL + geometry workers starve the browsers, single key presses take seconds and the 30 s test
  // budget is exceeded (D10, TD3, D2 flaked). 4 workers: stable and nearly as fast.
  workers: 4,
  testDir: 'e2e'
});
