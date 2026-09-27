import type { Incident } from './model';

/**
 * Synthetic example incident. Every name, host and number here is invented for
 * demonstration; nothing refers to a real system or outage.
 */
export function sampleIncident(): Incident {
  return {
    schemaVersion: 1,
    title: 'SAMPLE: Checkout API latency (synthetic data)',
    sample: true,
    events: [
      {
        id: 'sample-01',
        timestamp: '2026-03-29T00:41:00.000Z',
        title: 'Latency alert fired for checkout-api p95',
        severity: 'medium',
        status: 'open',
        notes: 'Synthetic alert from the example monitor "checkout-p95-latency". Threshold 800 ms, observed 1 420 ms.',
        order: 0,
      },
      {
        id: 'sample-02',
        timestamp: '2026-03-29T00:47:30.000Z',
        title: 'On-call acknowledged and opened a bridge',
        severity: 'info',
        status: 'investigating',
        notes: '',
        order: 0,
      },
      {
        id: 'sample-03',
        timestamp: '2026-03-29T00:55:00.000Z',
        title: 'Error rate crossed 5% on checkout-api',
        severity: 'high',
        status: 'investigating',
        notes: 'Same instant as the next event on purpose: two monitors fired together. Use "Move up" and "Move down" to order them.',
        order: 0,
      },
      {
        id: 'sample-04',
        timestamp: '2026-03-29T00:55:00.000Z',
        title: 'Database connection pool exhausted (example-db-3)',
        severity: 'high',
        status: 'investigating',
        notes: 'Shares its timestamp with the previous event.',
        order: 1,
      },
      {
        id: 'sample-05',
        timestamp: '2026-03-29T01:12:00.000Z',
        title: 'Root cause suspected: runaway report query',
        severity: 'critical',
        status: 'investigating',
        notes: 'A scheduled report job (synthetic "nightly-ledger-export") held long transactions.',
        order: 0,
      },
      {
        id: 'sample-06',
        timestamp: '2026-03-29T01:20:00.000Z',
        title: 'Report job paused, pool recovering',
        severity: 'medium',
        status: 'mitigated',
        notes: 'In many European zones 2026-03-29 is the spring-forward date; local times between 02:00 and 03:00 do not exist there. Try adding an event at 2026-03-29 02:30 in local mode to see the guidance.',
        order: 0,
      },
      {
        id: 'sample-07',
        timestamp: '2026-03-29T01:58:00.000Z',
        title: 'Latency back under threshold for 30 minutes',
        severity: 'low',
        status: 'mitigated',
        notes: '',
        order: 0,
      },
      {
        id: 'sample-08',
        timestamp: '2026-03-29T03:05:00.000Z',
        title: 'Incident resolved; postmortem scheduled',
        severity: 'info',
        status: 'resolved',
        notes: 'Follow-up: add a query timeout to the report job (synthetic action item).',
        order: 0,
      },
    ],
  };
}
