# Design system: Incident Timeline Editor

This document describes the design as implemented in the final source, so that another page or feature can be added without breaking consistency. Every value below is taken from `src/styles.css` (tokens and component classes) and the components in `src/components/`. Rendered behaviour was confirmed in headless Chromium at 1280, 820, 390 and 320 px; see `artifacts/validation.md` for what was and was not checked.

## Overview

The audience is an on-call engineer or incident commander writing down what happened and when, often on a laptop during the incident and sometimes on a phone afterwards. The visual character is a quiet, light professional tool: white cards on a faintly cool page background, one dark-blue accent reserved for the primary action, a restrained set of status hues on badges and the coloured left edge of each event, monospaced tabular timestamps, and system fonts.

Hierarchy comes from spacing and weight, not lines or colour. Content lives in white cards (`.panel`, `.incident-bar`, `.guidance`) with a 1 px border and a soft shadow; groups inside a card are separated by 16 px gaps, items within a group by 4 to 12 px. Density is moderate: 40 px controls on desktop, 44 px on phones.

System-wide rules: one `h1` in the header, card sections with `h2`, event titles as `h3`; one filled primary button per view; severity hues appear only on severity badges and the matching event edge; warning amber appears only for states that need attention (storage problems, DST choices, tie markers).

Page-specific arrangement, not a rule: the two-column workspace (timeline left, sticky form right) and the incident bar above it belong to this editor's main page.

## Colors

All colours are `oklch()` custom properties on `:root` in `src/styles.css`. Primitives are named by hue and step (`--slate-600`, `--blue-600`); components reference only the role tokens. There is no dark theme; `color-scheme` is `light`.

| Role token | Value (primitive) | Use |
| --- | --- | --- |
| `--color-bg-page` | `--slate-50` `oklch(0.985 0.003 250)` | Page background |
| `--color-bg-surface` | `--slate-0` `oklch(1 0 0)` | Cards, inputs, buttons, dialogs |
| `--color-bg-muted` | `--slate-100` `oklch(0.965 0.006 250)` | Neutral badges, status pill, hover fill, segmented track |
| `--color-text` | `--slate-900` `oklch(0.24 0.02 250)` | Body text, headings, timestamps, toast background |
| `--color-text-secondary` | `--slate-600` `oklch(0.45 0.02 250)` | Hints, notes, offsets, counts, placeholders, footer |
| `--color-border` | `--slate-200` `oklch(0.87 0.01 250)` | Card and badge borders, header rule |
| `--color-border-input` | `--slate-400` `oklch(0.65 0.015 250)` | Input, select, textarea and button borders (3.24:1 on white) |
| `--color-accent-solid` / `-hover` | `--blue-600` `oklch(0.45 0.13 255)` / `--blue-700` | Primary button fill (white text, 7.48:1) |
| `--color-accent-text` | `--blue-650` `oklch(0.42 0.13 255)` | Links, sample badge text, editing note, editing row outline |
| `--color-accent-subtle` | `--blue-100` `oklch(0.95 0.03 255)` | Sample badge and editing-note background |
| `--color-focus-ring` | `--blue-500` `oklch(0.55 0.2 255)` | 2 px focus outline with 2 px offset (4.69:1 on page, 4.9:1 on cards) |
| `--color-danger-text` / `-hover` | `--red-600` `oklch(0.48 0.18 25)` / `--red-700` | Destructive button text, error text, invalid-field border |
| `--color-danger-subtle` | `--red-100` | Destructive hover fill, import error report |
| `--color-warning-bg` / `-border` / `-text` | `--amber-100` / `--amber-300` / `--amber-700` | Storage warnings, corrupt-data banner, DST choice list, tie marker text |
| `--color-success-text` | `--green-700` `oklch(0.42 0.12 150)` | "Saved" status text |

Severity tokens `--sev-{info,low,medium,high,critical}-{bg,border,text}` map to the gray, green, amber, orange and rose primitives. Text-on-background pairs for the five badges measured 7.95, 7.01, 8.03, 6.72 and 7.63:1. Statuses (open, investigating, mitigated, resolved) are deliberately neutral badges so that colour only ever means severity.

Measured pairs are listed in `artifacts/validation.md`; every text pair is at least 6.7:1 and every UI pair at least 3.2:1 in the rendered light theme.

## Typography

- `--font-sans`: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. No font files ship with the site; the rendered face depends on the platform.
- `--font-mono`: `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace` for timestamps (`.event time`, `.input--mono`) and inline `code`.
- Root smoothing (`-webkit-font-smoothing: antialiased`) is set once on `html`.

Scale (rem, semantic names in `:root`):

| Token | Size | Roles |
| --- | --- | --- |
| `--text-xs` | 13 px | Badges, hints, captions, offsets, footer, status pill |
| `--text-sm` | 14 px | Buttons, labels, notes, secondary copy, timestamps |
| `--text-md` | 16 px | Body, inputs at every width, event titles, `h3` |
| `--text-lg` | 18 px | Header `h1` (kept small in the sticky bar) |
| `--text-xl` | 22 px | Section `h2` |
| `--text-2xl` | 28 px | Reserved for a page-level `h1` outside the header |

Weights: 400 for body, 500 for buttons, labels and badges, 600 for `h2`/`h3` and event titles, 650 for `h1`. Line-height is `1.15` on headings and `1.5` on body copy. Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`; `overflow-wrap: break-word` is global and event titles use `overflow-wrap: anywhere`. Changing numbers (timestamps, counts, status time) use `font-variant-numeric: tabular-nums`. Notes and guidance paragraphs cap the measure at 60 to 70 ch. Inputs stay at 16 px on every viewport so iOS does not zoom.

## Layout

- Spacing steps: `--space-1` 4 px, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40. Within-group gaps are 4 to 12 px; between-group gaps are 16 to 20 px.
- Content width: `--content-max` 76 rem, centred, with 16 px inline padding (12 px under 40 rem).
- Workspace grid (`.workspace`): one column by default; from 56 rem it becomes `minmax(0,1fr) minmax(20rem,24rem)` with the form column sticky below the header and scrollable within the viewport.
- Container queries: `.panel--timeline` is an inline-size container. The toolbar goes from one column to two at 28 rem and to `2fr 1fr 1fr 1fr` at 44 rem of container width; event rows switch from stacked to `11.5rem 1fr` at 32 rem. This keeps the timeline correct whether it fills the page or shares it with the form.
- Header: in flow on phones, sticky from 40 rem where it costs only 58 px.
- Direction: layout uses logical properties (`inset-inline-start`, `padding-inline`, `border-inline-start`); the custom select chevron flips under `[dir='rtl']`. RTL was not rendered in verification.
- Small screens (`max-width: 40rem`): action buttons stretch to share rows, controls grow to 44 px, the header tagline is hidden.
- Anchored targets (`.panel`, `.event`) carry `scroll-margin-top: 80px` for the sticky header.
- Verified widths: 1280, 820, 390 and 320 px without horizontal overflow, plus 640 px at device pixel ratio 2 as a 200% zoom approximation. Widths between 40 and 56 rem were not screenshotted individually.

## Elevation & Depth

Structure comes from borders; elevation from two shadow tokens.

- `--shadow-card`: `0 1px 2px oklch(0 0 0 / 0.04), 0 2px 8px oklch(0 0 0 / 0.04)` on cards (`.panel`, `.incident-bar`, `.guidance`).
- `--shadow-float`: `0 4px 12px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.1)` on the toast, dialogs and the focused skip link.
- Dialog backdrop: `oklch(0.2 0.02 250 / 0.45)`.
- The selected segmented option gets a 1 px shadow to read as raised.
- Z-order: header 20, toast region 30, skip link 100; native `<dialog>` sits in the top layer.

## Shapes

- `--radius-sm` 6 px: inputs, buttons, reports, notes.
- `--radius-md` 10 px: event rows, banners, toast.
- `--radius-lg` 14 px: cards and dialogs (10 + 4 inner padding of nested rows keeps radii concentric).
- `--radius-pill`: badges and the storage status pill.
- The segmented control uses `calc(var(--radius-sm) + 3px)` on the track so its 3 px padding stays concentric with the 6 px options.
- Each event row has a 4 px `border-inline-start` in its severity border colour; the editing row adds a 2 px accent outline.

## Components

All components are plain React function components with CSS classes; none are published as a library.

- **Button** (`.btn` in `src/styles.css`): variants `.btn--primary` (accent fill, one per view), `.btn--danger` (red text, neutral border), `.btn--quiet`, sizes `.btn--sm` (32 px) and `.btn--icon`; `.btn--has-icon-start` trims the icon-side padding by 2 px. Hover fills only under `@media (hover: hover)`; press scales to 0.96 with a 120 ms `cubic-bezier(0.2, 0, 0, 1)` transition and is disabled under reduced motion. Links styled as buttons use the same class (`a.btn`).
- **Field** (`.field`, `.field__label`, `.field__hint`, `.field__error`, `.field__preview`): every input has a visible `<label for>`; required fields show a red asterisk explained once per form; errors sit under the field with an icon, `aria-invalid="true"` and `aria-describedby`; the first invalid field receives focus on submit.
- **Inputs** (`.input`, `.select`, `.textarea`, `.input--mono`): 40 px tall, 16 px text, 1 px `--color-border-input`; invalid state thickens the border to 2 px in the danger colour. `.select` draws its own chevron.
- **Segmented radio group** (`.segmented` in `src/App.tsx`): a `fieldset` with real radio inputs positioned over the options; selection and keyboard focus are shown via `:has()`.
- **Badge** (`.badge`, `.badge--sev-*`, `.badge--sample`): pill with 13 px medium text; severity badges add a dot and a visually hidden "Severity:" prefix.
- **Event row** (`src/components/Timeline.tsx`, `.event`): time column (`<time datetime>` in monospace, offset label, gap since previous, tie marker) and body (title, badges, notes, actions Edit / Delete / Move up / Move down). Tie controls appear only for events that share an instant.
- **Event form** (`src/components/EventForm.tsx`): timestamp text field with live "Stored as … / Shown as …" preview, DST choice list (`.choice-list`, a fieldset whose floated legend renders inside the box), adjust bar (Use now, ±1 h, ±5 min), title, severity, status, notes (Ctrl/⌘+Enter submits). Edit mode moves focus into the form and returns it to the row's Edit button on save or cancel.
- **Storage status** (`src/components/StorageStatus.tsx`, `.storage-status`): a stable `role="status"` pill with saved, unsaved, error, paused and unavailable variants; warning variants use the amber tokens and an icon so colour is never the only cue.
- **Dialogs** (`src/components/Dialogs.tsx`, `.dialog`): native `<dialog>` opened with `showModal()`, so focus is trapped, Escape closes and focus returns to the opener. `ConfirmDialog` focuses Cancel first and names the consequence on the confirm button. `ImportDialog` validates before offering Replace or Merge and moves focus to the report.
- **Toast** (`.toast-region` in `src/App.tsx`): one polite live region rendered from the start; a toast with an Undo action stays until dismissed, plain toasts time out after 8 s. Enter animation only under `prefers-reduced-motion: no-preference`.
- **Empty state** (`.empty`): title, one-sentence orientation and one or two actions; the no-match variant names the query and offers "Clear search and filters".
- **Banner** (`.banner`): amber block for corrupt or repaired stored data; the corrupt variant is `role="alert"` with download and discard actions.
- **Guidance** (`src/components/Guidance.tsx`, `.guidance`): a native `<details>` card explaining zones, ties, invalid dates, DST, saving and import rules.
- **Icons** (`src/components/Icons.tsx`): 24-unit inline SVGs, 1.75 px stroke, `currentColor`, `aria-hidden`; buttons carry their own text or `aria-label`.

## Do's and Don'ts

- Start a new surface from `.panel` inside `.app-main`; put its heading in `.panel__head` as an `h2`.
- Use `.btn--primary` for exactly one action per view; peers are plain `.btn`, destructive ones `.btn--danger` and confirmed through `ConfirmDialog` or undo.
- Reference role tokens (`--color-*`, `--sev-*`), never the hue primitives, and never add a new hue for a new meaning if an existing role already carries it.
- Keep severity colour on severity elements only; do not colour statuses or ordinary text with those hues.
- Give every control a `<label for>`; put hints and errors in `.field__hint` / `.field__error` and wire `aria-describedby`.
- Announce non-urgent results through an existing `role="status"` region; reserve `role="alert"` for data-loss problems.
- Use `@container` on `.panel--timeline`-style containers for component adaptation and `@media` only for page-level structure.
- Keep inputs at 16 px and buttons at least 40 px tall (44 px under 40 rem).
- Do not add a dark theme, web fonts, positive `tabindex`, `outline: none`, or motion that lacks a `prefers-reduced-motion` guard.

Recipe for another page: copy `index.html`, render a component under `App`'s header pattern (`.app-header` with `StorageStatus` or another `role="status"`), place content in `.app-main` as one or more `.panel` cards, reuse `.field` for inputs and `.btn` for actions, and end with the `.app-footer` notice. Import `./styles.css` once; do not create per-page stylesheets.
