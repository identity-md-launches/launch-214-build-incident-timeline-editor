/**
 * Timestamp parsing, resolution and formatting.
 *
 * Storage is always a UTC instant (ISO 8601, trailing Z). Users type wall-clock
 * text which is interpreted in the chosen zone (UTC or the browser's local
 * zone) unless the text carries its own offset. Local wall-clock times can be
 * ambiguous (clocks moved back, the time happened twice) or nonexistent (clocks
 * moved forward, the time was skipped); both are detected and reported rather
 * than silently guessed.
 */

export type Zone = 'utc' | 'local';

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export interface ParsedInput {
  wall: WallClock;
  /** Minutes east of UTC when the text carried an explicit offset or Z. */
  offsetMinutes: number | null;
}

export type ParseFailure = { ok: false; reason: string };
export type ParseSuccess = { ok: true; parsed: ParsedInput };

const INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|z|[+-]\d{2}:?\d{2})?$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse user text such as `2026-03-08 02:30`, `2026-03-08T02:30:00Z`, `2026-03-08 02:30 +02:00`. */
export function parseTimestampText(raw: string): ParseSuccess | ParseFailure {
  const text = raw.trim();
  if (text === '') {
    return { ok: false, reason: 'Enter a date and time, for example 2026-03-08 14:05.' };
  }
  const m = INPUT_RE.exec(text);
  if (!m) {
    return {
      ok: false,
      reason:
        'Use the format YYYY-MM-DD HH:MM, optionally with seconds and a UTC offset such as Z or +02:00. Example: 2026-03-08 14:05.',
    };
  }
  const [, y, mo, d, h, mi, s, ms, off] = m;
  if (h === undefined) {
    return { ok: false, reason: 'Add a time after the date, for example 2026-03-08 14:05.' };
  }
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s === undefined ? 0 : Number(s);
  const millisecond = ms === undefined ? 0 : Number(ms.padEnd(3, '0'));

  if (year < 1900 || year > 2200) {
    return { ok: false, reason: `Use a year between 1900 and 2200 (you entered ${year}).` };
  }
  if (month < 1 || month > 12) {
    return { ok: false, reason: `Use a month from 01 to 12 (you entered ${mo}).` };
  }
  const dim = daysInMonth(year, month);
  if (day < 1 || day > dim) {
    return {
      ok: false,
      reason: `${y}-${mo} has ${dim} days, so day ${d} does not exist. Use a day from 01 to ${String(dim).padStart(2, '0')}.`,
    };
  }
  if (hour > 23) {
    return { ok: false, reason: `Use an hour from 00 to 23 (you entered ${h}). Midnight is 00:00.` };
  }
  if (minute > 59) {
    return { ok: false, reason: `Use minutes from 00 to 59 (you entered ${mi}).` };
  }
  if (second > 59) {
    return { ok: false, reason: `Use seconds from 00 to 59 (you entered ${s}).` };
  }

  let offsetMinutes: number | null = null;
  if (off !== undefined) {
    if (off === 'Z' || off === 'z') {
      offsetMinutes = 0;
    } else {
      const sign = off.startsWith('-') ? -1 : 1;
      const digits = off.slice(1).replace(':', '');
      const oh = Number(digits.slice(0, 2));
      const om = Number(digits.slice(2, 4));
      if (oh > 14 || om > 59) {
        return { ok: false, reason: `UTC offset ${off} is out of range. Offsets run from -12:00 to +14:00.` };
      }
      offsetMinutes = sign * (oh * 60 + om);
    }
  }
  return { ok: true, parsed: { wall: { year, month, day, hour, minute, second, millisecond }, offsetMinutes } };
}

function wallAsUtcMs(w: WallClock): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond);
}

/** Minutes east of UTC for the browser's local zone at a given instant. */
export function localOffsetAt(utcMs: number): number {
  return -new Date(utcMs).getTimezoneOffset();
}

export interface Candidate {
  utcMs: number;
  offsetMinutes: number;
}

export type Resolution =
  | { kind: 'unique'; utcMs: number; offsetMinutes: number }
  | { kind: 'ambiguous'; candidates: [Candidate, Candidate] }
  | { kind: 'nonexistent'; before: Candidate; after: Candidate; gapMinutes: number };

/**
 * Resolve a local wall-clock time to UTC using the browser's zone rules.
 * Tries every offset the zone uses around that day and keeps the ones that
 * round-trip back to the same wall clock.
 */
export function resolveLocal(w: WallClock): Resolution {
  const naive = wallAsUtcMs(w);
  const dayMs = 24 * 60 * 60 * 1000;
  const offsets = new Set<number>([
    localOffsetAt(naive - dayMs),
    localOffsetAt(naive),
    localOffsetAt(naive + dayMs),
  ]);
  const valid: Candidate[] = [];
  for (const off of offsets) {
    const utcMs = naive - off * 60_000;
    if (localOffsetAt(utcMs) === off) valid.push({ utcMs, offsetMinutes: off });
  }
  valid.sort((a, b) => a.utcMs - b.utcMs);
  const first = valid[0];
  const second = valid[1];
  if (first && second) {
    return { kind: 'ambiguous', candidates: [first, second] };
  }
  if (first) {
    return { kind: 'unique', utcMs: first.utcMs, offsetMinutes: first.offsetMinutes };
  }
  // Nonexistent: the wall clock fell into a forward jump. Report the offsets on
  // either side and the size of the gap so the message can say what happened.
  const sorted = [...offsets].sort((a, b) => a - b);
  const lo = sorted[0] ?? 0;
  const hi = sorted[sorted.length - 1] ?? lo;
  const before = { utcMs: naive - lo * 60_000, offsetMinutes: lo };
  const after = { utcMs: naive - hi * 60_000, offsetMinutes: hi };
  return { kind: 'nonexistent', before, after, gapMinutes: hi - lo };
}

export function resolveParsed(parsed: ParsedInput, zone: Zone): Resolution {
  if (parsed.offsetMinutes !== null) {
    const utcMs = wallAsUtcMs(parsed.wall) - parsed.offsetMinutes * 60_000;
    return { kind: 'unique', utcMs, offsetMinutes: parsed.offsetMinutes };
  }
  if (zone === 'utc') {
    return { kind: 'unique', utcMs: wallAsUtcMs(parsed.wall), offsetMinutes: 0 };
  }
  return resolveLocal(parsed.wall);
}

export function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `UTC`, `UTC+02:00`, `UTC-05:30`. Hyphen-minus is used so the label can be typed back. */
export function formatOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC';
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** `Z`, `+02:00`, `-05:30`: the ISO 8601 suffix form. */
export function formatIsoOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'Z';
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export interface FormattedInstant {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  offsetMinutes: number;
  offsetLabel: string; // UTC or UTC+02:00
}

export function formatInstant(iso: string, zone: Zone): FormattedInstant {
  const d = new Date(iso);
  if (zone === 'utc') {
    return {
      date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
      time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`,
      offsetMinutes: 0,
      offsetLabel: 'UTC',
    };
  }
  const off = -d.getTimezoneOffset();
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
    offsetMinutes: off,
    offsetLabel: formatOffset(off),
  };
}

/** Editable text for a stored instant. Always carries the offset so it round-trips exactly. */
export function toInputText(iso: string, zone: Zone): string {
  const f = formatInstant(iso, zone);
  return `${f.date} ${f.time} ${formatIsoOffset(f.offsetMinutes)}`;
}

/** Text for "now", to the second, in the chosen zone. */
export function nowInputText(zone: Zone, nowMs: number = Date.now()): string {
  const iso = toIso(Math.floor(nowMs / 1000) * 1000);
  const f = formatInstant(iso, zone);
  return `${f.date} ${f.time}`;
}

/** IANA zone name of the browser, or a fallback label. */
export function localZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}

/** Short zone abbreviation at an instant, such as `CET` or `GMT+2`. */
export function localZoneAbbreviation(utcMs: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(utcMs));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Human duration between two instants: `+3 min`, `+1 h 12 min`, `+2 d 4 h`, `same time`. */
export function formatGap(fromIso: string, toIso: string): string {
  const diff = Date.parse(toIso) - Date.parse(fromIso);
  if (diff === 0) return 'same time';
  const sign = diff < 0 ? '-' : '+';
  let s = Math.round(Math.abs(diff) / 1000);
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m && !d) parts.push(`${m} min`);
  if (!d && !h && !m) parts.push(`${s} s`);
  return `${sign}${parts.slice(0, 2).join(' ')}`;
}

/** Strict check for a stored timestamp: ISO 8601 with an explicit Z or offset that parses. */
export function isValidStoredTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const parsed = parseTimestampText(value);
  return parsed.ok;
}

/** Normalise any accepted stored timestamp to the canonical UTC form with milliseconds. */
export function normaliseStoredTimestamp(value: string): string {
  const parsed = parseTimestampText(value);
  if (!parsed.ok) throw new Error(parsed.reason);
  const r = resolveParsed(parsed.parsed, 'utc');
  if (r.kind !== 'unique') throw new Error('Unexpected ambiguity in an offset timestamp');
  return toIso(r.utcMs);
}
