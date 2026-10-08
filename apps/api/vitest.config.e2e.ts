import { defineConfig } from 'vitest/config';
import { testEnv } from './vitest.config.js';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: testEnv,
  },
});
