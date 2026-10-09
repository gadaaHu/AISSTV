import type { ReactNode } from "react";

import type { AttendanceEvent } from "../../api/types";
import { eventStyle } from "../../lib/constants";
import { formatDateTime } from "../../lib/dates";
import { formatPercent, formatText, humanise } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Card, Modal, StatusBadge } from "../ui";

/**
 * The full record behind one event row.
 *
 * Two things are deliberately spelled out rather than hidden:
 *
 * * `ts` (the instant the pipeline recorded) and `local_ts` (the clock on the
 *   device that produced it) are shown side by side, because they disagree
 *   whenever a camera's clock is off — which is exactly when this dialog is
 *   opened.
 * * There is **no snapshot**. `GET /events` does not serialise `snapshot_path`
 *   or `received_at` (`EventOut` omits both), so the console has nothing to
 *   render and no path to fetch from. The dialog says so instead of implying an
 *   image failed to load.
 */

/** Renders one `meta` value without ever producing `[object Object]`. */
function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() ? value : "—";
  // Numbers and booleans have an unambiguous textual form.
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    // Arrays and nested objects land here, so structured serialisation is the
    // only rendering that keeps their shape.
    return JSON.stringify(value) ?? "—";
  } catch {
    // A cyclic or otherwise unserialisable value: say so rather than falling
    // back to `String(value)`, which would print `[object Object]`.
    return "(unserialisable value)";
  }
}

function DefinitionList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(9rem,auto)_1fr]">
      {children}
    </dl>
  );
}

function DefinitionItem({
  label,
  mono = false,
  children,
}: {
  label: ReactNode;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 text-sm break-words text-slate-800 dark:text-slate-100",
          mono && "font-mono text-xs",
        )}
      >
        {children}
      </dd>
    </>
  );
}

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100"
    >
      {children}
    </h3>
  );
}

export function EventDetailDialog({
  open,
  event,
  onClose,
}: {
  open: boolean;
  event: AttendanceEvent | null;
  onClose: () => void;
}) {
  // The dialog stays mounted so it can close cleanly, so `event` is nullable
  // here even while `open` is true.
  if (!event) {
    return (
      <Modal open={open} onClose={onClose} title="Event detail">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No event selected.
        </p>
      </Modal>
    );
  }

  // `meta` is required by the schema, but an event from an older pipeline can
  // still arrive without it — treat a missing bag as empty rather than throwing.
  const metaEntries = Object.entries(event.meta ?? {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge style={eventStyle(event.type)} />
          <span className="font-mono text-xs font-normal break-all text-slate-500 dark:text-slate-400">
            {event.id}
          </span>
        </span>
      }
      description="Every field the server returns for this event."
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="event-detail-timestamps">
          <SectionHeading id="event-detail-timestamps">
            Timestamps
          </SectionHeading>
          <DefinitionList>
            <DefinitionItem label="Event time (ts)">
              <span className="font-mono text-xs break-all">{event.ts}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(event.ts)} — your timezone
              </span>
            </DefinitionItem>

            <DefinitionItem label="Device time (local_ts)">
              {event.local_ts ? (
                <>
                  <span className="font-mono text-xs break-all">
                    {event.local_ts}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(event.local_ts)} — your timezone
                  </span>
                </>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  — the device did not report its own clock
                </span>
              )}
            </DefinitionItem>
          </DefinitionList>
        </section>

        <section aria-labelledby="event-detail-detection">
          <SectionHeading id="event-detail-detection">Detection</SectionHeading>
          <DefinitionList>
            <DefinitionItem label="Type">
              {humanise(event.type)}
            </DefinitionItem>
            <DefinitionItem label="Employee code">
              {formatText(event.employee_code)}
            </DefinitionItem>
            <DefinitionItem label="Camera id" mono>
              {formatText(event.camera_id)}
            </DefinitionItem>
            <DefinitionItem label="Zone">
              {formatText(event.zone)}
            </DefinitionItem>
            <DefinitionItem label="Confidence">
              {formatPercent(event.confidence)}
            </DefinitionItem>
            <DefinitionItem label="Track id">
              {event.track_id === null ? "—" : String(event.track_id)}
            </DefinitionItem>
          </DefinitionList>
        </section>

        <section aria-labelledby="event-detail-meta">
          <SectionHeading id="event-detail-meta">Metadata</SectionHeading>

          {metaEntries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This event carries no extra metadata.
            </p>
          ) : (
            <DefinitionList>
              {metaEntries.map(([key, value]) => (
                <DefinitionItem key={key} label={humanise(key)}>
                  {formatMetaValue(value)}
                </DefinitionItem>
              ))}
            </DefinitionList>
          )}
        </section>

        <Card className="border-dashed bg-slate-50 dark:bg-slate-950/40">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-semibold">No snapshot is available.</span>{" "}
            The events API does not serialise{" "}
            <code className="font-mono">snapshot_path</code> or{" "}
            <code className="font-mono">received_at</code>, so this console has
            neither a stored image nor a path to request one from. Use the live
            camera view when you need imagery for this minute.
          </p>
        </Card>
      </div>
    </Modal>
  );
}
