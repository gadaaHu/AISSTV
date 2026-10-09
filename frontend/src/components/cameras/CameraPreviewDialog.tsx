import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/errors";
import { fetchCameraSnapshot } from "../../api/endpoints";
import type { Camera } from "../../api/types";
import { cameraStyle } from "../../lib/constants";
import { formatDateTime } from "../../lib/dates";
import { cn, errorMessage } from "../../lib/utils";
import {
  Button,
  Icon,
  Modal,
  Skeleton,
  Spinner,
  StatusBadge,
} from "../ui";

/**
 * Live preview for one camera.
 *
 * The snapshot endpoint streams **raw JPEG bytes**, not JSON, and it needs the
 * `Authorization` header, so an `<img src="/api/cameras/...">` cannot be used —
 * the bytes are fetched with `fetchCameraSnapshot` and handed to the image as an
 * object URL.
 *
 * The object URL is the delicate part: **every** one created here is revoked,
 * both when it is replaced by the next frame and when the dialog closes. The
 * previous implementation created a new URL every two seconds and never revoked
 * one, leaking a blob of JPEG data per tick for as long as the dialog stayed
 * open.
 */

/** The preview polls faster than the lists: this is meant to look live. */
const PREVIEW_INTERVAL_MS = 2_000;

interface FrameState {
  /** `URL.createObjectURL(blob)` of the newest frame, or `null` before the first. */
  url: string | null;
  /** When the frame currently on screen was received. */
  receivedAt: Date | null;
  /** First load only: a spinner, rather than a flicker of empty frame. */
  loading: boolean;
  /** The newest failure, cleared by the next successful frame. */
  error: Error | null;
}

const EMPTY_FRAME: FrameState = {
  url: null,
  receivedAt: null,
  loading: false,
  error: null,
};

/** The two failure modes the endpoint documents, with their HTTP status. */
function snapshotHint(error: Error | null): string | null {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 502) {
    return "The server reached ffmpeg but the camera returned no frame. The stream is up but not delivering — check the encoder or the RTSP path.";
  }
  if (error.status === 500) {
    return "ffmpeg could not run or the stream could not be opened. Snapshots can take up to about 10 seconds before they give up.";
  }
  if (error.isConnectivityProblem) {
    return "The API did not respond. Check that the backend is running and reachable.";
  }
  return null;
}

/**
 * Normalises a thrown value.
 *
 * `fetchCameraSnapshot` always rejects with an `ApiError`, but a non-`ApiError`
 * cannot be assumed to be an `Error` either, and the frame state is only
 * interested in something renderable.
 */
function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(errorMessage(cause));
}

export function CameraPreviewDialog({
  open,
  camera,
  onClose,
}: {
  open: boolean;
  camera: Camera;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<FrameState>(EMPTY_FRAME);

  /** The object URL currently owned by the ref, so cleanup knows what to free. */
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped by the Refresh button to restart the polling effect. */
  const [generation, setGeneration] = useState(0);

  const cameraName = camera.name.trim() === "" ? camera.id : camera.name;
  const cameraId = camera.id;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Runs as a plain function inside the effect, never as a callback captured
     * by an interval: it reads the controller and cancellation flag from this
     * effect run, so a close can neither race it nor leave it writing state.
     */
    const tick = async (): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setFrame((current) => ({ ...current, loading: true }));

      try {
        const blob = await fetchCameraSnapshot(cameraId, controller.signal);
        if (cancelled) return;

        // Release the previous frame before adopting the new one. This is the
        // line the old implementation was missing.
        if (objectUrlRef.current !== null) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setFrame({ url, receivedAt: new Date(), loading: false, error: null });
      } catch (error) {
        // A request cancelled by close or by the next tick is not a failure.
        if (cancelled || controller.signal.aborted) return;
        setFrame((current) => ({ ...current, loading: false, error: toError(error) }));
      }
    };

    const schedule = (): void => {
      timer = setTimeout(() => {
        void tick().finally(() => {
          if (!cancelled) schedule();
        });
      }, PREVIEW_INTERVAL_MS);
    };

    void tick();
    schedule();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      // Cancels an in-flight request so closing the dialog stops the ffmpeg work
      // on the server as soon as the browser drops the connection.
      abortRef.current?.abort();
      abortRef.current = null;
      if (objectUrlRef.current !== null) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, cameraId, generation]);

  const refreshing = frame.loading && frame.url !== null;
  const hint = snapshotHint(frame.error);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview — ${cameraName}`}
      description="Fetched on demand; the server grabs a single frame with ffmpeg each time."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            className="mr-auto"
            loading={frame.loading}
            onClick={() => {
              setGeneration((value) => value + 1);
            }}
          >
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge style={cameraStyle(camera.online)} />
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {camera.id}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {camera.zone}
          </span>

          <span className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {refreshing ? <Spinner size="sm" label="Refreshing frame" /> : null}
            {frame.receivedAt
              ? `Frame received ${formatDateTime(frame.receivedAt.toISOString())}`
              : "No frame yet"}
          </span>
        </div>

        <div
          className={cn(
            "relative flex min-h-56 items-center justify-center overflow-hidden rounded-lg border bg-slate-950",
            frame.error
              ? "border-rose-300 dark:border-rose-800"
              : "border-slate-200 dark:border-slate-800",
          )}
        >
          {frame.url ? (
            <img
              // A new object URL each tick: the browser would otherwise keep
              // showing the previous frame from its cache.
              key={frame.url}
              src={frame.url}
              alt={`Latest snapshot from ${cameraName} in ${camera.zone}`}
              className="max-h-[60vh] w-full object-contain"
              // A rotated or refreshed URL that fails to decode is retried on the
              // next tick rather than left as a broken image.
              onError={() => {
                setFrame((current) => ({
                  ...current,
                  error: new Error("The frame could not be decoded."),
                }));
              }}
            />
          ) : frame.loading ? (
            <div className="flex w-full flex-col items-center gap-3 p-6">
              <Spinner size="lg" label="Loading the first frame" />
              <p className="text-xs text-slate-400">
                Grabbing a frame — this can take up to about 10 seconds.
              </p>
            </div>
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </div>

        {frame.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
          >
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {errorMessage(frame.error, "Could not fetch a snapshot")}
              </p>
              {hint ? <p className="mt-0.5 break-words opacity-90">{hint}</p> : null}
              <p className="mt-0.5 opacity-90">
                The preview keeps trying every {PREVIEW_INTERVAL_MS / 1000} seconds.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Refreshing every {PREVIEW_INTERVAL_MS / 1000} seconds. The endpoint can
            answer <span className="font-mono">500 Snapshot failed: …</span> when
            ffmpeg cannot open the stream, or{" "}
            <span className="font-mono">502 No frame from camera</span> when the
            stream is reachable but silent — both can take up to about 10 seconds.
          </p>
        )}
      </div>
    </Modal>
  );
}
