import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4179);
const remoteURL = process.env.E2E_BASE_URL?.trim();
let baseURL = `http://127.0.0.1:${port}`;
if (remoteURL) {
  let target;
  try { target = new URL(remoteURL); }
  catch { throw new Error('E2E_BASE_URL must be an HTTPS origin, for example https://your-lab.vercel.app.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('E2E_BASE_URL must be an HTTPS origin without credentials, a path, query parameters, or a fragment.');
  }
  baseURL = target.origin;
}

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
  globalSetup: remoteURL ? './tests/e2e/remote-setup.js' : undefined,
  outputDir: remoteURL ? 'test-results-live' : 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: remoteURL ? 'playwright-report-live' : 'playwright-report' }]],
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
  webServer: remoteURL ? undefined : {
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
