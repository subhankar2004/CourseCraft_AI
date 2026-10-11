// Keyboard pass (#38): presses Tab through key pages and flags every stop without a visible focus
// indicator (no outline or ring). Set up and run like audit.mjs: node tabwalk.mjs <repo>/.env <out-dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const env = Object.fromEntries(
  readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const out = process.argv[3];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function ctxFor(role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (role !== 'visitor') {
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000/login');
    await p.getByLabel('Email').fill(env[`SEED_${role.toUpperCase()}_EMAIL`]);
    await p.getByLabel('Password').fill(env[`SEED_${role.toUpperCase()}_PASSWORD`]);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/login'));
    await p.close();
  }
  return ctx;
}
const student = await ctxFor('student');
const lessonPath = await (async () => {
  const r = await student.request.get('http://localhost:4000/api/v1/courses/database-fundamentals');
  const c = await r.json();
  return `/learn/database-fundamentals/${c.modules[0].lessons[0].id}`;
})();
const runs = [
  ['visitor', '/'],
  ['visitor', '/courses/database-fundamentals'],
  ['visitor', '/login'],
  ['student', '/dashboard'],
  ['student', lessonPath],
  ['admin', '/admin/courses'],
];
const report = [];
const ctxs = { visitor: await ctxFor('visitor'), student, admin: await ctxFor('admin') };
for (const [role, path] of runs) {
  const page = await ctxs[role].newPage();
  await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (el.tagName === 'IFRAME')
        return { key: 'iframe', label: 'YouTube player iframe', visible: true, iframe: true };
      const cs = getComputedStyle(el);
      const ring =
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
        (cs.boxShadow && cs.boxShadow !== 'none');
      const label = (
        el.getAttribute('aria-label') ||
        el.textContent ||
        el.getAttribute('placeholder') ||
        el.tagName
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 50);
      const r = el.getBoundingClientRect();
      return {
        key: el.outerHTML.slice(0, 120),
        label,
        tag: el.tagName.toLowerCase(),
        visible: ring,
        offscreen: r.width === 0 || r.height === 0,
      };
    });
    if (!info) break;
    if (seen.has(info.key + info.label)) break; // wrapped around
    seen.add(info.key + info.label);
    stops.push(info);
    if (info.iframe) break; // focus moves into the cross-origin player
  }
  const missing = stops.filter((s) => !s.visible && !s.offscreen);
  report.push({
    role,
    path,
    stops: stops.length,
    missing: missing.map((m) => `${m.tag} "${m.label}"`),
  });
  console.log(
    `${path.padEnd(48)} ${String(stops.length).padStart(3)} stops; without a focus indicator: ${missing.length ? missing.map((m) => `${m.tag} "${m.label}"`).join(' | ') : 'none'}`,
  );
  console.log(
    '   first stops:',
    stops
      .slice(0, 4)
      .map((s) => s.label)
      .join(' → '),
  );
  await page.close();
}
writeFileSync(`${out}/tabwalk.json`, JSON.stringify(report, null, 1));
await browser.close();
