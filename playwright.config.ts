import { defineConfig } from '@playwright/test'

/**
 * End-to-end: a real browser against the production image (docker compose,
 * http://localhost:8088) and the real API behind it. E2E_BASE_URL points it
 * elsewhere, e.g. the dev server (http://localhost:5173).
 *
 * Locally it drives the installed Chrome (no browser download); CI installs
 * Playwright's Chromium.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  // A real API and a real browser: a failure is worth reading, not retrying.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8088',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
})
