import type { RefObject } from 'react';
import { SEVERITY_LABEL, STATUS_LABEL, type SortDirection, type TimelineEvent } from '../lib/model';
import { formatGap, formatInstant, localZoneAbbreviation, type Zone } from '../lib/time';
import { IconArrowDown, IconArrowUp, IconLink, IconPencil, IconTrash } from './Icons';

interface Props {
  /** Events already sorted in the display direction and filtered. */
  events: TimelineEvent[];
  sort: SortDirection;
  zone: Zone;
  editingId: string | null;
  /** Number of events sharing each instant, over the whole (unfiltered) timeline. */
  tieCounts: Map<number, number>;
  /** Position of each event inside its tie group and the group size (unfiltered). */
  tiePosition: Map<string, { index: number; size: number }>;
  editButtonRefs: RefObject<Map<string, HTMLButtonElement>>;
  onEdit: (event: TimelineEvent) => void;
  onDelete: (event: TimelineEvent) => void;
  onMoveTie: (event: TimelineEvent, direction: 'earlier' | 'later') => void;
}

export function Timeline({
  events,
  sort,
  zone,
  editingId,
  tieCounts,
  tiePosition,
  editButtonRefs,
  onEdit,
  onDelete,
  onMoveTie,
}: Props) {
  return (
    <ol className="timeline" aria-label="Timeline events">
      {events.map((event, i) => {
        // The chronologically previous displayed event: above in ascending order, below in descending.
        const prev = sort === 'asc' ? events[i - 1] : events[i + 1];
        const gap = prev ? formatGap(prev.timestamp, event.timestamp) : null;
        const instantMs = Date.parse(event.timestamp);
        const tieSize = tieCounts.get(instantMs) ?? 1;
        const pos = tiePosition.get(event.id);
        const f = formatInstant(event.timestamp, zone);
        const abbr = zone === 'local' ? localZoneAbbreviation(instantMs) : '';
        const upDirection: 'earlier' | 'later' = sort === 'asc' ? 'earlier' : 'later';
        const downDirection: 'earlier' | 'later' = sort === 'asc' ? 'later' : 'earlier';
        const canUp = pos ? (upDirection === 'earlier' ? pos.index > 0 : pos.index < pos.size - 1) : false;
        const canDown = pos ? (downDirection === 'earlier' ? pos.index > 0 : pos.index < pos.size - 1) : false;
        const isEditing = editingId === event.id;
        return (
          <li
            key={event.id}
            id={`event-${event.id}`}
            className={`event event--sev-${event.severity}${isEditing ? ' event--editing' : ''}`}
            aria-current={isEditing ? 'true' : undefined}
          >
            <div className="event__when">
              <time dateTime={event.timestamp}>
                <span className="date">{f.date}</span>
                <span className="time">{f.time}</span>
              </time>
              <span className="event__offset">
                {f.offsetLabel}
                {abbr && abbr !== f.offsetLabel ? ` · ${abbr}` : ''}
              </span>
              {gap !== null && gap !== 'same time' && (
                <span className="event__gap">
                  {gap} <span className="sr-only">after the previous event</span>
                </span>
              )}
              {tieSize > 1 && (
                <span className="event__tie">
                  <IconLink size={14} />
                  Same time as {tieSize - 1} other{tieSize - 1 === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="event__body">
              <div className="event__title-row">
                <h3 className="event__title">{event.title}</h3>
                <span className={`badge badge--sev-${event.severity}`}>
                  <span className="badge__dot" aria-hidden="true" />
                  <span className="sr-only">Severity: </span>
                  {SEVERITY_LABEL[event.severity]}
                </span>
                <span className="badge">
                  <span className="sr-only">Status: </span>
                  {STATUS_LABEL[event.status]}
                </span>
              </div>
              {event.notes.trim() !== '' && <p className="event__notes">{event.notes}</p>}
              <div className="event__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  ref={(el) => {
                    const map = editButtonRefs.current;
                    if (!map) return;
                    if (el) map.set(event.id, el);
                    else map.delete(event.id);
                  }}
                  onClick={() => onEdit(event)}
                  aria-label={`Edit ${event.title}`}
                  aria-pressed={isEditing}
                >
                  <IconPencil size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => onDelete(event)}
                  aria-label={`Delete ${event.title}`}
                >
                  <IconTrash size={14} />
                  Delete
                </button>
                {tieSize > 1 && (
                  <>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!canUp}
                      onClick={() => onMoveTie(event, upDirection)}
                      aria-label={`Move ${event.title} up among events at the same time`}
                    >
                      <IconArrowUp size={14} />
                      Move up
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!canDown}
                      onClick={() => onMoveTie(event, downDirection)}
                      aria-label={`Move ${event.title} down among events at the same time`}
                    >
                      <IconArrowDown size={14} />
                      Move down
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
