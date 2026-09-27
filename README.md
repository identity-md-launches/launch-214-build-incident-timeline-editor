# Incident Timeline Editor

A single-page incident timeline editor that runs entirely in the browser. Once the page has loaded there is no backend, no account and no network call: events are kept in `localStorage`, and JSON export/import moves them between browsers or people.

- Add events with a timestamp, title, severity, status and notes; edit, delete (with undo) and clear all.
- The list is always ordered by the real instant. Events that share an instant are marked and can be arranged with "Move up" and "Move down"; shifting a timestamp reorders the row.
- Show every time in UTC or in the browser's local zone, always with the offset printed.
- Typed times are read in the selected zone unless they carry `Z` or an offset. Impossible dates (2026-02-30, hour 24) are refused with the valid range; a local time skipped by a daylight-saving jump is refused with the offsets on either side; a local time that happens twice asks which one you mean.
- Search titles and notes, filter by severity and status, sort oldest or newest first.
- Export the timeline as JSON; import a file or pasted JSON after a field-by-field check that reports every problem before anything changes.
- The header shows when the timeline was last saved, when changes are still unsaved, and when browser storage is unavailable or full.
- "Load sample" fills the editor with a clearly labelled synthetic incident. Nothing in it is real, and the site never asks for a wallet, a signature or a payment.

The published site is the committed `dist/` folder. `DESIGN.md` documents the implemented design system; `artifacts/validation.md` is the test report and Better Interface review.

## Install

Requires Node.js 20 or newer and npm.

```sh
npm install
```

## Preview

Run the development server with hot reload:

```sh
npm run dev
```

Preview the production export exactly as it will be published:

```sh
npm run build
npm run preview
```

`vite preview` serves `dist/` at the URL it prints. Because every asset URL is relative (`base: './'` in `vite.config.ts`), the same files also work when opened from any subpath of a static host.

## Rebuild

```sh
npm run check   # typecheck (tsc --noEmit), unit tests (vitest), production build (vite build)
```

Or step by step:

```sh
npm run typecheck
npm run test
npm run build
```

`npm run build` replaces `dist/` with a fresh export. Commit the result together with the source change that caused it; the publisher serves the committed export and does not rebuild.

### Browser check

`scripts/browser-check.mjs` serves `dist/` under `/preview/` on an ephemeral port, drives headless Chromium through the primary flows at 1280, 820, 390 and 320 px wide, measures rendered contrast, and writes screenshots plus `results.json` to `artifacts/browser-check/`. It needs a `playwright-core` package with a Chromium download:

```sh
npm run build
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.js node scripts/browser-check.mjs
```

Without the environment variable it imports `playwright-core` from the local `node_modules`, which is not a project dependency so that the lockfile stays small; install it separately if you want to run the check.

## Publish

1. Run `npm run check` so the export matches the source.
2. Commit `dist/` (including `dist/assets/` and `dist/favicon.svg`).
3. Upload the contents of `dist/` to any static host: a plain web server directory, an object-storage bucket with static hosting, GitHub Pages, IPFS, or a gateway subpath. No rewrite rules are needed because the app has a single page and no client-side routes.

The site sets no cookies and loads no third-party resources.

## Data format

Exports are JSON:

```json
{
  "app": "incident-timeline-editor",
  "schemaVersion": 1,
  "exportedAt": "2026-03-29T03:10:00.000Z",
  "title": "SAMPLE: Checkout API latency (synthetic data)",
  "sample": true,
  "events": [
    {
      "id": "sample-01",
      "timestamp": "2026-03-29T00:41:00.000Z",
      "title": "Latency alert fired for checkout-api p95",
      "severity": "medium",
      "status": "open",
      "notes": "",
      "order": 0
    }
  ]
}
```

- `timestamp` is an ISO 8601 date-time with an explicit `Z` or offset. Imports normalise it to UTC with milliseconds.
- `severity` is one of `info`, `low`, `medium`, `high`, `critical`; `status` is one of `open`, `investigating`, `mitigated`, `resolved`.
- `order` only matters between events that share the same instant.
- Import also accepts a bare array of events or an object without `schemaVersion`, and reports those as notes. Missing or duplicate ids are repaired.

Local storage keys: `incident-timeline-editor:v1` (the incident) and `incident-timeline-editor:prefs` (display zone and sort order).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/time.ts` | Timestamp parsing, DST resolution, formatting |
| `src/lib/model.ts` | Event and incident types, ordering, tie handling |
| `src/lib/importExport.ts` | JSON serialisation and import validation |
| `src/lib/storage.ts` | localStorage probe, load, save, preferences |
| `src/lib/sample.ts` | The synthetic sample incident |
| `src/components/` | Event form, timeline list, dialogs, storage status, guidance |
| `src/App.tsx` | State, autosave, search, export/import wiring |
| `src/styles.css` | Design tokens and all styling |
| `scripts/browser-check.mjs` | Repeatable browser verification |
| `artifacts/validation.md` | Test report and design review |

## Test report (summary)

Run on 2026-09-27 against the committed export. Full details, coverage limits and screenshots are in `artifacts/validation.md`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | passed, no errors |
| `npm run test` | 27 unit tests passed (time parsing, DST resolution, ordering, import validation) |
| `npm run build` | passed; `dist/index.html`, one CSS and one JS asset, relative URLs |
| Browser script, 45 checks | all passed: load under a subpath, keyboard walk with visible focus, add/edit/delete/undo, invalid date, DST gap and ambiguity, ties, search and filters, export download, import errors and replace, refresh persistence, storage unavailable, corrupt storage, reduced motion, rendered contrast, no horizontal overflow at 1280/820/390/320 and at a 200% zoom approximation |

Known limitations: no screen-reader session, no physical device, no native browser zoom (a 640 px viewport at device pixel ratio 2 was used instead), and the interactive MCP browser could not reach a preview, so the evidence comes from the bundled Playwright script and its screenshots.

## Licence and attribution

Application code in this repository is released under the MIT licence. Design review guidance came from Jakub Krehel's Better Interface (MIT) and Paul Bakaus's Impeccable documentation method (Apache-2.0), used as references while building and documenting; no code from either is included.
