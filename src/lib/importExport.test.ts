import { describe, expect, it } from 'vitest';
import { mergeIncidents, serializeIncident, validateIncidentJson } from './importExport';
import { sampleIncident } from './sample';
import { moveWithinTie, nextOrderFor, sortEvents, type TimelineEvent } from './model';

const ev = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'a',
  timestamp: '2026-03-08T14:05:00.000Z',
  title: 'Thing happened',
  severity: 'info',
  status: 'open',
  notes: '',
  order: 0,
  ...over,
});

describe('validateIncidentJson', () => {
  it('round-trips an export', () => {
    const text = serializeIncident(sampleIncident(), new Date('2026-04-01T00:00:00Z'));
    const r = validateIncidentJson(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.incident.events).toHaveLength(8);
      expect(r.incident.title).toContain('SAMPLE');
      expect(r.incident.sample).toBe(true);
      expect(r.warnings).toEqual([]);
    }
  });
  it('rejects non-JSON, empty text and wrong root types', () => {
    expect(validateIncidentJson('')).toMatchObject({ ok: false, errors: [expect.stringContaining('empty')] });
    expect(validateIncidentJson('{not json')).toMatchObject({ ok: false, errors: [expect.stringContaining('not valid JSON')] });
    expect(validateIncidentJson('42')).toMatchObject({ ok: false, errors: [expect.stringContaining('must be an object')] });
    expect(validateIncidentJson('{"events": "nope"}')).toMatchObject({ ok: false, errors: [expect.stringContaining('"events" must be a list')] });
  });
  it('rejects unknown schema versions', () => {
    const r = validateIncidentJson(JSON.stringify({ schemaVersion: 2, events: [] }));
    expect(r).toMatchObject({ ok: false, errors: [expect.stringContaining('Unsupported schemaVersion 2')] });
  });
  it('accepts a bare array with a warning and fills defaults', () => {
    const r = validateIncidentJson(JSON.stringify([{ timestamp: '2026-03-08T14:05:00Z', title: 'x', severity: 'low', status: 'open' }]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.join(' ')).toContain('bare list');
      expect(r.warnings.join(' ')).toContain('missing id');
      expect(r.incident.events[0]).toMatchObject({ notes: '', order: 0, timestamp: '2026-03-08T14:05:00.000Z' });
    }
  });
  it('reports every bad field with the event position', () => {
    const r = validateIncidentJson(
      JSON.stringify({
        schemaVersion: 1,
        events: [
          { id: 'ok', timestamp: '2026-03-08T14:05:00Z', title: 'fine', severity: 'low', status: 'open' },
          { id: 'bad', timestamp: '2026-02-30T14:05:00Z', title: '', severity: 'urgent', status: 'done', notes: 5 },
          { id: 'bad2', timestamp: '2026-03-08 14:05', title: 'no offset', severity: 'low', status: 'open' },
          'not an object',
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        expect.stringContaining('Event 2: "timestamp"'),
        expect.stringContaining('Event 2: "title"'),
        expect.stringContaining('Event 2: "severity"'),
        expect.stringContaining('Event 2: "status"'),
        expect.stringContaining('Event 2: "notes"'),
        expect.stringContaining('Event 3: "timestamp"'),
        expect.stringContaining('Event 4: must be an object'),
      ]);
    }
  });
  it('replaces duplicate ids and keeps the file importable', () => {
    const r = validateIncidentJson(JSON.stringify({ events: [ev(), ev({ title: 'second' })] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(new Set(r.incident.events.map((e) => e.id)).size).toBe(2);
      expect(r.warnings.join(' ')).toContain('duplicate id');
    }
  });
});

describe('mergeIncidents', () => {
  it('replaces by id and appends new ones', () => {
    const current = { schemaVersion: 1 as const, title: 'Mine', sample: false, events: [ev({ id: 'a' }), ev({ id: 'b' })] };
    const imported = { schemaVersion: 1 as const, title: 'Theirs', sample: true, events: [ev({ id: 'b', title: 'updated' }), ev({ id: 'c' })] };
    const m = mergeIncidents(current, imported);
    expect(m.added).toBe(1);
    expect(m.replaced).toBe(1);
    expect(m.incident.title).toBe('Mine');
    expect(m.incident.sample).toBe(false);
    expect(m.incident.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(m.incident.events[1]?.title).toBe('updated');
  });
});

describe('ordering', () => {
  const t0 = '2026-03-08T14:05:00.000Z';
  const t1 = '2026-03-08T14:06:00.000Z';
  it('orders by instant, then tie order, then id', () => {
    const list = [ev({ id: 'z', timestamp: t1 }), ev({ id: 'b', timestamp: t0, order: 1 }), ev({ id: 'c', timestamp: t0, order: 0 }), ev({ id: 'a', timestamp: t0, order: 0 })];
    expect(sortEvents(list).map((e) => e.id)).toEqual(['a', 'c', 'b', 'z']);
    expect(sortEvents(list, 'desc').map((e) => e.id)).toEqual(['z', 'b', 'c', 'a']);
  });
  it('nextOrderFor places a new event after existing ties', () => {
    const list = [ev({ id: 'a', timestamp: t0, order: 0 }), ev({ id: 'b', timestamp: t0, order: 3 })];
    expect(nextOrderFor(list, t0)).toBe(4);
    expect(nextOrderFor(list, t1)).toBe(0);
    expect(nextOrderFor(list, t0, 'b')).toBe(1);
  });
  it('moveWithinTie swaps only inside the tie group', () => {
    const list = [ev({ id: 'a', timestamp: t0, order: 0 }), ev({ id: 'b', timestamp: t0, order: 1 }), ev({ id: 'c', timestamp: t1 })];
    const moved = moveWithinTie(list, 'b', 'earlier');
    expect(sortEvents(moved).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    // cannot move across a different instant
    expect(sortEvents(moveWithinTie(list, 'c', 'earlier')).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(sortEvents(moveWithinTie(list, 'a', 'earlier')).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
