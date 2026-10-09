import { Fragment, useState } from "react";
import type { ReactNode } from "react";

import { ApiError } from "../api/errors";
import type { Camera, CameraTestResult } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { CameraFormDialog } from "../components/cameras/CameraFormDialog";
import { CameraPreviewDialog } from "../components/cameras/CameraPreviewDialog";
import { PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Skeleton,
  StatusBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "../components/ui";
import {
  useCameras,
  useDeleteCameraMutation,
  useTestCameraMutation,
} from "../hooks/queries/useCameras";
import { cameraStyle, isAdmin } from "../lib/constants";
import { formatRelative } from "../lib/dates";
import {
  EMPTY,
  formatText,
  hasUrlCredentials,
  redactUrlCredentials,
} from "../lib/format";
import { errorMessage } from "../lib/utils";

/**
 * The camera fleet.
 *
 * Reading the list is open to every signed-in user — the backend restricts
 * mutations, not reads — so the page gates only the controls, and the server
 * re-checks every write independently.
 *
 * **Stream URLs are rendered redacted.** `GET /cameras` hands the raw URL, which
 * may embed `user:password@`, to every authenticated user, so the list shows
 * `redactUrlCredentials(camera.url)` and flags the credentials instead of
 * printing them. The edit dialog is the single deliberate exception, where an
 * administrator has to see the value in order to change it.
 */

/** `4 fps` / `500 ms` — `null` and `undefined` both render as the em-dash. */
function metric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return EMPTY;
  return `${value} ${unit}`;
}

function resolution(width: number | null, height: number | null): string | null {
  if (width === null || height === null) return null;
  return `${width}×${height}`;
}

/**
 * The inline result of a probe.
 *
 * `POST /cameras/{id}/test` answers HTTP 200 even when the probe fails, so
 * `result.ok` — never the status code — decides whether this reads as a success.
 */
function ProbeResult({ result }: { result: CameraTestResult }) {
  const box = result.ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

  const size = resolution(result.width, result.height);

  return (
    <div
      role="status"
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${box}`}
    >
      <p className="flex items-start gap-1.5 font-medium">
        <Icon
          name={result.ok ? "check" : "alert"}
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <span className="min-w-0 break-words">{result.message}</span>
      </p>

      <dl className="flex flex-wrap gap-x-4 gap-y-0.5 pl-5 opacity-90">
        {size ? (
          <div className="flex gap-1">
            <dt>Resolution</dt>
            <dd className="font-medium">{size}</dd>
          </div>
        ) : null}
        {result.fps === null ? null : (
          <div className="flex gap-1">
            <dt>FPS</dt>
            <dd className="font-medium">{metric(result.fps, "fps")}</dd>
          </div>
        )}
        {result.codec === null ? null : (
          <div className="flex gap-1">
            <dt>Codec</dt>
            <dd className="font-medium">{result.codec}</dd>
          </div>
        )}
        {result.latency_ms === null ? null : (
          <div className="flex gap-1">
            <dt>Latency</dt>
            <dd className="font-medium">{metric(result.latency_ms, "ms")}</dd>
          </div>
        )}
      </dl>

      {result.ok ? null : (
        <p className="pl-5 opacity-80">
          The probe runs on the server with ffprobe and can take about 10 seconds.
        </p>
      )}
    </div>
  );
}

/** A labelled value inside a stacked card, using the house `<dl>` pattern. */
function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] tracking-wide text-slate-400 uppercase dark:text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 text-slate-700 dark:text-slate-300">{children}</dd>
    </div>
  );
}

/** The per-row controls. Icon-only buttons carry a label, so they announce. */
function RowActions({
  camera,
  testing,
  onTest,
  onPreview,
  onEdit,
  onDelete,
}: {
  camera: Camera;
  testing: boolean;
  onTest: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = camera.name.trim() === "" ? camera.id : camera.name;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="secondary" loading={testing} onClick={onTest}>
        {testing ? "Testing…" : "Test"}
      </Button>
      <IconButton
        icon="image"
        label={`Preview ${name}`}
        size="sm"
        onClick={onPreview}
      />
      <IconButton icon="pencil" label={`Edit ${name}`} size="sm" onClick={onEdit} />
      <IconButton
        icon="trash"
        label={`Delete ${name}`}
        size="sm"
        className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
        onClick={onDelete}
      />
    </div>
  );
}

export function Cameras() {
  const { user } = useAuth();
  const toast = useToast();
  const admin = isAdmin(user?.role);

  const [enabledOnly, setEnabledOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [previewing, setPreviewing] = useState<Camera | null>(null);
  const [deleting, setDeleting] = useState<Camera | null>(null);
  const [testResults, setTestResults] = useState<Record<string, CameraTestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useCameras(enabledOnly);
  const testMutation = useTestCameraMutation();
  const deleteMutation = useDeleteCameraMutation();

  const cameras = data ?? [];

  const openCreate = (): void => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (camera: Camera): void => {
    setEditing(camera);
    setFormOpen(true);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const runTest = (camera: Camera): void => {
    setTestingId(camera.id);
    testMutation.mutate(camera.id, {
      onSuccess: (result) => {
        setTestResults((current) => ({ ...current, [camera.id]: result }));
      },
      onError: (probeError) => {
        toast.error("Could not run the test", errorMessage(probeError));
      },
      onSettled: () => {
        setTestingId(null);
      },
    });
  };

  const confirmDelete = async (): Promise<void> => {
    const camera = deleting;
    if (!camera) return;

    try {
      await deleteMutation.mutateAsync(camera.id);
      toast.success(`Camera ${camera.id} deleted`);
    } catch (deleteError) {
      // `DELETE /cameras/{id}` is not idempotent: a repeat call for the same
      // camera answers 404. That means someone else already removed it, which is
      // the outcome the operator asked for, so it is reported as information —
      // the `onSettled` invalidation in the hook is the whole fix.
      if (deleteError instanceof ApiError && deleteError.isGone) {
        toast.info(`Camera ${camera.id} was already deleted`);
      } else {
        toast.error("Could not delete the camera", errorMessage(deleteError));
      }
    } finally {
      setDeleting(null);
    }
  };

  const renderProbe = (camera: Camera): ReactNode => {
    const result = testResults[camera.id];
    return result ? <ProbeResult result={result} /> : null;
  };

  const emptyState = (
    <EmptyState
      icon="camera"
      title={enabledOnly ? "No enabled cameras" : "No cameras yet"}
      description={
        enabledOnly
          ? "Every camera in the fleet is switched off. Turn off “Enabled only” to see them all."
          : "A camera is one RTSP stream plus the zone it watches. Add the first one to start collecting attendance."
      }
      action={
        admin ? (
          <Button size="sm" onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" />
            Add camera
          </Button>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            An administrator can add the first camera.
          </p>
        )
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Cameras"
        description="The RTSP streams the edge nodes run detection on. Status refreshes automatically."
        actions={
          // Hiding this is a convenience, not a security boundary: `POST /cameras`
          // requires the admin role server-side and re-checks it on every call.
          admin ? (
            <Button onClick={openCreate}>
              <Icon name="plus" className="h-4 w-4" />
              Add camera
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={isPending}
            onClick={() => {
              void refetch();
            }}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Refresh
          </Button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {cameras.length} camera{cameras.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="w-full max-w-xs">
          <Switch
            checked={enabledOnly}
            onChange={setEnabledOnly}
            label="Enabled only"
            description="Hide cameras that are switched off."
          />
        </div>
      </div>

      {isPending ? (
        <Card>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
          </div>
        </Card>
      ) : isError ? (
        <ErrorState
          error={error}
          title="Could not load the cameras"
          onRetry={() => void refetch()}
        />
      ) : cameras.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* `md` and up: the dense table. */}
          <Card padded={false} className="hidden overflow-hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Camera</TableHeaderCell>
                  <TableHeaderCell>Scope</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Last state</TableHeaderCell>
                  <TableHeaderCell align="right">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cameras.map((camera) => {
                  const name = camera.name.trim() === "" ? camera.id : camera.name;
                  const credentials = hasUrlCredentials(camera.url);

                  return (
                    <Fragment key={camera.id}>
                      <TableRow>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {name}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {camera.id}
                            </span>
                            {credentials ? (
                              <Badge tone="warning" icon="alert" className="mt-0.5">
                                URL embeds credentials
                              </Badge>
                            ) : null}
                            <span className="font-mono text-[11px] break-all text-slate-400 dark:text-slate-500">
                              {redactUrlCredentials(camera.url)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span>{formatText(camera.zone)}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatText(camera.site)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge style={cameraStyle(camera.online)} />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatRelative(camera.last_seen_at)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{formatText(camera.last_state)}</span>
                            {camera.last_error ? (
                              <span className="text-xs text-rose-600 dark:text-rose-400">
                                {camera.last_error}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell align="right">
                          <div className="flex justify-end">
                            <RowActions
                              camera={camera}
                              testing={testingId === camera.id}
                              onTest={() => runTest(camera)}
                              onPreview={() => setPreviewing(camera)}
                              onEdit={() => openEdit(camera)}
                              onDelete={() => setDeleting(camera)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>

                      {testResults[camera.id] ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="bg-slate-50 dark:bg-slate-900/40"
                          >
                            {renderProbe(camera)}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Below `md`: one card per camera, so nothing is squeezed off-screen. */}
          <div className="flex flex-col gap-3 md:hidden">
            {cameras.map((camera) => {
              const name = camera.name.trim() === "" ? camera.id : camera.name;
              const credentials = hasUrlCredentials(camera.url);

              return (
                <Card
                  key={camera.id}
                  title={name}
                  description={<span className="font-mono text-xs">{camera.id}</span>}
                  actions={<StatusBadge style={cameraStyle(camera.online)} />}
                >
                  <div className="flex flex-col gap-3">
                    {credentials ? (
                      <Badge tone="warning" icon="alert">
                        Stream URL embeds credentials
                      </Badge>
                    ) : null}

                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <CardField label="Zone">
                        {formatText(camera.zone)}
                        {camera.site ? (
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {camera.site}
                          </span>
                        ) : null}
                      </CardField>
                      <CardField label="Last seen">
                        {formatRelative(camera.last_seen_at)}
                      </CardField>
                      <CardField label="Last state">
                        {formatText(camera.last_state)}
                      </CardField>
                      <CardField label="URL">
                        <span className="font-mono text-[11px] break-all">
                          {redactUrlCredentials(camera.url)}
                        </span>
                      </CardField>
                    </dl>

                    {camera.last_error ? (
                      <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 break-words">{camera.last_error}</span>
                      </p>
                    ) : null}

                    <RowActions
                      camera={camera}
                      testing={testingId === camera.id}
                      onTest={() => runTest(camera)}
                      onPreview={() => setPreviewing(camera)}
                      onEdit={() => openEdit(camera)}
                      onDelete={() => setDeleting(camera)}
                    />

                    {renderProbe(camera)}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <CameraFormDialog open={formOpen} camera={editing} onClose={closeForm} />

      {previewing ? (
        <CameraPreviewDialog
          open
          camera={previewing}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this camera?"
        description={
          deleting
            ? `“${deleting.name.trim() === "" ? deleting.id : deleting.name}” will be deactivated and its stream stopped.`
            : undefined
        }
        confirmLabel="Delete camera"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          void confirmDelete();
        }}
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The camera row is kept for the events it already recorded, so its history
          and attendance evidence stay intact. Deleting is not reversible from this
          screen.
        </p>
      </ConfirmDialog>
    </>
  );
}
