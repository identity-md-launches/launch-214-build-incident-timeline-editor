import {
  NOTES_MAX,
  SCHEMA_VERSION,
  SEVERITIES,
  STATUSES,
  TITLE_MAX,
  isSeverity,
  isStatus,
  newId,
  type Incident,
  type TimelineEvent,
} from './model';
import { isValidStoredTimestamp, normaliseStoredTimestamp } from './time';

export const APP_ID = 'incident-timeline-editor';
const MAX_EVENTS = 5000;
const MAX_ERRORS = 25;

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  title: string;
  sample: boolean;
  events: TimelineEvent[];
}

export function serializeIncident(incident: Incident, exportedAt: Date = new Date()): string {
  const file: ExportFile = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    title: incident.title,
    sample: incident.sample,
    events: incident.events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      title: e.title,
      severity: e.severity,
      status: e.status,
      notes: e.notes,
      order: e.order,
    })),
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export function exportFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `incident-timeline-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z.json`;
}

export type ValidationResult =
  | { ok: true; incident: Incident; warnings: string[] }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate text that should contain an exported incident. Accepts the export
 * file shape, a bare `{ events: [...] }` object, or a bare array of events.
 * Every event is checked field by field; problems are reported with the
 * event's position (1-based) so they can be fixed in the source file.
 */
export function validateIncidentJson(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (text.trim() === '') {
    return { ok: false, errors: ['The file is empty. Choose a JSON file exported from this editor.'] };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown parse error';
    return { ok: false, errors: [`The text is not valid JSON (${detail}). Export a file from this editor and try again.`] };
  }

  let root: Record<string, unknown>;
  if (Array.isArray(data)) {
    root = { events: data };
    warnings.push('The file is a bare list of events, so the incident title was left empty.');
  } else if (isRecord(data)) {
    root = data;
  } else {
    return { ok: false, errors: ['The JSON must be an object with an "events" list, not a single value.'] };
  }

  if ('schemaVersion' in root && root.schemaVersion !== SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion ${JSON.stringify(root.schemaVersion)}. This editor reads schemaVersion ${SCHEMA_VERSION}.`,
    );
  } else if (!('schemaVersion' in root)) {
    warnings.push(`No schemaVersion field; the file was read as schemaVersion ${SCHEMA_VERSION}.`);
  }

  let title = '';
  if (root.title !== undefined) {
    if (typeof root.title !== 'string') {
      errors.push('"title" must be text.');
    } else {
      title = root.title.trim().slice(0, TITLE_MAX);
    }
  }

  const sample = root.sample === true;

  if (!Array.isArray(root.events)) {
    errors.push('"events" must be a list.');
    return { ok: false, errors };
  }
  if (root.events.length > MAX_EVENTS) {
    errors.push(`The file has ${root.events.length} events; the editor accepts up to ${MAX_EVENTS}.`);
    return { ok: false, errors };
  }

  const events: TimelineEvent[] = [];
  const seenIds = new Set<string>();
  root.events.forEach((item: unknown, index: number) => {
    if (errors.length >= MAX_ERRORS) return;
    const n = index + 1;
    if (!isRecord(item)) {
      errors.push(`Event ${n}: must be an object.`);
      return;
    }
    const e = item;
    const local: string[] = [];

    let id: string;
    if (typeof e.id === 'string' && e.id.trim() !== '') {
      id = e.id.trim();
      if (seenIds.has(id)) {
        warnings.push(`Event ${n}: duplicate id "${id}" was replaced with a new id.`);
        id = newId();
      }
    } else {
      id = newId();
      warnings.push(`Event ${n}: missing id; a new id was generated.`);
    }
    seenIds.add(id);

    let timestamp = '';
    if (!isValidStoredTimestamp(e.timestamp)) {
      local.push(
        `Event ${n}: "timestamp" must be an ISO 8601 date-time with a UTC offset, for example 2026-03-08T14:05:00Z` +
          (typeof e.timestamp === 'string' ? ` (got "${e.timestamp}")` : '') +
          '.',
      );
    } else {
      timestamp = normaliseStoredTimestamp(e.timestamp);
    }

    let evTitle = '';
    if (typeof e.title !== 'string' || e.title.trim() === '') {
      local.push(`Event ${n}: "title" must be non-empty text.`);
    } else {
      evTitle = e.title.trim();
      if (evTitle.length > TITLE_MAX) {
        warnings.push(`Event ${n}: title was shortened to ${TITLE_MAX} characters.`);
        evTitle = evTitle.slice(0, TITLE_MAX);
      }
    }

    let severity: TimelineEvent['severity'] = 'info';
    if (!isSeverity(e.severity)) {
      local.push(`Event ${n}: "severity" must be one of ${SEVERITIES.join(', ')}.`);
    } else {
      severity = e.severity;
    }

    let status: TimelineEvent['status'] = 'open';
    if (!isStatus(e.status)) {
      local.push(`Event ${n}: "status" must be one of ${STATUSES.join(', ')}.`);
    } else {
      status = e.status;
    }

    let notes = '';
    if (e.notes !== undefined && e.notes !== null) {
      if (typeof e.notes !== 'string') {
        local.push(`Event ${n}: "notes" must be text.`);
      } else {
        notes = e.notes;
        if (notes.length > NOTES_MAX) {
          warnings.push(`Event ${n}: notes were shortened to ${NOTES_MAX} characters.`);
          notes = notes.slice(0, NOTES_MAX);
        }
      }
    }

    let order = index;
    if (e.order !== undefined) {
      if (typeof e.order === 'number' && Number.isFinite(e.order)) {
        order = Math.trunc(e.order);
      } else {
        warnings.push(`Event ${n}: "order" was not a number and was reset.`);
      }
    }

    if (local.length) {
      errors.push(...local);
      return;
    }
    events.push({ id, timestamp, title: evTitle, severity, status, notes, order });
  });

  if (errors.length) {
    if (errors.length >= MAX_ERRORS) errors.push('More problems were found; only the first 25 are shown.');
    return { ok: false, errors };
  }

  return {
    ok: true,
    incident: { schemaVersion: SCHEMA_VERSION, title, sample, events },
    warnings,
  };
}

export interface MergeResult {
  incident: Incident;
  added: number;
  replaced: number;
}

/** Merge imported events into existing ones. Same id replaces; new ids are appended. */
export function mergeIncidents(current: Incident, imported: Incident): MergeResult {
  const byId = new Map(current.events.map((e) => [e.id, e] as const));
  let replaced = 0;
  let added = 0;
  for (const e of imported.events) {
    if (byId.has(e.id)) replaced += 1;
    else added += 1;
    byId.set(e.id, e);
  }
  return {
    incident: {
      schemaVersion: SCHEMA_VERSION,
      title: current.title || imported.title,
      sample: current.sample && imported.sample,
      events: [...byId.values()],
    },
    added,
    replaced,
  };
}
