import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  SEVERITIES,
  SEVERITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TITLE_MAX,
  NOTES_MAX,
  type Severity,
  type Status,
  type TimelineEvent,
} from '../lib/model';
import {
  formatInstant,
  formatIsoOffset,
  formatOffset,
  localZoneAbbreviation,
  nowInputText,
  parseTimestampText,
  resolveParsed,
  toInputText,
  toIso,
  type Resolution,
  type Zone,
} from '../lib/time';
import { IconClock, IconPencil, IconWarning } from './Icons';

/** Stable id so the "Add event" link in the incident bar can focus the first field. */
export const TIMESTAMP_INPUT_ID = 'event-timestamp';

export interface EventValues {
  timestamp: string;
  title: string;
  severity: Severity;
  status: Status;
  notes: string;
}

interface Props {
  zone: Zone;
  zoneName: string;
  editing: TimelineEvent | null;
  onSubmit: (values: EventValues) => void;
  onCancelEdit: () => void;
}

interface Errors {
  timestamp?: string | undefined;
  title?: string | undefined;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function describeResolution(r: Resolution, zone: Zone): string {
  if (r.kind !== 'unique') return '';
  const iso = toIso(r.utcMs);
  const utc = formatInstant(iso, 'utc');
  const local = formatInstant(iso, 'local');
  const abbr = localZoneAbbreviation(r.utcMs);
  const localText = `${local.date} ${local.time} ${local.offsetLabel}${abbr ? ` (${abbr})` : ''}`;
  const utcText = `${utc.date} ${utc.time} UTC`;
  return zone === 'utc' ? `Stored as ${utcText}. In your zone: ${localText}.` : `Stored as ${utcText}. Shown as ${localText}.`;
}

export function EventForm({ zone, zoneName, editing, onSubmit, onCancelEdit }: Props) {
  const id = useId();
  const [timestampText, setTimestampText] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [status, setStatus] = useState<Status>('open');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pick, setPick] = useState<0 | 1 | null>(null);

  const timestampRef = useRef<HTMLInputElement>(null);
  const timestampId = TIMESTAMP_INPUT_ID;
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Load the event being edited (or reset for a fresh add).
  useEffect(() => {
    if (editing) {
      setTimestampText(toInputText(editing.timestamp, zone));
      setTitle(editing.title);
      setSeverity(editing.severity);
      setStatus(editing.status);
      setNotes(editing.notes);
      setErrors({});
      setPick(null);
      // Move focus into the form so keyboard users land where the edit happens.
      timestampRef.current?.focus();
      formRef.current?.scrollIntoView({ block: 'nearest' });
    }
    // Only react to a change of the edited event, not to zone toggles mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const parsed = useMemo(() => parseTimestampText(timestampText), [timestampText]);
  const resolution = useMemo(() => (parsed.ok ? resolveParsed(parsed.parsed, zone) : null), [parsed, zone]);

  const setTimestamp = (text: string) => {
    setTimestampText(text);
    setPick(null);
    if (errors.timestamp) setErrors((e) => ({ ...e, timestamp: undefined }));
  };

  function resolveForSubmit(): { ok: true; iso: string } | { ok: false; message: string } {
    if (!parsed.ok) return { ok: false, message: parsed.reason };
    const r = resolution;
    if (!r) return { ok: false, message: 'Enter a date and time, for example 2026-03-08 14:05.' };
    if (r.kind === 'unique') return { ok: true, iso: toIso(r.utcMs) };
    if (r.kind === 'ambiguous') {
      if (pick === null) {
        return {
          ok: false,
          message: 'Choose the first or second occurrence below, or add a UTC offset to the time.',
        };
      }
      return { ok: true, iso: toIso(r.candidates[pick].utcMs) };
    }
    return { ok: false, message: nonexistentMessage(r, parsed.parsed.wall.hour, parsed.parsed.wall.minute) };
  }

  function nonexistentMessage(r: Extract<Resolution, { kind: 'nonexistent' }>, hour: number, minute: number): string {
    const gapStart = `${pad2(hour)}:${pad2(minute)}`;
    return (
      `${gapStart} did not exist on that date in ${zoneName}: clocks moved forward by ${r.gapMinutes} minutes ` +
      `(${formatOffset(r.before.offsetMinutes)} became ${formatOffset(r.after.offsetMinutes)}). ` +
      `Enter a time outside the skipped range, or add the offset you mean, for example ${formatIsoOffset(r.before.offsetMinutes)} or ${formatIsoOffset(r.after.offsetMinutes)}.`
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const trimmedTitle = title.trim();
    const ts = resolveForSubmit();
    if (!ts.ok) next.timestamp = ts.message;
    if (trimmedTitle === '') next.title = 'Enter a short title that says what happened.';
    else if (trimmedTitle.length > TITLE_MAX) next.title = `Use at most ${TITLE_MAX} characters for the title.`;
    setErrors(next);
    if (next.timestamp) {
      timestampRef.current?.focus();
      return;
    }
    if (next.title) {
      titleRef.current?.focus();
      return;
    }
    if (!ts.ok) return;
    onSubmit({ timestamp: ts.iso, title: trimmedTitle, severity, status, notes: notes.slice(0, NOTES_MAX) });
    if (!editing) {
      setTimestampText('');
      setTitle('');
      setNotes('');
      setPick(null);
      timestampRef.current?.focus();
    }
  }

  function shift(deltaMinutes: number) {
    const ts = resolveForSubmit();
    if (!ts.ok) {
      setErrors((e) => ({ ...e, timestamp: ts.message }));
      timestampRef.current?.focus();
      return;
    }
    const shifted = toIso(Date.parse(ts.iso) + deltaMinutes * 60_000);
    setTimestamp(toInputText(shifted, zone));
  }

  function onNotesKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const tsErrorId = `${id}-ts-error`;
  const tsHintId = `${id}-ts-hint`;
  const tsPreviewId = `${id}-ts-preview`;
  const titleErrorId = `${id}-title-error`;
  const ambiguous = resolution?.kind === 'ambiguous' ? resolution : null;
  const nonexistent = resolution?.kind === 'nonexistent' ? resolution : null;
  const preview = resolution && resolution.kind === 'unique' ? describeResolution(resolution, zone) : '';

  const tsDescribedBy = [tsHintId, errors.timestamp ? tsErrorId : null, preview ? tsPreviewId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <form ref={formRef} className="event-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{editing ? 'Edit event' : 'Add event'}</h2>
      {editing && (
        <p className="form-editing-note">
          <IconPencil />
          <span>
            Editing <strong>{editing.title}</strong>
          </span>
        </p>
      )}
      <p className="field__hint">
        Fields marked <span className="req" aria-hidden="true">*</span>
        <span className="sr-only">with an asterisk</span> are required.
      </p>

      <div className="field">
        <label className="field__label" htmlFor={timestampId}>
          Timestamp<span className="req" aria-hidden="true">*</span>
        </label>
        <input
          ref={timestampRef}
          id={timestampId}
          name="timestamp"
          className="input input--mono"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="2026-03-08 14:05"
          value={timestampText}
          onChange={(e) => setTimestamp(e.target.value)}
          aria-invalid={errors.timestamp ? 'true' : undefined}
          aria-describedby={tsDescribedBy}
        />
        <p id={tsHintId} className="field__hint">
          Read as {zone === 'utc' ? 'UTC' : zoneName} unless you add <code>Z</code> or an offset such as <code>+02:00</code>.
          Seconds are optional.
        </p>
        {errors.timestamp && (
          <p id={tsErrorId} className="field__error">
            <IconWarning />
            <span>{errors.timestamp}</span>
          </p>
        )}
        {preview && !errors.timestamp && (
          <p id={tsPreviewId} className="field__preview">
            {preview}
          </p>
        )}
        {nonexistent && !errors.timestamp && parsed.ok && (
          <p className="field__error">
            <IconWarning />
            <span>{nonexistentMessage(nonexistent, parsed.parsed.wall.hour, parsed.parsed.wall.minute)}</span>
          </p>
        )}
        {ambiguous && (
          <fieldset className="choice-list">
            <legend>
              This time happens twice on that date in {zoneName} because clocks go back. Choose which one you mean, or
              add a UTC offset to the time.
            </legend>
            {ambiguous.candidates.map((c, i) => {
              const f = formatInstant(toIso(c.utcMs), 'utc');
              const abbr = localZoneAbbreviation(c.utcMs);
              return (
                <label key={i}>
                  <input
                    type="radio"
                    name={`${id}-pick`}
                    checked={pick === i}
                    onChange={() => {
                      setPick(i as 0 | 1);
                      if (errors.timestamp) setErrors((e) => ({ ...e, timestamp: undefined }));
                    }}
                  />
                  <span>
                    {i === 0 ? 'First occurrence' : 'Second occurrence'}, {formatOffset(c.offsetMinutes)}
                    {abbr ? ` (${abbr})` : ''} → <code>{`${f.date}T${f.time}Z`}</code>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <div className="shift-bar" role="group" aria-label="Adjust timestamp">
          <span className="shift-bar__label" aria-hidden="true">
            Adjust:
          </span>
          <button type="button" className="btn btn--sm" onClick={() => setTimestamp(nowInputText(zone))}>
            <IconClock size={14} />
            Use now
          </button>
          <button type="button" className="btn btn--sm" onClick={() => shift(-60)} aria-label="Shift 1 hour earlier">
            −1 h
          </button>
          <button type="button" className="btn btn--sm" onClick={() => shift(-5)} aria-label="Shift 5 minutes earlier">
            −5 min
          </button>
          <button type="button" className="btn btn--sm" onClick={() => shift(5)} aria-label="Shift 5 minutes later">
            +5 min
          </button>
          <button type="button" className="btn btn--sm" onClick={() => shift(60)} aria-label="Shift 1 hour later">
            +1 h
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-title`}>
          Title<span className="req" aria-hidden="true">*</span>
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          name="title"
          className="input"
          type="text"
          autoComplete="off"
          maxLength={TITLE_MAX}
          placeholder="Latency alert fired for checkout-api"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors((er) => ({ ...er, title: undefined }));
          }}
          aria-invalid={errors.title ? 'true' : undefined}
          aria-describedby={errors.title ? titleErrorId : undefined}
        />
        {errors.title && (
          <p id={titleErrorId} className="field__error">
            <IconWarning />
            <span>{errors.title}</span>
          </p>
        )}
      </div>

      <div className="event-form__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-sev`}>
            Severity
          </label>
          <select
            id={`${id}-sev`}
            name="severity"
            className="select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-status`}>
            Status
          </label>
          <select
            id={`${id}-status`}
            name="status"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-notes`}>
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          className="textarea"
          rows={3}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={onNotesKeyDown}
          aria-describedby={`${id}-notes-hint`}
        />
        <p id={`${id}-notes-hint`} className="field__hint">
          Optional. Press Ctrl+Enter (⌘+Enter on Mac) to submit from here.
        </p>
      </div>

      <div className="event-form__actions">
        <button type="submit" className="btn btn--primary">
          {editing ? 'Save changes' : 'Add event'}
        </button>
        {editing && (
          <button type="button" className="btn" onClick={onCancelEdit}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
