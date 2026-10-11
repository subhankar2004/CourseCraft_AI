import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  // Node by default; component tests opt into jsdom with a `@vitest-environment jsdom` docblock.
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
