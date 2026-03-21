import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';

// Parse server/.env to get ports without requiring dotenv as a root dep
function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; }),
  );
}

const serverEnv = readEnvFile('./server/.env');
const SERVER_PORT = serverEnv.PORT || process.env.PORT || '3001';
const CLIENT_PORT = serverEnv.CLIENT_PORT || process.env.CLIENT_PORT || '5173';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start server + client automatically before running tests.
  // reuseExistingServer:true means: if the port is already listening, skip starting.
  webServer: [
    {
      command: 'npm run dev --prefix server',
      url: `http://localhost:${SERVER_PORT}/api/projects`,
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      command: 'npm run dev --prefix client',
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: true,
      timeout: 25_000,
    },
  ],
});

