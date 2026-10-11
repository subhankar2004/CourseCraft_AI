# Accessibility and responsiveness audit (P4, Issue #38)

Audit of the web app before the chat is added, on 2026-10-11, against a **production build** (`next start`) with the seeded data. Raw results: [2026-10-11-results.json](2026-10-11-results.json). Scripts: [`scripts/a11y/`](../../scripts/a11y/).

## Method

| What            | How                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages           | 17 views: landing, domains, a domain, a course (visitor and student), sign in, register, not found, forbidden, dashboard, a lesson, and the six admin pages (courses, new course, course review, lesson editor, domains, a generation job) |
| Widths          | 360, 768 and 1280 px; dark mode at 1280 px (68 page × width × theme combinations)                                                                                                                                                          |
| Overflow        | Horizontal page scroll, and the elements past the viewport's right edge that no ancestor clips                                                                                                                                             |
| Automated rules | axe-core 4.14.0, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice` (WCAG 2.2 AA [R105]); at 360 px and 1280 px (light and dark)                                                                                 |
| Lighthouse      | 13.5.0, accessibility, best practices and SEO, mobile and desktop presets, on the landing, course and lesson pages (the lesson page signed in as the seed student)                                                                         |
| Keyboard        | Tab through six key pages (landing, course, sign in, dashboard, lesson, admin courses); every stop must show a focus indicator (outline or ring)                                                                                           |
| Browser         | Google Chrome 154, headless, driven by playwright-core                                                                                                                                                                                     |

## Findings and fixes

| Finding (first run)                                                                                   | Where                                       | Cause                                                                                                                                                                    | Fix                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `color-contrast` (serious): 4.34:1, needs 4.5:1                                                       | Small muted chips (domain page, admin list) | shadcn's `--muted-foreground` (oklch 0.556, #737373) on `--muted` (#f5f5f5)                                                                                              | Light theme `--muted-foreground` → oklch 0.52 (≈ 5.0:1 on muted, 5.5:1 on white); dark theme already passed                      |
| `page-has-heading-one` (moderate)                                                                     | Sign in, register                           | The card title is a `div`                                                                                                                                                | The title is an `h1`                                                                                                             |
| `label-content-name-mismatch` (serious)                                                               | Every signed-in page                        | The account button's `aria-label` ("Account menu for …") didn't contain its visible text (initials)                                                                      | Named by its content: initials hidden from assistive technology, the name visible from 640 px and screen-reader-only below       |
| `scrollable-region-focusable` (serious)                                                               | Code blocks in notes                        | A wide `pre` scrolls sideways but can't be focused, so keyboard users can't scroll it (WCAG 2.1.1)                                                                       | `tabIndex={0}` with a focus ring; the copy button is always visible on touch screens (`pointer-coarse`), where there is no hover |
| Page scrolls sideways by 164–347 px                                                                   | Admin job, course review (360 and 768 px)   | Vertical stacks written `grid gap-*` have one implicit `auto` column, which can't shrink below its widest child; a `truncate` title (no wrapping) is as wide as its text | `grid-cols-1` (`minmax(0, 1fr)`) on those stacks                                                                                 |
| Page scrolls sideways by 139 px                                                                       | Admin domains (360 px)                      | The table scrolls inside `overflow-x-auto`, but its `sr-only` "Actions" header is absolutely positioned against an ancestor outside the scroll box, so nothing clips it  | `relative` on the scroll box (also the admin courses table)                                                                      |
| Lesson titles cut to three letters                                                                    | Course review outline (360 px)              | The "Move to module…" select and move buttons share one line with the title                                                                                              | Rows wrap: the title keeps at least 8 rem, the controls move to a second line                                                    |
| The first Tab on a lesson page skipped the header and landed after the current lesson (keyboard walk) | Lesson page                                 | The sidebar scrolled the current lesson with `scrollIntoView`, which in Chrome also moved the sequential focus navigation starting point                                 | The sidebar scrolls its own container instead; a test asserts `scrollIntoView` isn't used                                        |
| No way to skip the header and sidebar                                                                 | Every page                                  | No bypass link                                                                                                                                                           | "Skip to main content" as the first Tab stop; `main` takes the focus (WCAG 2.4.1)                                                |

## Results after the fixes

**Overflow and axe:** all 68 combinations pass, with no horizontal scroll and no axe violation, in light and dark.

**Lighthouse** (accessibility · best practices · SEO):

| Page                                    | Mobile          | Desktop         |
| --------------------------------------- | --------------- | --------------- |
| Landing `/`                             | 100 · 100 · 100 | 100 · 100 · 100 |
| Course `/courses/database-fundamentals` | 100 · 100 · 100 | 100 · 100 · 100 |
| Lesson `/learn/database-fundamentals/…` | 100 · 96 · 100  | 100 · 96 · 100  |

The issue asked for at least 90 for accessibility. The lesson page's 96 for best practices is one `inspector-issues` entry: a cookie warning raised inside YouTube's embedded player (`youtube-nocookie.com`), outside the app's control.

**Keyboard:** every stop on the six pages shows a focus indicator. Each page starts with "Skip to main content", then the header. On the lesson page the order is sidebar, player, then lesson controls and notes.

## Limits

- Automated tools find only part of all accessibility problems. No manual screen-reader session (VoiceOver, NVDA) was run for this pass.
- axe can't look inside the cross-origin YouTube iframe; the player's own controls are YouTube's.
- Lighthouse scores are for one run each on a local machine; accessibility and best-practice audits are deterministic, unlike performance, which wasn't measured.

## Reproduce

```bash
pnpm build && pnpm --filter web exec next start -p 3000   # API on :4000, seeded database
mkdir -p /tmp/a11y && cd /tmp/a11y && npm i playwright-core axe-core lighthouse
cp <repo>/scripts/a11y/*.mjs .
node audit.mjs <repo>/.env out      # overflow + axe, every page
node tabwalk.mjs <repo>/.env out    # keyboard focus indicators
npx lighthouse http://localhost:3000/ --only-categories=accessibility,best-practices,seo --preset=desktop --view
# The lesson page needs a session: pass the cc_session cookie with --extra-headers='{"Cookie":"cc_session=…"}'
```
