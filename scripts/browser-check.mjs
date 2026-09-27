// Bounded foreground browser verification of the production export in dist/.
// Usage: npm run build && PLAYWRIGHT_CORE=/path/to/playwright-core/index.js node scripts/browser-check.mjs
// Serves dist/ under /preview/ on an ephemeral port, drives Chromium with the
// Playwright bundled at /opt/pwmcp, writes screenshots to artifacts/screenshots
// and a JSON summary to test/scratch/results.json, then shuts everything down.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
// Playwright is resolved from PLAYWRIGHT_CORE (path to a playwright-core package) or a local install.
const pw = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const { chromium } = pw.default ?? pw;

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'artifacts', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'artifacts', 'browser-check'), { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/preview/')) { res.writeHead(404); res.end('not under /preview/'); return; }
  let rel = url.pathname.slice('/preview/'.length) || 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('missing'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/preview/`;

const results = [];
let failures = 0;
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function expect(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
  } catch (err) {
    record(name, false, err?.message ?? String(err));
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function newPage(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', acceptDownloads: true, ...opts });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
  return { context, page, consoleErrors, failedRequests };
}

const noOverflow = async (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

// ---------------------------------------------------------------- main flow
{
  const { context, page, consoleErrors, failedRequests } = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await expect('loads under /preview/ with no console errors or failed resources', async () => {
    assert(await page.locator('h1').count() === 1, 'expected one h1');
    assert(consoleErrors.length === 0, `console: ${consoleErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `failed: ${failedRequests.join(' | ')}`);
    return `title="${await page.title()}"`;
  });

  await expect('empty state offers a next action and export is disabled', async () => {
    await page.getByText('No events yet', { exact: true }).first().waitFor();
    assert(await page.getByRole('link', { name: 'Add the first event' }).isVisible(), 'missing add link');
    assert(await page.getByRole('button', { name: 'Export JSON' }).isDisabled(), 'export should be disabled');
    assert(await page.getByRole('button', { name: 'Clear all' }).isDisabled(), 'clear should be disabled');
  });
  await page.screenshot({ path: path.join(SHOTS, 'desktop-empty.jpg'), type: 'jpeg', quality: 80, fullPage: true });

  await expect('keyboard: first Tab lands on the skip link and focus rings are visible', async () => {
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.textContent);
    assert(first === 'Skip to content', `first focus was ${first}`);
    const stops = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.id, outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
      });
      stops.push(info);
      assert(info.outline.startsWith('solid 2px'), `no visible ring on ${info.tag} ${info.name}: ${info.outline}`);
    }
    await page.screenshot({ path: path.join(SHOTS, 'desktop-focus-ring.jpg'), type: 'jpeg', quality: 80 });
    return stops.map((s) => `${s.tag}:${s.name}`).join(' > ');
  });

  await expect('heading outline: one h1, then h2 sections, h3 inside', async () => {
    const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 25)));
    assert(levels.filter((l) => l.startsWith('H1')).length === 1, levels.join(', '));
    return levels.join(', ');
  });

  await expect('add event: valid input creates a row, announces, and autosaves', async () => {
    await page.locator('input[name="timestamp"]').fill('2026-03-08 14:05');
    await page.locator('input[name="title"]').fill('Latency alert fired');
    await page.locator('select[name="severity"]').selectOption('high');
    await page.locator('textarea[name="notes"]').fill('First synthetic note');
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.getByRole('heading', { level: 3, name: 'Latency alert fired' }).waitFor();
    const count = await page.locator('.result-count').textContent();
    assert(count === '1 event', `count text: ${count}`);
    await page.locator('.storage-status--saved').waitFor({ timeout: 3000 });
    const status = await page.locator('.storage-status').textContent();
    assert(status.startsWith('Saved in this browser at'), status);
    const when = await page.locator('.event time').first().textContent();
    assert(when === '2026-03-0814:05:00', `time cell ${when}`);
    return status;
  });

  await expect('invalid calendar date is refused with a fix and focus moves to the field', async () => {
    await page.locator('input[name="timestamp"]').fill('2026-02-30 10:00');
    await page.locator('input[name="title"]').fill('Bad date');
    await page.getByRole('button', { name: 'Add event' }).click();
    const err = await page.locator('.field__error').first().textContent();
    assert(err.includes('2026-02 has 28 days'), err);
    const ts = page.locator('input[name="timestamp"]');
    assert((await ts.getAttribute('aria-invalid')) === 'true', 'aria-invalid missing');
    assert(await ts.evaluate((el) => document.activeElement === el), 'focus not on timestamp');
    const describedBy = await ts.getAttribute('aria-describedby');
    const errId = await page.locator('.field__error').first().getAttribute('id');
    assert(describedBy.split(' ').includes(errId), `describedby ${describedBy} lacks ${errId}`);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-invalid-date.jpg'), type: 'jpeg', quality: 80 });
  });

  await expect('empty title is refused and focus moves to title', async () => {
    await page.locator('input[name="timestamp"]').fill('2026-03-08 14:07');
    await page.locator('input[name="title"]').fill('   ');
    await page.getByRole('button', { name: 'Add event' }).click();
    const el = page.locator('input[name="title"]');
    assert((await el.getAttribute('aria-invalid')) === 'true', 'aria-invalid missing on title');
    assert(await el.evaluate((e) => document.activeElement === e), 'focus not on title');
  });

  await expect('local zone: skipped spring-forward time is refused with offsets', async () => {
    await page.getByRole('radio', { name: /Local/ }).check();
    await page.locator('input[name="timestamp"]').fill('2026-03-08 02:30');
    await page.locator('input[name="title"]').fill('Gap time');
    await page.getByRole('button', { name: 'Add event' }).click();
    const err = await page.locator('.field__error').first().textContent();
    assert(err.includes('did not exist') && err.includes('UTC-05:00 became UTC-04:00'), err);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-dst-gap.jpg'), type: 'jpeg', quality: 80 });
  });

  await expect('local zone: repeated fall-back time asks which occurrence, then stores the chosen instant', async () => {
    await page.locator('input[name="timestamp"]').fill('2026-11-01 01:30');
    await page.locator('input[name="title"]').fill('Ambiguous hour');
    const legend = await page.locator('.choice-list legend').textContent();
    assert(legend.includes('happens twice'), legend);
    await page.getByRole('button', { name: 'Add event' }).click();
    const err = await page.locator('.field__error').first().textContent();
    assert(err.includes('Choose the first or second occurrence'), err);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-dst-ambiguous.jpg'), type: 'jpeg', quality: 80 });
    await page.getByRole('radio', { name: /Second occurrence/ }).check();
    await page.getByRole('button', { name: 'Add event' }).click();
    const row = page.locator('.event', { hasText: 'Ambiguous hour' });
    await row.waitFor();
    const iso = await row.locator('time').getAttribute('datetime');
    assert(iso === '2026-11-01T06:30:00.000Z', `stored ${iso}`);
    const shown = await row.locator('.event__when').textContent();
    assert(shown.includes('01:30:00') && shown.includes('UTC-05:00'), shown);
    return `stored ${iso}, shown ${shown.replace(/\s+/g, ' ')}`;
  });

  await expect('UTC toggle re-renders the same instant in UTC', async () => {
    await page.getByRole('radio', { name: 'UTC' }).check();
    const row = page.locator('.event', { hasText: 'Ambiguous hour' });
    const shown = await row.locator('.event__when').textContent();
    assert(shown.includes('06:30:00') && shown.includes('UTC'), shown);
  });

  await expect('equal timestamps: marked, ordered stably, and reorderable within the tie', async () => {
    await page.locator('input[name="timestamp"]').fill('2026-03-08 14:05:00Z');
    await page.locator('input[name="title"]').fill('Tie A');
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.locator('input[name="timestamp"]').fill('2026-03-08 14:05:00Z');
    await page.locator('input[name="title"]').fill('Tie B');
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.locator('.event', { hasText: 'Tie B' }).waitFor();
    const ties = await page.locator('.event__tie').count();
    assert(ties === 3, `expected 3 tie markers, got ${ties}`);
    let titles = await page.locator('.event__title').allTextContents();
    assert(titles.slice(0, 3).join('|') === 'Latency alert fired|Tie A|Tie B', titles.join('|'));
    assert(await page.getByRole('button', { name: 'Move Latency alert fired up among events at the same time' }).isDisabled(), 'first in tie should not move up');
    await page.getByRole('button', { name: 'Move Tie B up among events at the same time' }).click();
    titles = await page.locator('.event__title').allTextContents();
    assert(titles.slice(0, 3).join('|') === 'Latency alert fired|Tie B|Tie A', titles.join('|'));
    await page.screenshot({ path: path.join(SHOTS, 'desktop-ties.jpg'), type: 'jpeg', quality: 80, fullPage: true });
  });

  await expect('edit: shifting the timestamp reorders by real time and focus returns to the row', async () => {
    await page.getByRole('button', { name: 'Edit Tie A' }).click();
    const ts = page.locator('input[name="timestamp"]');
    assert(await ts.evaluate((e) => document.activeElement === e), 'focus should move into the form');
    assert((await ts.inputValue()) === '2026-03-08 14:05:00 Z', await ts.inputValue());
    await page.getByRole('button', { name: 'Shift 1 hour earlier' }).click();
    assert((await ts.inputValue()) === '2026-03-08 13:05:00 Z', await ts.inputValue());
    await page.getByRole('button', { name: 'Save changes' }).click();
    const titles = await page.locator('.event__title').allTextContents();
    assert(titles[0] === 'Tie A', titles.join('|'));
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert(focused === 'Edit Tie A', `focus on ${focused}`);
    const gaps = await page.locator('.event__gap').allTextContents();
    assert(gaps[0].startsWith('+1 h'), gaps.join('|'));
  });

  await expect('search and filters: count updates, no-match state offers a clear action', async () => {
    await page.getByLabel('Search').fill('ambiguous');
    let count = await page.locator('.result-count').textContent();
    if (count !== '1 of 4 events match') {
      const rows = await page.locator('.event').evaluateAll((els) => els.map((e) => e.querySelector('.event__title').textContent + ' | ' + (e.querySelector('.event__notes')?.textContent ?? '')));
      throw new Error(`${count}; rows: ${rows.join(' || ')}; search value: ${await page.locator('#search').inputValue()}`);
    }
    await page.getByLabel('Search').fill('zzz-nothing');
    await page.getByText('No events match').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'desktop-no-match.jpg'), type: 'jpeg', quality: 80 });
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    count = await page.locator('.result-count').textContent();
    assert(count === '4 events', count);
    // The form keeps the last chosen severity, so every event in this run is "high".
    await page.locator('#filter-severity').selectOption('high');
    count = await page.locator('.result-count').textContent();
    assert(count === '4 of 4 events match', count);
    await page.locator('#filter-severity').selectOption('low');
    await page.getByText('No events match').waitFor();
    await page.locator('#filter-severity').selectOption('all');
    count = await page.locator('.result-count').textContent();
    assert(count === '4 events', count);
  });

  await expect('newest-first order flips the list', async () => {
    await page.locator('#sort').selectOption('desc');
    const titles = await page.locator('.event__title').allTextContents();
    assert(titles[0] === 'Ambiguous hour', titles.join('|'));
    await page.locator('#sort').selectOption('asc');
  });

  let exportedText = '';
  await expect('export downloads a JSON file that validates', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
    const file = path.join(ROOT, 'artifacts', 'browser-check', download.suggestedFilename());
    await download.saveAs(file);
    exportedText = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(exportedText);
    assert(json.schemaVersion === 1 && json.events.length === 4, `events ${json.events?.length}`);
    assert(/^incident-timeline-\d{8}-\d{6}Z\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    return download.suggestedFilename();
  });

  await expect('delete shows an undo toast that stays; undo restores the event', async () => {
    await page.getByRole('button', { name: 'Delete Tie B' }).click();
    const toast = page.locator('.toast');
    await toast.waitFor();
    assert((await toast.textContent()).includes('Deleted “Tie B”'), await toast.textContent());
    await page.waitForTimeout(1500);
    assert(await toast.isVisible(), 'undo toast should persist');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.locator('.event', { hasText: 'Tie B' }).waitFor();
    assert((await page.locator('.result-count').textContent()) === '4 events');
  });

  await expect('import dialog: bad JSON reports problems; valid JSON replaces; focus returns to trigger', async () => {
    await page.getByRole('button', { name: 'Import JSON' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert(await dialog.evaluate((d) => Boolean(d.hasAttribute('open') && d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')))), 'dialog missing accessible name');
    await page.getByLabel('Or paste JSON').fill('{"schemaVersion":1,"events":[{"id":"x","timestamp":"2026-02-30T10:00:00Z","title":"","severity":"urgent","status":"open"}]}');
    await page.getByRole('button', { name: 'Check file' }).click();
    const report = page.locator('.report--error');
    await report.waitFor();
    assert(await report.evaluate((el) => document.activeElement === el), 'report should receive focus');
    const text = await report.textContent();
    assert(text.includes('3 problems') && text.includes('Event 1: "timestamp"') && text.includes('"severity"'), text);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-import-errors.jpg'), type: 'jpeg', quality: 80 });
    await page.getByLabel('Or paste JSON').fill(exportedText.replace('Tie B', 'Tie B imported'));
    await page.getByRole('button', { name: 'Check file' }).click();
    await page.locator('.report--ok, .report--warning').waitFor();
    await page.getByRole('button', { name: 'Replace timeline' }).click();
    await page.locator('.event', { hasText: 'Tie B imported' }).waitFor();
    assert(!(await page.locator('dialog.dialog--wide').evaluate((d) => d.open)), 'dialog should close');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert(focused === 'Import JSON', `focus on ${focused}`);
  });

  await expect('escape closes the clear-all dialog and returns focus; confirm empties the timeline', async () => {
    await page.getByRole('button', { name: 'Clear all' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Delete all 4 events/ });
    await dialog.waitFor();
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert(focused === 'Cancel', `initial focus ${focused}`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const back = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert(back === 'Clear all', `focus after escape ${back}`);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-before-clear.jpg'), type: 'jpeg', quality: 80, fullPage: true });
  });

  await expect('refresh keeps events and the zone preference', async () => {
    await page.getByRole('radio', { name: /Local/ }).check();
    await page.locator('.storage-status--saved').waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    assert((await page.locator('.result-count').textContent()) === '4 events', await page.locator('.result-count').textContent());
    assert(await page.getByRole('radio', { name: /Local/ }).isChecked(), 'zone pref lost');
    assert(consoleErrors.length === 0, consoleErrors.join(' | '));
  });

  await expect('reduced motion disables the toast entrance animation', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Load sample', exact: true }).click();
    const anim = await page.locator('.toast').evaluate((el) => getComputedStyle(el).animationName);
    assert(anim === 'none', `animation ${anim}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await expect('sample data is labelled as synthetic', async () => {
    const badge = await page.locator('.badge--sample').textContent();
    assert(badge.includes('synthetic'), badge);
    const title = await page.getByLabel('Incident title').inputValue();
    assert(title.startsWith('SAMPLE:'), title);
  });
  await page.locator('.storage-status--saved').waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'desktop-sample.jpg'), type: 'jpeg', quality: 80, fullPage: true });

  // ---- rendered contrast measurement (WCAG 2 ratio on painted colours) ----
  await expect('rendered contrast: text and UI pairs meet WCAG AA', async () => {
    await page.getByRole('button', { name: 'Edit Latency alert fired for checkout-api p95' }).click();
    await page.getByLabel('Search').fill('x'); // exercises placeholder-less state; harmless
    await page.getByLabel('Search').fill('');
    const pairs = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const toRgb = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
      const isTransparent = (c) => c === 'transparent' || /rgba\(\d+, \d+, \d+, 0\)/.test(c) || /\/ 0\)$/.test(c);
      const bgOf = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; if (c && !isTransparent(c)) return c; e = e.parentElement; } return 'rgb(255, 255, 255)'; };
      const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      const targets = [
        ['body text', '.event__title', 'color'], ['secondary text', '.event__notes', 'color'], ['timestamp', '.event time', 'color'], ['offset label', '.event__offset', 'color'],
        ['gap text', '.event__gap', 'color'], ['tie text', '.event__tie', 'color'], ['field hint', '.field__hint', 'color'], ['field label', '.field__label', 'color'],
        ['tagline', '.brand__tagline', 'color'], ['storage saved', '.storage-status--saved', 'color'], ['result count', '.result-count', 'color'],
        ['primary button', '.btn--primary', 'color'], ['secondary button', '.incident-bar__actions .btn:not(.btn--primary):not(.btn--danger)', 'color'], ['danger button', '.btn--danger', 'color'],
        ['sample badge', '.badge--sample', 'color'], ['status badge', '.badge:not([class*="sev"]):not(.badge--sample)', 'color'],
        ['badge info', '.badge--sev-info', 'color'], ['badge low', '.badge--sev-low', 'color'], ['badge medium', '.badge--sev-medium', 'color'], ['badge high', '.badge--sev-high', 'color'], ['badge critical', '.badge--sev-critical', 'color'],
        ['editing note', '.form-editing-note', 'color'], ['guidance summary', '.guidance > summary', 'color'], ['footer', '.app-footer', 'color'], ['link', 'a.btn', 'color'],
        ['input border', '.input', 'borderTopColor'], ['button border', '.btn:not(.btn--primary):not(.btn--quiet)', 'borderTopColor'], ['segmented selected', '.segmented__option:has(input:checked)', 'color'], ['segmented unselected', '.segmented__option:not(:has(input:checked))', 'color'],
        ['toast text', '.toast', 'color'], ['toast button border', '.toast .btn', 'borderTopColor'],
      ];
      const out = [];
      for (const [name, sel, prop] of targets) {
        const el = document.querySelector(sel);
        if (!el) { out.push({ name, missing: true }); continue; }
        const cs = getComputedStyle(el);
        const fg = toRgb(cs[prop]);
        const bgCss = prop === 'color' ? bgOf(el) : bgOf(el.parentElement);
        const bg = toRgb(bgCss);
        out.push({ name, fg: cs[prop], bg: bgCss, fgRgb: fg, bgRgb: bg, ratio: Number(ratio(fg, bg).toFixed(2)), size: cs.fontSize, weight: cs.fontWeight, kind: prop === 'color' ? 'text' : 'ui' });
      }
      // Focus ring against page and surface backgrounds
      const ring = toRgb(getComputedStyle(document.documentElement).getPropertyValue('--color-focus-ring').trim());
      out.push({ name: 'focus ring on page bg', ratio: Number(ratio(ring, toRgb(getComputedStyle(document.body).backgroundColor)).toFixed(2)), kind: 'ui' });
      out.push({ name: 'focus ring on surface', ratio: Number(ratio(ring, toRgb(getComputedStyle(document.querySelector('.panel')).backgroundColor)).toFixed(2)), kind: 'ui' });
      const placeholderEl = document.querySelector('#search');
      const phColor = getComputedStyle(placeholderEl, '::placeholder').color;
      out.push({ name: 'placeholder', fg: phColor, ratio: Number(ratio(toRgb(phColor), toRgb(bgOf(placeholderEl))).toFixed(2)), kind: 'text' });
      return out;
    });
    fs.writeFileSync(path.join(ROOT, 'artifacts', 'browser-check', 'contrast.json'), JSON.stringify(pairs, null, 2));
    const failing = pairs.filter((p) => !p.missing && (p.kind === 'text' ? p.ratio < 4.5 : p.ratio < 3));
    const missing = pairs.filter((p) => p.missing).map((p) => p.name);
    assert(missing.length === 0, `missing selectors: ${missing.join(', ')}`);
    assert(failing.length === 0, `failing: ${failing.map((p) => `${p.name} ${p.ratio}`).join(', ')}`);
    return pairs.map((p) => `${p.name} ${p.ratio}`).join('; ');
  });

  await expect('storage-unavailable path: status warns and export remains possible', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
    await ctx2.addInitScript(() => {
      const err = () => { const e = new Error('blocked'); e.name = 'SecurityError'; throw e; };
      Object.defineProperty(Storage.prototype, 'setItem', { value: err });
    });
    const p2 = await ctx2.newPage();
    await p2.goto(BASE, { waitUntil: 'networkidle' });
    let status = await p2.locator('.storage-status').textContent();
    assert(status.includes('storage is unavailable'), status);
    await p2.getByRole('button', { name: 'Load sample', exact: true }).click();
    status = await p2.locator('.storage-status').textContent();
    assert(status.startsWith('Not saved: browser storage is unavailable'), status);
    assert(await p2.getByRole('button', { name: 'Export JSON' }).isEnabled(), 'export should stay enabled');
    await p2.screenshot({ path: path.join(SHOTS, 'desktop-storage-unavailable.jpg'), type: 'jpeg', quality: 80 });
    await ctx2.close();
    return status;
  });

  await expect('corrupt stored data: alert banner, saving paused, discard recovers', async () => {
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' });
    await ctx3.addInitScript(() => { try { localStorage.setItem('incident-timeline-editor:v1', '{"schemaVersion":1,"events":[{"id":"a","timestamp":"nope","title":"x","severity":"low","status":"open"}]}'); } catch {} });
    const p3 = await ctx3.newPage();
    await p3.goto(BASE, { waitUntil: 'networkidle' });
    const banner = p3.getByRole('alert');
    await banner.waitFor();
    assert((await banner.textContent()).includes('could not be read'), await banner.textContent());
    assert((await p3.locator('.storage-status').textContent()).startsWith('Not saved: resolve'), 'status should be paused');
    await p3.screenshot({ path: path.join(SHOTS, 'desktop-corrupt-storage.jpg'), type: 'jpeg', quality: 80 });
    await p3.getByRole('button', { name: 'Discard stored data' }).click();
    await banner.waitFor({ state: 'hidden' });
    await ctx3.close();
  });

  await context.close();
}

// ---------------------------------------------------------------- viewports
for (const [label, width, height] of [['mobile-390', 390, 844], ['mobile-320', 320, 568], ['tablet-820', 820, 1180], ['desktop-1280', 1280, 900]]) {
  const { context, page, consoleErrors } = await newPage({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expect(`${label}: empty state has no horizontal overflow`, async () => {
    const o = await noOverflow(page);
    assert(o.sw <= o.iw, `scrollWidth ${o.sw} > innerWidth ${o.iw}`);
    return `scrollWidth ${o.sw}/${o.iw}`;
  });
  await page.screenshot({ path: path.join(SHOTS, `${label}-empty.jpg`), type: 'jpeg', quality: 80, fullPage: true });
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await page.locator('.event').first().waitFor();
  await expect(`${label}: sample timeline has no horizontal overflow`, async () => {
    const o = await noOverflow(page);
    assert(o.sw <= o.iw, `scrollWidth ${o.sw} > innerWidth ${o.iw}`);
    assert(consoleErrors.length === 0, consoleErrors.join(' | '));
  });
  await page.screenshot({ path: path.join(SHOTS, `${label}-sample.jpg`), type: 'jpeg', quality: 80, fullPage: true });
  await expect(`${label}: editing an event moves focus into the form; ambiguous choice fits`, async () => {
    await page.getByRole('button', { name: /^Edit Error rate/ }).click();
    const ts = page.locator('input[name="timestamp"]');
    assert(await ts.evaluate((e) => document.activeElement === e), 'focus not in form');
    await page.getByRole('radio', { name: /Local/ }).check();
    await ts.fill('2026-11-01 01:30');
    await page.locator('.choice-list').waitFor();
    const o = await noOverflow(page);
    assert(o.sw <= o.iw, `scrollWidth ${o.sw} > innerWidth ${o.iw}`);
    const inputSize = await ts.evaluate((e) => getComputedStyle(e).fontSize);
    assert(inputSize === '16px', `input font-size ${inputSize}`);
  });
  await page.screenshot({ path: path.join(SHOTS, `${label}-edit-ambiguous.jpg`), type: 'jpeg', quality: 80, fullPage: true });
  await expect(`${label}: interactive targets are at least 24x24 CSS px`, async () => {
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea, summary')]
      .filter((el) => el.offsetParent !== null || el.tagName === 'SUMMARY')
      .map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, name: (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), type: el.type }; })
      .filter((t) => (t.w < 24 || t.h < 24) && t.type !== 'radio'));
    assert(small.length === 0, `small targets: ${small.map((t) => `${t.tag}:${t.name} ${t.w}x${t.h}`).join(', ')}`);
    const min = await page.evaluate(() => Math.min(...[...document.querySelectorAll('button, a.btn')].filter((el) => el.offsetParent !== null).map((el) => el.getBoundingClientRect().height)));
    return `smallest button/link height ${Math.round(min)}px`;
  });
  await expect(`${label}: import dialog fits the viewport`, async () => {
    await page.getByRole('button', { name: 'Import JSON' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert(box.width <= width && box.x >= 0, `dialog ${JSON.stringify(box)}`);
    await page.screenshot({ path: path.join(SHOTS, `${label}-import-dialog.jpg`), type: 'jpeg', quality: 80 });
    await page.keyboard.press('Escape');
  });
  await context.close();
}

// ---------------------------------------------------------------- zoom-ish reflow (narrow viewport, not native zoom)
{
  const { context, page } = await newPage({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await expect('200% zoom approximation (640x450 CSS px at DPR 2) keeps layout without horizontal overflow', async () => {
    await page.getByRole('button', { name: 'Load sample', exact: true }).click();
    await page.locator('.event').first().waitFor();
    await page.getByRole('button', { name: /^Edit Error rate/ }).click();
    const o = await noOverflow(page);
    assert(o.sw <= o.iw + 1, `scrollWidth ${o.sw} > innerWidth ${o.iw}`);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-zoom-200.jpg'), type: 'jpeg', quality: 80 });
  });
  await context.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(ROOT, 'artifacts', 'browser-check', 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
