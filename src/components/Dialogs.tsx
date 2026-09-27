import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { mergeIncidents, validateIncidentJson, type ValidationResult } from '../lib/importExport';
import type { Incident } from '../lib/model';
import { IconCheck, IconWarning } from './Icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  wide?: boolean;
  children: ReactNode;
}

/**
 * Native <dialog> wrapper. showModal() gives focus trapping, an inert
 * background and Escape handling; focus returns to the opener on close.
 */
export function Modal({ open, onClose, labelledBy, wide, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      openerRef.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => {
      onClose();
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog--wide' : ''}`} aria-labelledby={labelledBy}>
      {open && <div className="dialog__inner">{children}</div>}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Least destructive action takes focus for destructive confirmations.
    if (open) cancelRef.current?.focus();
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className="dialog__body">{body}</div>
      <div className="dialog__actions">
        <button ref={cancelRef} type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

interface ImportProps {
  open: boolean;
  current: Incident;
  onClose: () => void;
  onApply: (incident: Incident, summary: string) => void;
}

export function ImportDialog({ open, current, onClose, onApply }: ImportProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setFileName(null);
      setResult(null);
      setReadError(null);
      // The dialog's first focusable is the file input.
      requestAnimationFrame(() => fileRef.current?.focus());
    }
  }, [open]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setReadError(null);
    try {
      const content = await file.text();
      setText(content);
    } catch {
      setReadError(`Unable to read ${file.name}. Choose the file again or paste its contents below.`);
    }
  }

  function check() {
    const r = validateIncidentJson(text);
    setResult(r);
    requestAnimationFrame(() => reportRef.current?.focus());
  }

  const okResult = result && result.ok ? result : null;
  const merge = okResult ? mergeIncidents(current, okResult.incident) : null;

  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-title`} wide>
      <h2 id={`${id}-title`}>Import JSON</h2>
      <p className="dialog__body">
        Choose a file exported from this editor, or paste its JSON. The file is checked before anything changes.
      </p>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-file`}>
          JSON file
        </label>
        <input
          ref={fileRef}
          id={`${id}-file`}
          className="input"
          type="file"
          accept="application/json,.json"
          onChange={(e) => void handleFile(e.target.files?.[0])}
          aria-describedby={readError ? `${id}-read-error` : undefined}
          aria-invalid={readError ? 'true' : undefined}
        />
        {fileName && !readError && <p className="field__hint">Loaded {fileName}. Select “Check file” to validate it.</p>}
        {readError && (
          <p id={`${id}-read-error`} className="field__error">
            <IconWarning />
            <span>{readError}</span>
          </p>
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-text`}>
          Or paste JSON
        </label>
        <textarea
          id={`${id}-text`}
          className="textarea input--mono"
          rows={6}
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder='{ "schemaVersion": 1, "events": [ … ] }'
        />
      </div>

      {result && (
        <div
          ref={reportRef}
          tabIndex={-1}
          className={`report ${result.ok ? (result.warnings.length ? 'report--warning' : 'report--ok') : 'report--error'}`}
          aria-labelledby={`${id}-report-title`}
        >
          {result.ok ? (
            <>
              <h3 id={`${id}-report-title`}>
                <IconCheck />
                Ready to import: {result.incident.events.length} event{result.incident.events.length === 1 ? '' : 's'}
                {result.incident.title ? ` from “${result.incident.title}”` : ''}
              </h3>
              {result.warnings.length > 0 && (
                <>
                  <p>
                    {result.warnings.length} note{result.warnings.length === 1 ? '' : 's'} (the import can still proceed):
                  </p>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
              {merge && current.events.length > 0 && (
                <p>
                  Replace removes the current {current.events.length} event{current.events.length === 1 ? '' : 's'}. Merge
                  keeps them, adds {merge.added} new and updates {merge.replaced} with matching ids.
                </p>
              )}
            </>
          ) : (
            <>
              <h3 id={`${id}-report-title`}>
                <IconWarning />
                Unable to import: {result.errors.length} problem{result.errors.length === 1 ? '' : 's'} found
              </h3>
              <ul>
                {result.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
              <p>Fix the file and check it again. Nothing was changed.</p>
            </>
          )}
        </div>
      )}

      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        {!okResult && (
          <button type="button" className="btn btn--primary" onClick={check}>
            Check file
          </button>
        )}
        {okResult && merge && (
          <>
            {current.events.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onApply(merge.incident, `Merged ${merge.added} new and updated ${merge.replaced} event${merge.replaced === 1 ? '' : 's'}.`)
                }
              >
                Merge into timeline
              </button>
            )}
            <button
              type="button"
              className={`btn ${current.events.length > 0 ? 'btn--danger' : 'btn--primary'}`}
              onClick={() =>
                onApply(
                  okResult.incident,
                  `Imported ${okResult.incident.events.length} event${okResult.incident.events.length === 1 ? '' : 's'}${current.events.length > 0 ? ', replacing the previous timeline' : ''}.`,
                )
              }
            >
              {current.events.length > 0 ? 'Replace timeline' : 'Import events'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
