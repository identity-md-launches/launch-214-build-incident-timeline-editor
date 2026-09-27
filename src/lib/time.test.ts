// The zone is pinned so DST cases are deterministic on any machine.
// America/New_York in 2026: clocks jump 02:00 -> 03:00 on March 8 and fall
// back 02:00 -> 01:00 on November 1.
process.env.TZ = 'America/New_York';

import { describe, expect, it } from 'vitest';
import {
  formatGap,
  formatInstant,
  formatOffset,
  isValidStoredTimestamp,
  normaliseStoredTimestamp,
  nowInputText,
  parseTimestampText,
  resolveLocal,
  resolveParsed,
  toInputText,
  toIso,
} from './time';

function parse(text: string) {
  const r = parseTimestampText(text);
  if (!r.ok) throw new Error(r.reason);
  return r.parsed;
}

describe('zone pin', () => {
  it('runs in America/New_York', () => {
    expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(240);
    expect(new Date('2026-01-01T12:00:00Z').getTimezoneOffset()).toBe(300);
  });
});

describe('parseTimestampText', () => {
  it('accepts date time with space or T, seconds and fractions', () => {
    expect(parse('2026-03-08 14:05').wall).toMatchObject({ hour: 14, minute: 5, second: 0 });
    expect(parse('2026-03-08T14:05:09').wall.second).toBe(9);
    expect(parse('2026-03-08T14:05:09.5Z').wall.millisecond).toBe(500);
  });
  it('reads explicit offsets', () => {
    expect(parse('2026-03-08 14:05Z').offsetMinutes).toBe(0);
    expect(parse('2026-03-08 14:05 +02:00').offsetMinutes).toBe(120);
    expect(parse('2026-03-08 14:05-0530').offsetMinutes).toBe(-330);
    expect(parse('2026-03-08 14:05').offsetMinutes).toBeNull();
  });
  it('rejects empty, malformed and date-only input with a fix', () => {
    expect(parseTimestampText('   ')).toMatchObject({ ok: false, reason: expect.stringContaining('Enter a date and time') });
    expect(parseTimestampText('yesterday 3pm')).toMatchObject({ ok: false, reason: expect.stringContaining('YYYY-MM-DD HH:MM') });
    expect(parseTimestampText('2026-03-08')).toMatchObject({ ok: false, reason: expect.stringContaining('Add a time') });
  });
  it('rejects impossible calendar dates and clock values', () => {
    expect(parseTimestampText('2026-02-30 10:00')).toMatchObject({ ok: false, reason: expect.stringContaining('2026-02 has 28 days') });
    expect(parseTimestampText('2024-02-29 10:00').ok).toBe(true); // leap year
    expect(parseTimestampText('2026-13-01 10:00')).toMatchObject({ ok: false, reason: expect.stringContaining('month') });
    expect(parseTimestampText('2026-04-31 10:00')).toMatchObject({ ok: false, reason: expect.stringContaining('30 days') });
    expect(parseTimestampText('2026-03-08 24:00')).toMatchObject({ ok: false, reason: expect.stringContaining('00 to 23') });
    expect(parseTimestampText('2026-03-08 10:60')).toMatchObject({ ok: false, reason: expect.stringContaining('minutes') });
    expect(parseTimestampText('2026-03-08 10:00 +15:00')).toMatchObject({ ok: false, reason: expect.stringContaining('out of range') });
    expect(parseTimestampText('0999-03-08 10:00').ok).toBe(false);
  });
});

describe('resolution', () => {
  it('UTC zone reads wall clock as UTC', () => {
    const r = resolveParsed(parse('2026-03-08 02:30'), 'utc');
    expect(r).toEqual({ kind: 'unique', utcMs: Date.UTC(2026, 2, 8, 2, 30), offsetMinutes: 0 });
  });
  it('explicit offset wins over the zone', () => {
    const r = resolveParsed(parse('2026-03-08 02:30 +02:00'), 'local');
    expect(r.kind).toBe('unique');
    if (r.kind === 'unique') expect(toIso(r.utcMs)).toBe('2026-03-08T00:30:00.000Z');
  });
  it('resolves an ordinary local time uniquely', () => {
    const r = resolveLocal(parse('2026-07-04 12:00').wall);
    expect(r.kind).toBe('unique');
    if (r.kind === 'unique') {
      expect(r.offsetMinutes).toBe(-240);
      expect(toIso(r.utcMs)).toBe('2026-07-04T16:00:00.000Z');
    }
  });
  it('flags the skipped hour on spring-forward as nonexistent', () => {
    const r = resolveLocal(parse('2026-03-08 02:30').wall);
    expect(r.kind).toBe('nonexistent');
    if (r.kind === 'nonexistent') {
      expect(r.gapMinutes).toBe(60);
      expect(r.before.offsetMinutes).toBe(-300);
      expect(r.after.offsetMinutes).toBe(-240);
    }
  });
  it('flags the repeated hour on fall-back as ambiguous with both instants', () => {
    const r = resolveLocal(parse('2026-11-01 01:30').wall);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(toIso(r.candidates[0].utcMs)).toBe('2026-11-01T05:30:00.000Z');
      expect(r.candidates[0].offsetMinutes).toBe(-240);
      expect(toIso(r.candidates[1].utcMs)).toBe('2026-11-01T06:30:00.000Z');
      expect(r.candidates[1].offsetMinutes).toBe(-300);
    }
  });
  it('times just outside the transition resolve uniquely', () => {
    expect(resolveLocal(parse('2026-03-08 01:59').wall).kind).toBe('unique');
    expect(resolveLocal(parse('2026-03-08 03:00').wall).kind).toBe('unique');
    expect(resolveLocal(parse('2026-11-01 00:59').wall).kind).toBe('unique');
    expect(resolveLocal(parse('2026-11-01 02:00').wall).kind).toBe('unique');
  });
});

describe('formatting', () => {
  it('formats in UTC and local with offset labels', () => {
    const iso = '2026-11-01T05:30:00.000Z';
    expect(formatInstant(iso, 'utc')).toEqual({ date: '2026-11-01', time: '05:30:00', offsetMinutes: 0, offsetLabel: 'UTC' });
    expect(formatInstant(iso, 'local')).toEqual({ date: '2026-11-01', time: '01:30:00', offsetMinutes: -240, offsetLabel: 'UTC-04:00' });
    expect(formatOffset(330)).toBe('UTC+05:30');
  });
  it('edit text always carries the offset so an ambiguous local time round-trips exactly', () => {
    const iso = '2026-11-01T06:30:00.000Z'; // second 01:30 (EST)
    const text = toInputText(iso, 'local');
    expect(text).toBe('2026-11-01 01:30:00 -05:00');
    const r = resolveParsed(parse(text), 'local');
    expect(r.kind).toBe('unique');
    if (r.kind === 'unique') expect(toIso(r.utcMs)).toBe(iso);
    expect(toInputText(iso, 'utc')).toBe('2026-11-01 06:30:00 Z');
  });
  it('now text has no offset and is second precision', () => {
    expect(nowInputText('utc', Date.UTC(2026, 0, 2, 3, 4, 5, 678))).toBe('2026-01-02 03:04:05');
  });
  it('gaps read as short durations', () => {
    expect(formatGap('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe('same time');
    expect(formatGap('2026-01-01T00:00:00Z', '2026-01-01T00:03:00Z')).toBe('+3 min');
    expect(formatGap('2026-01-01T00:00:00Z', '2026-01-01T01:12:00Z')).toBe('+1 h 12 min');
    expect(formatGap('2026-01-01T00:00:00Z', '2026-01-03T04:00:00Z')).toBe('+2 d 4 h');
    expect(formatGap('2026-01-01T00:00:10Z', '2026-01-01T00:00:00Z')).toBe('-10 s');
  });
});

describe('stored timestamps', () => {
  it('requires an explicit offset and rejects impossible dates', () => {
    expect(isValidStoredTimestamp('2026-03-08T14:05:00Z')).toBe(true);
    expect(isValidStoredTimestamp('2026-03-08T14:05:00.250+02:00')).toBe(true);
    expect(isValidStoredTimestamp('2026-03-08T14:05:00')).toBe(false);
    expect(isValidStoredTimestamp('2026-02-30T14:05:00Z')).toBe(false);
    expect(isValidStoredTimestamp('2026-03-08 14:05:00Z')).toBe(false);
    expect(isValidStoredTimestamp(1710000000)).toBe(false);
  });
  it('normalises to UTC with milliseconds', () => {
    expect(normaliseStoredTimestamp('2026-03-08T14:05+02:00')).toBe('2026-03-08T12:05:00.000Z');
  });
});
