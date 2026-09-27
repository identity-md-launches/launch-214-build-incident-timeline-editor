import { IconCheck, IconClock, IconWarning } from './Icons';

export type StorageState =
  | { kind: 'unavailable'; reason: string; dirty: boolean }
  | { kind: 'saved'; at: number }
  | { kind: 'unsaved' }
  | { kind: 'error'; reason: string }
  | { kind: 'paused' };

const pad2 = (n: number) => String(n).padStart(2, '0');

export function StorageStatus({ state }: { state: StorageState }) {
  let cls = '';
  let icon = <IconClock />;
  let text = '';
  switch (state.kind) {
    case 'saved': {
      const d = new Date(state.at);
      cls = 'storage-status--saved';
      icon = <IconCheck />;
      text = `Saved in this browser at ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      break;
    }
    case 'unsaved':
      cls = 'storage-status--unsaved';
      text = 'Unsaved changes…';
      break;
    case 'paused':
      cls = 'storage-status--warning';
      icon = <IconWarning />;
      text = 'Not saved: resolve the stored-data problem below first.';
      break;
    case 'error':
      cls = 'storage-status--warning';
      icon = <IconWarning />;
      text = `Not saved: ${state.reason}`;
      break;
    case 'unavailable':
      cls = 'storage-status--warning';
      icon = <IconWarning />;
      text = state.dirty
        ? 'Not saved: browser storage is unavailable. Export JSON before you leave.'
        : 'Browser storage is unavailable. Changes will not survive a refresh; export JSON to keep them.';
      break;
  }
  // Stable live region: the element is always rendered and only its text changes.
  return (
    <p className={`storage-status ${cls}`} role="status">
      {icon}
      <span>{text}</span>
    </p>
  );
}
