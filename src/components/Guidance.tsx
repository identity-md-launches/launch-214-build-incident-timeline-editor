import { IconChevronRight } from './Icons';

export function Guidance({ zoneName }: { zoneName: string }) {
  return (
    <details className="guidance">
      <summary>
        <IconChevronRight />
        About timestamps, ordering and imports
      </summary>
      <div className="guidance__body">
        <section>
          <h3>UTC and local time</h3>
          <p>
            Every event is stored as a UTC instant. The display toggle only changes how it is shown: in UTC or in this
            browser’s zone ({zoneName}), always with the offset printed next to the time. Text you type is read in the
            selected zone unless it ends with <code>Z</code> or an offset such as <code>+02:00</code>, which always wins.
          </p>
        </section>
        <section>
          <h3>Equal timestamps</h3>
          <p>
            The list is always ordered by the real instant. Events that share an instant are marked “Same time as”
            and keep a stable manual order: use “Move up” and “Move down” to arrange them. To separate them, edit one
            and shift it by a few seconds or minutes.
          </p>
        </section>
        <section>
          <h3>Invalid dates</h3>
          <p>
            Dates are checked against the real calendar: 2026-02-30, month 13, hour 24 or minute 60 are rejected with a
            hint that says the valid range. Leap days such as 2024-02-29 are accepted.
          </p>
        </section>
        <section>
          <h3>Daylight-saving changes</h3>
          <ul>
            <li>
              When clocks go back, one local hour happens twice. The form shows both instants with their offsets and asks
              which you mean. Adding the offset yourself, for example <code>01:30 -05:00</code>, avoids the question.
            </li>
            <li>
              When clocks go forward, a local hour is skipped. A time inside that gap is refused with the offsets on
              either side so you can pick a real instant. Entering times in UTC avoids both cases.
            </li>
          </ul>
        </section>
        <section>
          <h3>Saving and refreshing</h3>
          <p>
            Changes are saved to this browser’s local storage a moment after each edit; the header shows when the last
            save happened. If storage is blocked or full, the header says so and nothing survives a refresh until you
            export JSON. Data never leaves this browser.
          </p>
        </section>
        <section>
          <h3>Import checks</h3>
          <ul>
            <li>The file must be JSON with <code>schemaVersion</code> 1 and an <code>events</code> list.</li>
            <li>
              Each event needs an ISO 8601 <code>timestamp</code> with a UTC offset, a non-empty <code>title</code>, a
              known <code>severity</code> and <code>status</code>. Notes and tie order are optional.
            </li>
            <li>Problems are listed with the event’s position and nothing is imported until they are fixed.</li>
            <li>Missing or duplicate ids are repaired and reported as notes.</li>
          </ul>
        </section>
      </div>
    </details>
  );
}
