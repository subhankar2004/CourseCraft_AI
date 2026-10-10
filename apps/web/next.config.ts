import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';

/**
 * The monorepo shares one .env at the repo root (docs/setup.md), but Next.js only reads .env
 * files from the app directory. Read the root file here and pass its browser-safe NEXT_PUBLIC_*
 * values through `env`, which Next.js inlines into the client bundle. Variables already set in
 * the real environment (CI, Docker, hosting) take precedence over the file.
 */
function rootPublicEnv(): Record<string, string> {
  const file = resolve(import.meta.dirname, '../../.env');
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const merged = { ...fromFile, ...process.env };
  return Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('NEXT_PUBLIC_') && typeof entry[1] === 'string',
    ),
  );
}

const nextConfig: NextConfig = {
  env: rootPublicEnv(),
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // Course thumbnails come from YouTube's image CDN.
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' }],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
