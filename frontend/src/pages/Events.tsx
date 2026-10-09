import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

import type { AttendanceEvent } from "../api/types";
import { EventDetailDialog } from "../components/events/EventDetailDialog";
import { PageHeader } from "../components/PageHeader";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Pagination,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableMessage,
  TableRow,
} from "../components/ui";
import { useEventCameras, useEvents } from "../hooks/queries/useEvents";
import type { EventsQueryParams } from "../hooks/queries/useEvents";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  DEFAULT_EVENT_WINDOW,
  EVENT_TYPE_OPTIONS,
  EVENT_WINDOWS,
  eventStyle,
  PAGE_SIZE,
} from "../lib/constants";
import { formatRelative } from "../lib/dates";
import { formatPercent, formatText, humanise } from "../lib/format";

/** How often the window's lower bound is rolled forward. */
const WINDOW_TICK_MS = 30_000;

/**
 * The events feed.
 *
 * The time window is the load-bearing filter. `GET /events` defaults `since` to
 * "one hour ago" when the parameter is absent, so a request that omits it looks
 * like an empty or truncated feed rather than a defaulted one — this page always
 * sends an explicit `since` derived from the visible window, and keeps the
 * window on screen so the range being read is never a guess.
 *
 * The bound is held in state and advanced on a timer rather than recomputed from
 * `Date.now()` during render: reading the clock while rendering makes the
 * component impure and would mint a new query key on every render.
 */

const LIMIT = PAGE_SIZE.events;

/** Window value → label, so the window can be named anywhere it is applied. */
const WINDOW_LABELS = new Map<string, string>(
  EVENT_WINDOWS.map((option) => [option.value, option.label]),
);

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => new Date().getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date().getTime());
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

/** `local_ts` is the device's own clock; fall back to the pipeline instant. */
function effectiveTimestamp(event: AttendanceEvent): string {
  return event.local_ts ?? event.ts;
}

const SKELETON_ROWS = 8;

function EventRowSkeletons() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 7 }, (__, cell) => (
            <TableCell key={cell}>
              <Skeleton className="h-3.5 w-full max-w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EventCardSkeletons() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** A stacked card standing in for a table row below `md`. */
function EventCard({
  event,
  onSelect,
}: {
  event: AttendanceEvent;
  onSelect: () => void;
}) {
  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
      keyEvent.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open detail for ${humanise(event.type)} event on ${event.camera_id}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge style={eventStyle(event.type)} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatRelative(effectiveTimestamp(event))}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Employee
        </dt>
        <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">
          {formatText(event.employee_code)}
        </dd>

        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Camera
        </dt>
        <dd className="min-w-0 break-words font-mono text-xs text-slate-800 dark:text-slate-100">
          {formatText(event.camera_id)}
        </dd>

        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Zone
        </dt>
        <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">
          {formatText(event.zone)}
        </dd>

        <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Confidence
        </dt>
        <dd className="text-slate-800 dark:text-slate-100">
          {formatPercent(event.confidence)}
        </dd>

        {event.track_id === null ? null : (
          <>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Track
            </dt>
            <dd className="text-slate-800 dark:text-slate-100">
              {String(event.track_id)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function Events() {
  const isDesktop = useMediaQuery();
  const nowMs = useNow(WINDOW_TICK_MS);

  const [windowValue, setWindowValue] = useState<string>(DEFAULT_EVENT_WINDOW);
  const [cameraId, setCameraId] = useState("");
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);

  const [selected, setSelected] = useState<AttendanceEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const windowConfig: (typeof EVENT_WINDOWS)[number] =
    EVENT_WINDOWS.find((option) => option.value === windowValue) ??
    EVENT_WINDOWS[0];

  // The lower bound of the visible window, always present in the request.
  const since = new Date(nowMs - windowConfig.minutes * 60_000);

  const cameras = useEventCameras();
  const cameraOptions = cameras.data ?? [];

  // An empty selection means "all cameras"/"all types". Both are sent as
  // `undefined` so the query string stays free of `camera_id=`/`type=`.
  const queryParams: EventsQueryParams = {
    since,
    cameraId: cameraId ? cameraId : undefined,
    type: type ? type : undefined,
    limit: LIMIT,
    offset,
  };

  const events = useEvents(queryParams);

  const rows = events.data?.items ?? [];
  const total = events.data?.total ?? 0;

  const handleSelect = (event: AttendanceEvent) => {
    setSelected(event);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  /**
   * Every filter change returns to the first page. Keeping an offset from a
   * narrower result set would otherwise land the user on an empty page that
   * looks like a bug.
   */
  const handleWindowChange = (value: string) => {
    setWindowValue(value);
    setOffset(0);
  };

  const handleCameraChange = (value: string) => {
    setCameraId(value);
    setOffset(0);
  };

  const handleTypeChange = (value: string) => {
    setType(value);
    setOffset(0);
  };

  // Names for the currently applied filters, used in the header and empty state.
  const windowLabel = WINDOW_LABELS.get(windowValue) ?? "Last hour";
  const cameraLabel = cameraId ? cameraId : "All cameras";
  const typeLabel =
    EVENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    "All types";

  const windowIndex = EVENT_WINDOWS.findIndex(
    (option) => option.value === windowValue,
  );
  const widerWindow =
    windowIndex >= 0 && windowIndex < EVENT_WINDOWS.length - 1
      ? EVENT_WINDOWS[windowIndex + 1]
      : null;

  const toolbar = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field
        label="Time window"
        htmlFor="events-window"
        hint="Events are fetched from this point up to now."
      >
        <Select
          id="events-window"
          aria-describedby="events-window-hint"
          value={windowValue}
          onChange={(changeEvent) =>
            handleWindowChange(changeEvent.target.value)
          }
        >
          {EVENT_WINDOWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Camera"
        htmlFor="events-camera"
        hint="Leave as all cameras to keep every stream."
      >
        <Select
          id="events-camera"
          aria-describedby="events-camera-hint"
          value={cameraId}
          onChange={(changeEvent) =>
            handleCameraChange(changeEvent.target.value)
          }
        >
          <option value="">All cameras</option>
          {cameraOptions.map((camera) => (
            <option key={camera.id} value={camera.id}>
              {camera.id}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Event type"
        htmlFor="events-type"
        hint="Matches the server's `type` parameter."
      >
        <Select
          id="events-type"
          aria-describedby="events-type-hint"
          value={type}
          onChange={(changeEvent) => handleTypeChange(changeEvent.target.value)}
        >
          {EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );

  const listContent = () => {
    if (events.isError) {
      return (
        <Card>
          <ErrorState
            error={events.error}
            title="Could not load events"
            onRetry={() => {
              void events.refetch();
            }}
          />
        </Card>
      );
    }

    if (events.isPending && rows.length === 0) {
      return isDesktop ? (
        <Card padded={false}>
          <Table>
            <TableBody>
              <TableRow>
                <TableMessage colSpan={7}>
                  <span role="status">
                    <span className="sr-only">Loading events…</span>
                  </span>
                </TableMessage>
              </TableRow>
              <EventRowSkeletons />
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EventCardSkeletons />
      );
    }

    if (rows.length === 0) {
      return (
        <EmptyState
          icon="events"
          title="No events in this window"
          description={
            <>
              Nothing matched {windowLabel.toLowerCase()} for {cameraLabel} ·{" "}
              {typeLabel}. The window may simply be too narrow — widen it to
              look further back.
            </>
          }
          action={
            widerWindow ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleWindowChange(widerWindow.value)}
              >
                Widen to {widerWindow.label.toLowerCase()}
              </Button>
            ) : undefined
          }
        />
      );
    }

    return (
      <Card padded={false}>
        {isDesktop ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Employee</TableHeaderCell>
                <TableHeaderCell>Camera</TableHeaderCell>
                <TableHeaderCell>Zone</TableHeaderCell>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell align="right">Confidence</TableHeaderCell>
                <TableHeaderCell align="right">Track</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((event) => (
                <TableRow
                  key={event.id}
                  interactive
                  role="button"
                  tabIndex={0}
                  aria-label={`Open detail for ${humanise(event.type)} event on ${event.camera_id}`}
                  className="focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                  onClick={() => handleSelect(event)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                      keyEvent.preventDefault();
                      handleSelect(event);
                    }
                  }}
                >
                  <TableCell>
                    <StatusBadge style={eventStyle(event.type)} />
                  </TableCell>
                  <TableCell>{formatText(event.employee_code)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatText(event.camera_id)}
                  </TableCell>
                  <TableCell>{formatText(event.zone)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatRelative(effectiveTimestamp(event))}
                  </TableCell>
                  <TableCell align="right">
                    {formatPercent(event.confidence)}
                  </TableCell>
                  <TableCell align="right">
                    {event.track_id === null ? "—" : String(event.track_id)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {rows.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelect={() => handleSelect(event)}
              />
            ))}
          </div>
        )}

        <div className="px-3">
          <Pagination
            total={total}
            limit={LIMIT}
            offset={offset}
            onOffsetChange={setOffset}
            disabled={events.isFetching}
            itemLabel="events"
          />
        </div>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title="Events"
        description={`${total.toLocaleString()} events in ${windowLabel.toLowerCase()}`}
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void events.refetch();
            }}
            disabled={events.isFetching}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <Card className="mb-4" padded>
        {toolbar}
      </Card>

      {listContent()}

      <EventDetailDialog
        open={dialogOpen}
        event={selected}
        onClose={handleCloseDialog}
      />
    </div>
  );
}
