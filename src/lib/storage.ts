import type { Incident } from './model';
import { validateIncidentJson } from './importExport';

export const STORAGE_KEY = 'incident-timeline-editor:v1';
export const PREFS_KEY = 'incident-timeline-editor:prefs';

export type StorageProbe = { available: true } | { available: false; reason: string };

/** Detect whether localStorage can actually be written (private mode, disabled storage, sandboxes). */
export function probeStorage(): StorageProbe {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { available: false, reason: 'This browser does not expose local storage.' };
    }
    const probe = `${STORAGE_KEY}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { available: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    return {
      available: false,
      reason:
        name === 'SecurityError'
          ? 'Local storage is blocked by browser settings or an embedded context.'
          : 'Local storage cannot be written in this browser.',
    };
  }
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; incident: Incident; warnings: string[] }
  | { kind: 'corrupt'; error: string; raw: string };

export function loadIncident(): LoadResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'empty' };
  }
  if (raw === null || raw === '') return { kind: 'empty' };
  const result = validateIncidentJson(raw);
  if (result.ok) return { kind: 'loaded', incident: result.incident, warnings: result.warnings };
  return { kind: 'corrupt', error: result.errors.join(' '), raw };
}

export type SaveResult = { ok: true; savedAt: number } | { ok: false; reason: string };

export function saveIncident(incident: Incident): SaveResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(incident));
    return { ok: true, savedAt: Date.now() };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
    return {
      ok: false,
      reason: quota
        ? 'Browser storage is full. Export JSON to keep your changes.'
        : 'Browser storage rejected the write. Export JSON to keep your changes.',
    };
  }
}

export function clearStoredIncident(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export interface Prefs {
  zone: 'utc' | 'local';
  sort: 'asc' | 'desc';
}

export function loadPrefs(): Partial<Prefs> {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    const o = obj as Record<string, unknown>;
    const prefs: Partial<Prefs> = {};
    if (o.zone === 'utc' || o.zone === 'local') prefs.zone = o.zone;
    if (o.sort === 'asc' || o.sort === 'desc') prefs.sort = o.sort;
    return prefs;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* preferences are best-effort */
  }
}
