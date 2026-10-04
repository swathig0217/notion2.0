import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'editor',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
