import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/attachment-quiz',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: 'quiz-test-results',
  reporter: [['list'], ['html', { outputFolder: 'quiz-playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.QUIZ_BASE_URL || 'https://quiz.mtechcorpja.com',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
