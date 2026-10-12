import { useCallback, useEffect, useRef, useState } from "react";

import type { Employee } from "../../api/types";
import { Button, Icon, Modal, Spinner } from "../ui";
import { useUploadFace } from "../../hooks/queries/useEmployees";
import { cn, errorMessage } from "../../lib/utils";

/**
 * Face learning dialog for one employee.
 *
 * Supports two enrollment flows:
 *  1. Live Camera: Directly captures real-time video frames from user's webcam.
 *  2. File Upload: Uploads static JPEG or PNG image files.
 */

const WARN_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface FaceState {
  employeeCode: string;
  file: File | null;
  preview: string | null;
  source: "camera" | "upload" | null;
  warning: string | null;
  rejection: string | null;
  result: string | null;
  path: string | null;
  uploadError: string | null;
  inputKey: number;
}

function initialFaceState(employeeCode: string): FaceState {
  return {
    employeeCode,
    file: null,
    preview: null,
    source: null,
    warning: null,
    rejection: null,
    result: null,
    path: null,
    uploadError: null,
    inputKey: 0,
  };
}

export function FaceUploadDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: Employee;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<FaceState>(() =>
    initialFaceState(employee.code),
  );

  const uploadMutation = useUploadFace();

  const current =
    state.employeeCode === employee.code
      ? state
      : initialFaceState(employee.code);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }, []);

  // Object-URL cleanup
  useEffect(() => {
    const preview = current.preview;
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [current.preview]);

  // Camera stream lifecycle
  useEffect(() => {
    let active = true;

    if (!open || mode !== "camera" || current.preview) {
      stopCamera();
      return;
    }

    setCameraLoading(true);
    setCameraError(null);

    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            // Autoplay catch handled safely
          });
        }
        setCameraActive(true);
        setCameraLoading(false);
      })
      .catch((_err) => {
        if (!active) return;
        setCameraActive(false);
        setCameraLoading(false);
        setCameraError(
          "Could not access live camera. Please allow camera permissions in your browser or switch to 'File Upload'.",
        );
      });

    return () => {
      active = false;
      stopCamera();
    };
  }, [open, mode, current.preview, retryCount, stopCamera]);

  const handleFileChange = (next: File | null, source: "camera" | "upload" = "upload") => {
    setState((previous) => {
      const base = {
        ...(previous.employeeCode === employee.code
          ? previous
          : initialFaceState(employee.code)),
        result: null,
        path: null,
        uploadError: null,
        warning: null,
        rejection: null,
        inputKey: previous.inputKey + 1,
      };

      if (!next) {
        return { ...base, file: null, preview: null, source: null };
      }

      if (!next.type.startsWith("image/")) {
        return {
          ...base,
          file: null,
          preview: null,
          source: null,
          rejection: `"${next.name}" is not an image. Choose a JPEG or PNG photograph.`,
        };
      }

      return {
        ...base,
        file: next,
        preview: URL.createObjectURL(next),
        source,
        warning:
          next.size > WARN_BYTES
            ? `That image is ${formatBytes(next.size)}. The server accepts it, but edge synchronization will be faster with a smaller photo.`
            : null,
      };
    });
  };

  // Capture frame from live camera
  const captureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File(
        [blob],
        `${employee.code}_live_${Date.now()}.jpg`,
        { type: "image/jpeg" },
      );

      stopCamera();
      handleFileChange(file, "camera");
    }, "image/jpeg", 0.95);
  };

  const handleRetake = () => {
    setState((prev) => ({
      ...prev,
      file: null,
      preview: null,
      source: null,
      result: null,
      uploadError: null,
    }));
    if (mode === "camera") {
      setRetryCount((c) => c + 1);
    }
  };

  const handleUpload = () => {
    const file = current.file;
    if (!file) return;

    setState((previous) => ({
      ...previous,
      uploadError: null,
      result: null,
    }));

    uploadMutation.mutate(
      { code: employee.code, file },
      {
        onSuccess: (response) => {
          setState((previous) => ({
            ...previous,
            result: response.message ?? "Face enrolled successfully! Edge cameras will pick it up on next sync.",
            path: response.path,
          }));
        },
        onError: (error) => {
          setState((previous) => ({
            ...previous,
            uploadError: errorMessage(error),
          }));
        },
      },
    );
  };

  const busy = uploadMutation.isPending;

  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      title={`Learn Face — ${employee.name}`}
      description={`Enroll facial biometric features for ${employee.code} (${employee.department ?? "General"}).`}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={handleModalClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!current.file || busy}
            onClick={handleUpload}
            className="gemini-border-glow shadow-md shadow-gemini-blue/20"
          >
            {busy ? "Learning Face…" : "Save & Learn Face"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Mode Switcher Tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode("camera");
              if (!current.preview) setRetryCount((c) => c + 1);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all",
              mode === "camera"
                ? "bg-white text-gemini-blue shadow-sm dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon name="camera" className="h-4 w-4" />
            Live Camera
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("upload");
              stopCamera();
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-all",
              mode === "upload"
                ? "bg-white text-gemini-blue shadow-sm dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon name="image" className="h-4 w-4" />
            Upload Photo
          </button>
        </div>

        {/* Live Camera Viewfinder or Captured Preview */}
        {mode === "camera" && !current.preview && (
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 aspect-4/3 flex items-center justify-center shadow-inner dark:border-slate-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "h-full w-full object-cover transform -scale-x-100", // Mirror selfie preview
                  !cameraActive && "hidden",
                )}
              />

              {/* Live Overlay Guides */}
              {cameraActive && (
                <>
                  {/* Status Indicator */}
                  <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    LIVE CAMERA FEED
                  </div>

                  {/* Face Framing Oval Silhouette */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-52 w-44 rounded-[50%] border-2 border-dashed border-gemini-blue/80 shadow-[0_0_20px_rgba(66,133,244,0.3)] dark:border-cyan-400/80 animate-pulse flex items-center justify-center">
                      <span className="text-[11px] font-medium text-white/90 bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm">
                        Center Face Here
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Camera Loading State */}
              {cameraLoading && (
                <div className="flex flex-col items-center gap-2 text-slate-300">
                  <Spinner size="md" label="Starting camera stream" />
                  <p className="text-xs">Initializing camera feed…</p>
                </div>
              )}

              {/* Camera Error State */}
              {cameraError && (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <Icon name="wifiOff" className="h-8 w-8 text-rose-400" />
                  <p className="text-xs text-rose-300 font-medium">{cameraError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRetryCount((c) => c + 1)}
                    className="mt-1"
                  >
                    <Icon name="refresh" className="h-3.5 w-3.5 mr-1" />
                    Try Again
                  </Button>
                </div>
              )}
            </div>

            {/* Shutter Button */}
            {cameraActive && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={captureSnapshot}
                  className="group relative flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95 hover:shadow-blue-500/40"
                >
                  <div className="h-3 w-3 rounded-full bg-white ring-4 ring-white/30 group-hover:scale-110 transition-transform" />
                  Capture Face Snapshot
                </button>
              </div>
            )}
          </div>
        )}

        {/* Captured / Uploaded Preview */}
        {current.preview && (
          <div className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 aspect-4/3 max-h-72 flex items-center justify-center dark:border-slate-800">
              <img
                src={current.preview}
                alt={`Face snapshot of ${employee.name}`}
                className="h-full w-full object-contain"
              />
              <div className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                {current.source === "camera" ? "📷 Live Snapshot" : "📁 File Image"}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {current.file?.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetake}
                disabled={busy}
                className="text-xs text-gemini-blue hover:text-blue-700"
              >
                <Icon name="refresh" className="h-3.5 w-3.5 mr-1" />
                Retake / Change
              </Button>
            </div>
          </div>
        )}

        {/* File Upload Mode (when no preview is chosen yet) */}
        {mode === "upload" && !current.preview && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <Icon
                name="image"
                className="h-8 w-8 text-slate-400 dark:text-slate-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a clear, front-facing JPEG or PNG photograph.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <input
                key={current.inputKey}
                id="face-file"
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(event) => {
                  handleFileChange(event.target.files?.[0] ?? null, "upload");
                }}
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1.5 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
              />
            </div>
          </div>
        )}

        {/* Status Alerts and Messages */}
        {current.rejection && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {current.rejection}
          </p>
        )}

        {current.warning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {current.warning}
          </p>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Spinner size="sm" label="Learning and uploading face" />
            Analyzing face features and encoding ArcFace biometric embeddings…
          </p>
        )}

        {current.uploadError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {current.uploadError}
          </p>
        )}

        {current.result && (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <p className="font-semibold flex items-center gap-1.5">
              <Icon name="check" className="h-4 w-4 text-emerald-600" />
              {current.result}
            </p>
            {current.path && (
              <p className="mt-1 font-mono text-[11px] opacity-80 break-all">
                {current.path}
              </p>
            )}
            <p className="mt-1 text-[11px] opacity-90">
              The AI camera edge nodes will recognize {employee.name} automatically.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
