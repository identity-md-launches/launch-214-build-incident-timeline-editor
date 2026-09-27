import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventForm, TIMESTAMP_INPUT_ID, type EventValues } from './components/EventForm';
import { Timeline } from './components/Timeline';
import { StorageStatus, type StorageState } from './components/StorageStatus';
import { ConfirmDialog, ImportDialog } from './components/Dialogs';
import { Guidance } from './components/Guidance';
import { IconDownload, IconPlus, IconSpark, IconTrash, IconUpload, IconWarning, IconX } from './components/Icons';
import {
  SEVERITIES,
  SEVERITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TITLE_MAX,
  emptyIncident,
  moveWithinTie,
  newId,
  nextOrderFor,
  sortEvents,
  tieGroups,
  type Incident,
  type Severity,
  type SortDirection,
  type Status,
  type TimelineEvent,
} from './lib/model';
import { exportFileName, serializeIncident } from './lib/importExport';
import { sampleIncident } from './lib/sample';
import {
  clearStoredIncident,
  loadIncident,
  loadPrefs,
  probeStorage,
  saveIncident,
  savePrefs,
  type LoadResult,
} from './lib/storage';
import { localZoneName, type Zone } from './lib/time';

interface Toast {
  id: number;
  message: string;
  undo?: (() => void) | undefined;
  /** Toasts with an action stay until dismissed; plain ones time out. */
  persistent: boolean;
}

interface InitialState {
  probe: ReturnType<typeof probeStorage>;
  load: LoadResult;
  incident: Incident;
  storage: StorageState;
}

function initialise(): InitialState {
  const probe = probeStorage();
  if (!probe.available) {
    return { probe, load: { kind: 'empty' }, incident: emptyIncident(), storage: { kind: 'unavailable', reason: probe.reason, dirty: false } };
  }
  const load = loadIncident();
  if (load.kind === 'loaded') {
    return { probe, load, incident: load.incident, storage: { kind: 'saved', at: Date.now() } };
  }
  if (load.kind === 'corrupt') {
    return { probe, load, incident: emptyIncident(), storage: { kind: 'paused' } };
  }
  return { probe, load, incident: emptyIncident(), storage: { kind: 'saved', at: Date.now() } };
}

const AUTOSAVE_DELAY = 400;

export function App() {
  const [init] = useState(initialise);
  const [incident, setIncident] = useState<Incident>(init.incident);
  const [storage, setStorage] = useState<StorageState>(init.storage);
  const [corrupt, setCorrupt] = useState(init.load.kind === 'corrupt' ? init.load : null);
  const [zone, setZone] = useState<Zone>(() => loadPrefs().zone ?? 'utc');
  const [sort, setSort] = useState<SortDirection>(() => loadPrefs().sort ?? 'asc');
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const zoneName = useMemo(() => localZoneName(), []);
  const firstRender = useRef(true);
  const dirtyRef = useRef(false);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const toastCounter = useRef(0);
  const loadedWarnings = init.load.kind === 'loaded' ? init.load.warnings : [];

  // ---- persistence -------------------------------------------------------
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    dirtyRef.current = true;
    if (!init.probe.available) {
      setStorage({ kind: 'unavailable', reason: init.probe.reason, dirty: true });
      return;
    }
    if (corrupt) {
      setStorage({ kind: 'paused' });
      return;
    }
    setStorage({ kind: 'unsaved' });
    const handle = window.setTimeout(() => {
      const r = saveIncident(incident);
      if (r.ok) {
        dirtyRef.current = false;
        setStorage({ kind: 'saved', at: r.savedAt });
      } else {
        setStorage({ kind: 'error', reason: r.reason });
      }
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(handle);
  }, [incident, corrupt, init.probe]);

  useEffect(() => {
    savePrefs({ zone, sort });
  }, [zone, sort]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---- toasts ------------------------------------------------------------
  const showToast = useCallback((message: string, undo?: () => void) => {
    toastCounter.current += 1;
    setToast({ id: toastCounter.current, message, undo, persistent: Boolean(undo) });
  }, []);

  useEffect(() => {
    if (!toast || toast.persistent) return;
    const handle = window.setTimeout(() => setToast((t) => (t && t.id === toast.id ? null : t)), 8000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  // ---- derived -----------------------------------------------------------
  const sortedAll = useMemo(() => sortEvents(incident.events, 'asc'), [incident.events]);
  const tieCounts = useMemo(() => tieGroups(incident.events), [incident.events]);
  const tiePosition = useMemo(() => {
    const map = new Map<string, { index: number; size: number }>();
    let i = 0;
    while (i < sortedAll.length) {
      const t = Date.parse(sortedAll[i]!.timestamp);
      let j = i;
      while (j < sortedAll.length && Date.parse(sortedAll[j]!.timestamp) === t) j += 1;
      const size = j - i;
      for (let k = i; k < j; k += 1) map.set(sortedAll[k]!.id, { index: k - i, size });
      i = j;
    }
    return map;
  }, [sortedAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sortedAll.filter((e) => {
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (q && !(e.title.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q))) return false;
      return true;
    });
    return sort === 'asc' ? list : [...list].reverse();
  }, [sortedAll, query, severityFilter, statusFilter, sort]);

  const isFiltering = query.trim() !== '' || severityFilter !== 'all' || statusFilter !== 'all';
  const editing = editingId ? (incident.events.find((e) => e.id === editingId) ?? null) : null;

  // ---- handlers ----------------------------------------------------------
  function updateEvents(fn: (events: TimelineEvent[]) => TimelineEvent[]) {
    setIncident((inc) => ({ ...inc, events: fn(inc.events) }));
  }

  function handleSubmit(values: EventValues) {
    if (editing) {
      const id = editing.id;
      updateEvents((events) =>
        events.map((e) =>
          e.id === id
            ? {
                ...e,
                ...values,
                order: e.timestamp === values.timestamp ? e.order : nextOrderFor(events, values.timestamp, id),
              }
            : e,
        ),
      );
      setEditingId(null);
      showToast(`Saved changes to “${values.title}”.`);
      requestAnimationFrame(() => editButtonRefs.current.get(id)?.focus());
    } else {
      const id = newId();
      updateEvents((events) => [...events, { id, ...values, order: nextOrderFor(events, values.timestamp) }]);
      showToast(`Added “${values.title}”.`);
    }
  }

  function handleDelete(event: TimelineEvent) {
    updateEvents((events) => events.filter((e) => e.id !== event.id));
    if (editingId === event.id) setEditingId(null);
    showToast(`Deleted “${event.title}”.`, () => {
      updateEvents((events) => [...events, event]);
      setToast(null);
      requestAnimationFrame(() => editButtonRefs.current.get(event.id)?.focus());
    });
  }

  function handleMoveTie(event: TimelineEvent, direction: 'earlier' | 'later') {
    updateEvents((events) => moveWithinTie(events, event.id, direction));
  }

  function handleExport() {
    const text = serializeIncident(incident);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${incident.events.length} event${incident.events.length === 1 ? '' : 's'} as ${a.download}.`);
  }

  function handleImport(next: Incident, summary: string) {
    setIncident(next);
    setEditingId(null);
    setImportOpen(false);
    showToast(summary);
  }

  function handleLoadSample() {
    setIncident(sampleIncident());
    setEditingId(null);
    setQuery('');
    setSeverityFilter('all');
    setStatusFilter('all');
    showToast('Loaded the synthetic sample incident. Everything in it is invented.');
  }

  function handleClearAll() {
    const count = incident.events.length;
    setIncident(emptyIncident());
    setEditingId(null);
    setClearOpen(false);
    showToast(`Deleted all ${count} event${count === 1 ? '' : 's'}.`);
  }

  function downloadCorruptRaw() {
    if (!corrupt) return;
    const blob = new Blob([corrupt.raw], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incident-timeline-unreadable-data.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function discardCorrupt() {
    clearStoredIncident();
    setCorrupt(null);
    setStorage({ kind: 'saved', at: Date.now() });
    showToast('Unreadable stored data was discarded. Saving is on again.');
  }

  function focusForm(e: { preventDefault: () => void }) {
    const input = document.getElementById(TIMESTAMP_INPUT_ID);
    if (!input) return; // fall back to the plain anchor jump
    e.preventDefault();
    if (editingId) setEditingId(null);
    input.scrollIntoView({ block: 'nearest' });
    input.focus();
  }

  const total = incident.events.length;
  const countText =
    total === 0
      ? '0 events'
      : isFiltering
        ? `${filtered.length} of ${total} event${total === 1 ? '' : 's'} match`
        : `${total} event${total === 1 ? '' : 's'}`;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <img className="brand__mark" src="./favicon.svg" alt="" width={32} height={32} />
            <div>
              <h1>Incident Timeline Editor</h1>
              <p className="brand__tagline">Works offline. Data stays in this browser.</p>
            </div>
          </div>
          <StorageStatus state={storage} />
        </div>
      </header>

      <main id="main" className="app-main">
        {corrupt && (
          <div className="banner" role="alert">
            <IconWarning size={20} />
            <div className="banner__body">
              <p>
                <strong>Stored data could not be read.</strong> {corrupt.error} Saving is paused so the stored data is not
                overwritten. Download it to inspect, then discard it to start saving again.
              </p>
              <div className="banner__actions">
                <button type="button" className="btn btn--sm" onClick={downloadCorruptRaw}>
                  <IconDownload size={14} />
                  Download stored data
                </button>
                <button type="button" className="btn btn--sm" onClick={discardCorrupt}>
                  <IconTrash size={14} />
                  Discard stored data
                </button>
              </div>
            </div>
          </div>
        )}
        {loadedWarnings.length > 0 && (
          <div className="banner">
            <IconWarning size={20} />
            <div className="banner__body">
              <p>
                <strong>Stored data was repaired on load.</strong> {loadedWarnings.join(' ')}
              </p>
            </div>
          </div>
        )}

        <section className="incident-bar" aria-labelledby="incident-heading">
          <h2 id="incident-heading" className="sr-only">
            Incident
          </h2>
          <div className="incident-bar__row">
            <div className="field incident-bar__title">
              <label className="field__label" htmlFor="incident-title">
                Incident title
              </label>
              <input
                id="incident-title"
                className="input"
                type="text"
                autoComplete="off"
                maxLength={TITLE_MAX}
                placeholder="Checkout API latency"
                value={incident.title}
                onChange={(e) => setIncident((inc) => ({ ...inc, title: e.target.value }))}
              />
            </div>
            <fieldset className="fieldset">
              <legend>Show times in</legend>
              <div className="segmented" role="radiogroup" aria-label="Time display zone">
                <label className="segmented__option">
                  <input type="radio" name="zone" value="utc" checked={zone === 'utc'} onChange={() => setZone('utc')} />
                  UTC
                </label>
                <label className="segmented__option">
                  <input type="radio" name="zone" value="local" checked={zone === 'local'} onChange={() => setZone('local')} />
                  Local <span className="segmented__zone">({zoneName})</span>
                </label>
              </div>
            </fieldset>
          </div>
          <div className="incident-bar__row">
            {incident.sample && (
              <span className="badge badge--sample">
                <IconSpark size={14} />
                Sample data: synthetic, not a real incident
              </span>
            )}
            <div className="incident-bar__actions">
              <a className="btn btn--has-icon-start" href="#event-form" onClick={focusForm}>
                <IconPlus />
                Add event
              </a>
              <button type="button" className="btn btn--has-icon-start" onClick={handleLoadSample}>
                <IconSpark />
                Load sample
              </button>
              <button type="button" className="btn btn--has-icon-start" onClick={handleExport} disabled={total === 0}>
                <IconDownload />
                Export JSON
              </button>
              <button type="button" className="btn btn--has-icon-start" onClick={() => setImportOpen(true)}>
                <IconUpload />
                Import JSON
              </button>
              <button
                type="button"
                className="btn btn--danger btn--has-icon-start"
                onClick={() => setClearOpen(true)}
                disabled={total === 0}
              >
                <IconTrash />
                Clear all
              </button>
            </div>
          </div>
        </section>

        <div className="workspace">
          <section className="panel panel--timeline" aria-labelledby="timeline-heading">
            <div className="panel__head">
              <h2 id="timeline-heading">Timeline</h2>
              <p className="panel__hint">Ordered by actual time, {sort === 'asc' ? 'oldest first' : 'newest first'}.</p>
            </div>
            <div className="toolbar">
              <div className="field">
                <label className="field__label" htmlFor="search">
                  Search
                </label>
                <input
                  id="search"
                  className="input"
                  type="search"
                  placeholder="Title or notes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="filter-severity">
                  Severity
                </label>
                <select
                  id="filter-severity"
                  className="select"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
                >
                  <option value="all">All severities</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="filter-status">
                  Status
                </label>
                <select
                  id="filter-status"
                  className="select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
                >
                  <option value="all">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="sort">
                  Order
                </label>
                <select id="sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as SortDirection)}>
                  <option value="asc">Oldest first</option>
                  <option value="desc">Newest first</option>
                </select>
              </div>
            </div>
            <p className="result-count" role="status">
              {countText}
            </p>

            {total === 0 ? (
              <div className="empty">
                <p className="empty__title">No events yet</p>
                <p className="empty__body">
                  A timeline is a list of what happened and when. Add the first event with the form, or load the
                  synthetic sample to see how ordering, ties and daylight-saving guidance work.
                </p>
                <div className="empty__actions">
                  <a className="btn btn--primary" href="#event-form" onClick={focusForm}>
                    Add the first event
                  </a>
                  <button type="button" className="btn" onClick={handleLoadSample}>
                    Load sample incident
                  </button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <p className="empty__title">No events match</p>
                <p className="empty__body">
                  {query.trim() ? `Nothing contains “${query.trim()}”` : 'Nothing matches the selected filters'}
                  {severityFilter !== 'all' || statusFilter !== 'all' ? ' with the current severity and status filters.' : '.'}
                </p>
                <div className="empty__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setQuery('');
                      setSeverityFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    <IconX size={14} />
                    Clear search and filters
                  </button>
                </div>
              </div>
            ) : (
              <Timeline
                events={filtered}
                sort={sort}
                zone={zone}
                editingId={editingId}
                tieCounts={tieCounts}
                tiePosition={tiePosition}
                editButtonRefs={editButtonRefs}
                onEdit={(e) => setEditingId(e.id)}
                onDelete={handleDelete}
                onMoveTie={handleMoveTie}
              />
            )}
          </section>

          <aside id="event-form" className="panel panel--form" aria-label="Event form">
            <EventForm
              zone={zone}
              zoneName={zoneName}
              editing={editing}
              onSubmit={handleSubmit}
              onCancelEdit={() => {
                const id = editingId;
                setEditingId(null);
                if (id) requestAnimationFrame(() => editButtonRefs.current.get(id)?.focus());
              }}
            />
          </aside>
        </div>

        <Guidance zoneName={zoneName} />
      </main>

      <footer className="app-footer">
        <p>
          Static site with no backend and no account. Sample content is synthetic. Nothing here asks for a wallet, a
          signature or a payment.
        </p>
      </footer>

      <div className="toast-region">
        <div role="status" aria-live="polite">
          {toast && (
            <div className="toast">
              <span>{toast.message}</span>
              {toast.undo && (
                <button type="button" className="btn btn--sm" onClick={toast.undo}>
                  Undo
                </button>
              )}
              <button type="button" className="btn btn--sm btn--icon" onClick={() => setToast(null)} aria-label="Dismiss message">
                <IconX size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <ImportDialog open={importOpen} current={incident} onClose={() => setImportOpen(false)} onApply={handleImport} />
      <ConfirmDialog
        open={clearOpen}
        title={`Delete all ${total} event${total === 1 ? '' : 's'}?`}
        body={
          <p>
            This removes every event from the timeline and from browser storage. Export JSON first if you might need them
            again.
          </p>
        }
        confirmLabel="Delete all events"
        onConfirm={handleClearAll}
        onClose={() => setClearOpen(false)}
      />
    </>
  );
}
