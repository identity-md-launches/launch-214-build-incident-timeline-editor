export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUSES = ['open', 'investigating', 'mitigated', 'resolved'] as const;
export type Status = (typeof STATUSES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  investigating: 'Investigating',
  mitigated: 'Mitigated',
  resolved: 'Resolved',
};

export interface TimelineEvent {
  id: string;
  /** Instant in UTC, ISO 8601 with millisecond precision and a trailing Z. */
  timestamp: string;
  title: string;
  severity: Severity;
  status: Status;
  notes: string;
  /** Tie-breaker used only when two events share the same instant. Lower comes first. */
  order: number;
}

export interface Incident {
  schemaVersion: 1;
  title: string;
  /** True when the data was loaded from the built-in synthetic example. */
  sample: boolean;
  events: TimelineEvent[];
}

export const SCHEMA_VERSION = 1 as const;
export const TITLE_MAX = 200;
export const NOTES_MAX = 4000;

export function emptyIncident(): Incident {
  return { schemaVersion: SCHEMA_VERSION, title: '', sample: false, events: [] };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export type SortDirection = 'asc' | 'desc';

/**
 * Timeline order is always the real instant. Equal instants fall back to the
 * explicit `order` value, then the id, so the result is stable and deterministic
 * regardless of insertion order.
 */
export function sortEvents(events: readonly TimelineEvent[], direction: SortDirection = 'asc'): TimelineEvent[] {
  const sorted = [...events].sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (ta !== tb) return ta - tb;
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

/** Next `order` value for an event placed at `timestamp` (after any existing ties). */
export function nextOrderFor(events: readonly TimelineEvent[], timestamp: string, excludeId?: string): number {
  const t = Date.parse(timestamp);
  let max = -1;
  for (const e of events) {
    if (e.id === excludeId) continue;
    if (Date.parse(e.timestamp) === t) max = Math.max(max, e.order);
  }
  return max + 1;
}

/**
 * Swap tie-order with the neighbour that shares the same instant.
 * Returns the same array when there is no such neighbour in that direction.
 */
export function moveWithinTie(
  events: readonly TimelineEvent[],
  id: string,
  direction: 'earlier' | 'later',
): TimelineEvent[] {
  const sorted = sortEvents(events, 'asc');
  const index = sorted.findIndex((e) => e.id === id);
  if (index === -1) return [...events];
  const current = sorted[index];
  const neighbourIndex = direction === 'earlier' ? index - 1 : index + 1;
  const neighbour = sorted[neighbourIndex];
  if (!current || !neighbour) return [...events];
  if (Date.parse(neighbour.timestamp) !== Date.parse(current.timestamp)) return [...events];
  // Renumber the whole tie group so swaps stay well-defined even after imports
  // that left gaps or duplicates in `order`.
  const group = sorted.filter((e) => Date.parse(e.timestamp) === Date.parse(current.timestamp));
  const gi = group.findIndex((e) => e.id === id);
  const gj = direction === 'earlier' ? gi - 1 : gi + 1;
  const a = group[gi];
  const b = group[gj];
  if (!a || !b) return [...events];
  group[gi] = b;
  group[gj] = a;
  const orderById = new Map(group.map((e, i) => [e.id, i] as const));
  return events.map((e) => {
    const o = orderById.get(e.id);
    return o === undefined ? e : { ...e, order: o };
  });
}

/** Count of events sharing an instant with at least one other event. */
export function tieGroups(events: readonly TimelineEvent[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const e of events) {
    const t = Date.parse(e.timestamp);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}
