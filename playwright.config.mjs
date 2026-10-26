import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: {timeout: 5_000},
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    browserName: 'chromium',
    viewport: {width: 1280, height: 900},
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
