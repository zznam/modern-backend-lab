import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4179);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Labs share a bounded server and some intentionally consume CPU.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      testMatch: '**/journey.spec.js',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start:prod',
    url: `${baseURL}/api/v1/ready`,
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    env: {
      HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test',
      DATABASE_URL: '', REDIS_URL: '',
    },
  },
});
