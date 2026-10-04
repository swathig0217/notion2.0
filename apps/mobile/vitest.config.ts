import { defineConfig } from 'vitest/config';

// Logic-only tests (no React Native runtime). UI flows are covered by Playwright.
export default defineConfig({
  test: {
    name: 'mobile',
    include: ['src/**/*.test.ts'],
  },
});
