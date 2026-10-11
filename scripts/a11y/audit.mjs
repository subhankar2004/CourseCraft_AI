// Accessibility and responsiveness audit (#38). Opens every page as a visitor, a student and an
// admin, at 360, 768 and 1280 px (and dark mode at 1280), reports horizontal overflow and runs
// axe-core (WCAG 2.0/2.1/2.2 A and AA, plus best practices). Against a production build:
//
//   pnpm build && pnpm --filter web exec next start -p 3000   # with the API on :4000
//   mkdir -p /tmp/a11y && cd /tmp/a11y && npm i playwright-core axe-core   # tools stay outside the repo
//   cp <repo>/scripts/a11y/*.mjs .    # imports resolve next to the script, so run it from there
//   node audit.mjs <repo>/.env <out-dir> [path-filter]
//
// Needs Google Chrome and the SEED_* accounts in .env. Writes <out-dir>/audit.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const env = Object.fromEntries(
  readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const out = process.argv[3];
const only = process.argv[4]; // optional path filter
const base = 'http://localhost:3000';
const api = 'http://localhost:4000/api/v1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function session(email, password) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${base}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}
const states = {
  visitor: await session(),
  student: await session(env.SEED_STUDENT_EMAIL, env.SEED_STUDENT_PASSWORD),
  admin: await session(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD),
};
// Ids for dynamic routes, read through the API as the admin.
const adminCtx = await browser.newContext({ storageState: states.admin });
const get = async (path) => (await adminCtx.request.get(`${api}/${path}`)).json();
const db = await get('courses/database-fundamentals');
const lesson1 = db.modules[0].lessons[0].id;
const adminCourses = await get('admin/courses');
const generated =
  adminCourses.find((c) => c.slug === 'web-development-fundamentals') ?? adminCourses[0];
const generatedDetail = await get(`admin/courses/${generated.id}`);
const jobId = generatedDetail.latestJob?.id;
await adminCtx.close();

const pages = [
  ['visitor', '/', 'Landing'],
  ['visitor', '/domains', 'Domains'],
  ['visitor', '/domains/database-systems', 'Domain'],
  ['visitor', '/courses/database-fundamentals', 'Course'],
  ['visitor', '/login', 'Sign in'],
  ['visitor', '/register', 'Register'],
  ['visitor', '/no-such-page', 'Not found'],
  ['student', '/courses/database-fundamentals', 'Course (student)'],
  ['student', '/dashboard', 'Dashboard'],
  ['student', `/learn/database-fundamentals/${lesson1}`, 'Lesson'],
  ['student', '/forbidden', 'Forbidden'],
  ['admin', '/admin/courses', 'Admin courses'],
  ['admin', '/admin/courses/new', 'Admin new course'],
  ['admin', `/admin/courses/${generated.id}`, 'Admin course review'],
  ['admin', `/admin/lessons/${generatedDetail.modules[0].lessons[0].id}`, 'Admin lesson editor'],
  ['admin', '/admin/domains', 'Admin domains'],
  ...(jobId ? [['admin', `/admin/jobs/${jobId}`, 'Admin job']] : []),
].filter(([, path]) => !only || path.includes(only));

const widths = [360, 768, 1280];
const results = [];
for (const [role, path, name] of pages) {
  for (const width of widths) {
    for (const scheme of width === 1280 ? ['light', 'dark'] : ['light']) {
      const ctx = await browser.newContext({
        storageState: states[role],
        viewport: { width, height: 900 },
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const clipped = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o !== 'visible') return true;
          }
          return false;
        };
        const offenders = [...document.body.querySelectorAll('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > vw + 1 && !clipped(el);
          })
          .slice(0, 5)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').slice(0, 3).join('.')} (${Math.round(el.getBoundingClientRect().right)}px)`,
          );
        return {
          scroll:
            document.documentElement.scrollWidth > vw + 1
              ? document.documentElement.scrollWidth - vw
              : 0,
          offenders,
        };
      });
      let axe = null;
      if (width !== 768) {
        await page.addScriptTag({ content: axeSource });
        axe = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
            },
            resultTypes: ['violations'],
          });
          return r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.slice(0, 4).map((n) => ({
              target: n.target.join(' '),
              summary: n.failureSummary?.split('\n').slice(0, 3).join(' '),
            })),
            count: v.nodes.length,
          }));
        });
      }
      results.push({ name, role, path, width, scheme, overflow, axe });
      const flag =
        (overflow.scroll
          ? ` OVERFLOW +${overflow.scroll}px ${overflow.offenders.join(', ')}`
          : '') +
        (axe?.length ? ` AXE: ${axe.map((v) => `${v.id}(${v.impact},${v.count})`).join(' ')}` : '');
      console.log(
        `${name.padEnd(22)} ${String(width).padStart(4)} ${scheme.padEnd(5)}${flag || ' ok'}`,
      );
      await ctx.close();
    }
  }
}
writeFileSync(`${out}/audit.json`, JSON.stringify(results, null, 1));
await browser.close();
