import { useEffect, useState } from "react";

import type { Employee } from "../../api/types";
import { Button, Icon, Modal, Spinner } from "../ui";
import { useUploadFace } from "../../hooks/queries/useEmployees";
import { errorMessage } from "../../lib/utils";

/**
 * Face-photo upload for one employee.
 *
 * The preview is an object URL, which is a live handle on the file: it is
 * revoked when the file is replaced and on unmount, otherwise every attempt
 * leaks a whole image for the lifetime of the document.
 *
 * The size check is a courtesy, not a security boundary — the server enforces
 * no limit at all, so an enormous file would be accepted and simply crawl.
 */

/** Warn above this; the server would take the upload anyway. */
const WARN_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Everything the dialog gathers, in one value.
 *
 * Replaced wholesale when a new file is chosen, and reset lazily when the
 * dialog is opened for a different employee (see the `employeeCode` guard), so
 * there is no effect that calls `setState` on mount.
 */
interface FaceState {
  employeeCode: string;
  file: File | null;
  preview: string | null;
  warning: string | null;
  rejection: string | null;
  result: string | null;
  path: string | null;
  uploadError: string | null;
  /**
   * Bumped on every file change and used as the input's `key`. Remounting the
   * input is the only reliable way to drop a rejected file from it: a `FileList`
   * is read-only, so its value cannot be assigned.
   */
  inputKey: number;
}

function initialFaceState(employeeCode: string): FaceState {
  return {
    employeeCode,
    file: null,
    preview: null,
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
  const [state, setState] = useState<FaceState>(() =>
    initialFaceState(employee.code),
  );

  const uploadMutation = useUploadFace();

  // Opening for a different employee starts from a blank slate without an
  // effect: the stale state is simply never read.
  const current =
    state.employeeCode === employee.code
      ? state
      : initialFaceState(employee.code);

  // One object-URL lifecycle for every way the preview can change.
  useEffect(() => {
    const preview = current.preview;
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [current.preview]);

  const handleFileChange = (next: File | null) => {
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
        return { ...base, file: null, preview: null };
      }

      if (!next.type.startsWith("image/")) {
        return {
          ...base,
          file: null,
          preview: null,
          rejection: `"${next.name}" is not an image. Choose a JPEG or PNG photograph.`,
        };
      }

      return {
        ...base,
        file: next,
        preview: URL.createObjectURL(next),
        warning:
          next.size > WARN_BYTES
            ? `That image is ${formatBytes(next.size)}. The server accepts it, but the upload and the next camera sync will be slow, so a smaller photo is better.`
            : null,
      };
    });
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
            result: response.message ?? "The photo was stored on the server.",
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Face photo — ${employee.name}`}
      description={`Stored against ${employee.code}. Cameras match a face against the most recent photo on record.`}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={!current.file || busy}
            onClick={handleUpload}
          >
            {busy ? "Uploading…" : "Upload photo"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {current.preview ? (
          <img
            src={current.preview}
            alt={`Preview of the chosen photo for ${employee.name}`}
            className="max-h-72 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain dark:border-slate-800 dark:bg-slate-950"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-950/40">
            <Icon
              name="image"
              className="h-6 w-6 text-slate-400 dark:text-slate-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A clear, front-facing photograph works best.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="face-file"
            className="text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Photo file
          </label>
          <input
            key={current.inputKey}
            id="face-file"
            type="file"
            accept="image/*"
            disabled={busy}
            aria-describedby="face-file-hint"
            onChange={(event) => {
              handleFileChange(event.target.files?.[0] ?? null);
            }}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1.5 text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
          />
          <p
            id="face-file-hint"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {current.file
              ? `${current.file.name} — ${formatBytes(current.file.size)}`
              : "Images only. Keep it under about 10 MB; the server enforces no limit of its own."}
          </p>
        </div>

        {current.rejection ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {current.rejection}
          </p>
        ) : null}

        {current.warning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {current.warning}
          </p>
        ) : null}

        {busy ? (
          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Spinner size="sm" label="Uploading the photo" />
            Uploading. Large photographs take longer — the request is given a
            full minute before it times out.
          </p>
        ) : null}

        {current.uploadError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          >
            {current.uploadError}
          </p>
        ) : null}

        {current.result ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            <p className="font-medium">{current.result}</p>
            {current.path ? (
              <p className="mt-1 font-mono break-all opacity-90">
                {current.path}
              </p>
            ) : null}
            <p className="mt-1 opacity-90">
              The edge cameras pick the new photo up at their next sync, not
              immediately.
            </p>
          </div>
        ) : null}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          The photo is sent as multipart form data and matched locally on the
          edge node, so it does not have to leave your network to be useful.
        </p>
      </div>
    </Modal>
  );
}

