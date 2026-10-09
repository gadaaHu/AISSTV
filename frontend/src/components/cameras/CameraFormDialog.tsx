import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type {
  Camera,
  CameraInput,
  CameraTestResult,
  CameraUpdate,
} from "../../api/types";
import {
  useCreateCameraMutation,
  useTestCameraMutation,
  useTestCameraUrlMutation,
  useUpdateCameraMutation,
} from "../../hooks/queries/useCameras";
import { CAMERA_ID_PATTERN, RTSP_TRANSPORTS } from "../../lib/constants";
import { hasUrlCredentials, redactUrlCredentials } from "../../lib/format";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "../ui";

/**
 * Create/edit dialog for a camera.
 *
 * Validation lives here rather than on the server: `POST /cameras` and
 * `PATCH /cameras/{id}` answer a 422 with **no field-level detail**, so a form
 * that waited for the response could only ever say "some value was rejected".
 *
 * Two deliberate exceptions to the console's usual handling of stream URLs:
 *
 * * This is the one surface that renders `camera.url` verbatim, because an
 *   administrator cannot edit a value they cannot see. Everywhere else the URL
 *   goes through `redactUrlCredentials`.
 * * An untouched password is **omitted** from the request body rather than sent
 *   empty. `PATCH /cameras/{id}` is the one update endpoint without
 *   `exclude_none`, so an explicit `null` there clears the stored password —
 *   which is exactly the trap this avoids.
 */

/* ----------------------------------------------------------------- schema */

/**
 * The number controls are **coerced**, not transformed.
 *
 * `z.coerce.number()` keeps the form's input type (`string`, straight from the
 * `<input>`) apart from the parsed output type (`number`), which is what
 * `useForm<FormInput, undefined, FormOutput>` and the resolver agree on. A blank
 * control yields `undefined` and an unparseable one `NaN`; the refine below
 * turns both into a readable message.
 */
const cameraFormSchema = z.object({
  // Create-only: the id is immutable afterwards, so edit mode never sends it.
  id: z
    .string()
    .trim()
    .regex(
      CAMERA_ID_PATTERN,
      "Use 2–64 characters: letters, digits, underscore or hyphen",
    )
    .optional(),
  name: z.string().trim(),
  zone: z.string().trim().min(1, "A zone is required"),
  site: z.string().trim(),
  url: z.string().trim().min(1, "A stream URL is required"),
  rtsp_transport: z.enum(RTSP_TRANSPORTS),
  username: z.string().trim(),
  password: z.string(),
  enabled: z.boolean(),
  fps_process: z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value >= 0.1 && value <= 30, {
      message: "Frames per second must be between 0.1 and 30",
    }),
  detection_confidence: z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value >= 0 && value <= 1, {
      message: "Detection confidence must be between 0 and 1",
    }),
  face_threshold: z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value >= 0 && value <= 1, {
      message: "Face threshold must be between 0 and 1",
    }),
  save_snapshots: z.boolean(),
  tags: z.string(),
  notes: z.string(),
});

type FormInput = z.input<typeof cameraFormSchema>;
type FormOutput = z.output<typeof cameraFormSchema>;
type FormField = Extract<keyof FormInput, string>;

const PROCESSING_DEFAULTS = {
  rtsp_transport: "tcp",
  enabled: true,
  fps_process: "3",
  detection_confidence: "0.45",
  face_threshold: "0.45",
  save_snapshots: false,
} as const;

function createDefaults(): FormInput {
  return {
    id: "",
    name: "",
    zone: "",
    site: "",
    url: "",
    username: "",
    password: "",
    tags: "",
    notes: "",
    ...PROCESSING_DEFAULTS,
  };
}

/**
 * A stored transport the client does not know about falls back to `tcp`.
 *
 * The column is a free string on the server, so a value such as `"http"` would
 * otherwise produce a `Select` with nothing selected and a form that cannot be
 * submitted.
 */
function transportOrDefault(value: string): (typeof RTSP_TRANSPORTS)[number] {
  return RTSP_TRANSPORTS.find((transport) => transport === value) ?? "tcp";
}

/** Edit mode starts from the stored camera; a `null` column becomes a blank box. */
function editDefaults(camera: Camera): FormInput {
  return {
    id: camera.id,
    name: camera.name,
    zone: camera.zone,
    site: camera.site ?? "",
    // The raw URL, credentials included, on purpose: see the file note above.
    url: camera.url,
    username: camera.username ?? "",
    // Never pre-filled: a blank password means "keep the stored one".
    password: "",
    rtsp_transport: transportOrDefault(camera.rtsp_transport),
    enabled: camera.enabled,
    fps_process: `${camera.fps_process}`,
    detection_confidence: `${camera.detection_confidence}`,
    face_threshold: `${camera.face_threshold}`,
    save_snapshots: camera.save_snapshots,
    tags: (camera.tags ?? []).join(", "),
    notes: camera.notes ?? "",
  };
}

/** A blank optional string becomes `undefined`, so the key is left out entirely. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** `{ password: undefined }` would still serialise no key, but be explicit. */
function include<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * The JSON body for a create or an update.
 *
 * Blank optionals are omitted, and the password is only present when the
 * operator actually typed one. `zone` is the one required column, so it is
 * spelled out as such rather than inherited from the all-optional
 * `CameraUpdate`. `notes` is merged in by `withNotes` below, so that an existing
 * camera's note survives an edit that did not touch it.
 */
type CameraBody = Omit<CameraUpdate, "id" | "zone" | "url"> & {
  zone: string;
  url: string;
};

function payloadFrom(values: FormOutput): CameraBody {
  return {
    ...include("name", optional(values.name)),
    zone: values.zone,
    ...include("site", optional(values.site)),
    url: values.url,
    rtsp_transport: values.rtsp_transport,
    ...include("username", optional(values.username)),
    ...include("password", optional(values.password)),
    enabled: values.enabled,
    fps_process: values.fps_process,
    detection_confidence: values.detection_confidence,
    face_threshold: values.face_threshold,
    save_snapshots: values.save_snapshots,
    tags: parseTags(values.tags),
  };
}

function withNotes(body: CameraBody, values: FormOutput): CameraBody {
  const notes = optional(values.notes);
  return notes === undefined ? body : { ...body, notes };
}

/* ------------------------------------------------------------ result panel */

interface TestDetail {
  label: string;
  value: string;
}

function resolutionLabel(width: number | null, height: number | null): string | null {
  return width === null || height === null ? null : `${width}×${height}`;
}

function fpsLabel(fps: number | null): string | null {
  return fps === null ? null : `${fps} fps`;
}

function latencyLabel(latencyMs: number | null): string | null {
  return latencyMs === null ? null : `${latencyMs} ms`;
}

/**
 * A probe result, rendered from `result.ok`.
 *
 * The probe endpoints answer HTTP 200 for a failed probe, so the outcome is
 * decided here and nowhere else.
 */
function TestResultPanel({ result }: { result: CameraTestResult }) {
  const details: TestDetail[] = [
    { label: "Resolution", value: resolutionLabel(result.width, result.height) ?? "" },
    { label: "Frame rate", value: fpsLabel(result.fps) ?? "" },
    { label: "Codec", value: result.codec ?? "" },
    { label: "Latency", value: latencyLabel(result.latency_ms) ?? "" },
  ].filter((detail) => detail.value !== "");

  return (
    <div
      role="status"
      className={
        result.ok
          ? "flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : "flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      }
    >
      <div className="flex items-start gap-2">
        <Icon
          name={result.ok ? "check" : "alert"}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <div className="min-w-0">
          <p className="font-semibold">
            {result.ok ? "Connection OK" : "Connection failed"}
          </p>
          <p className="mt-0.5 break-words">{result.message}</p>
        </div>
      </div>

      {details.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6">
          {details.map((detail) => (
            <div key={detail.label} className="flex flex-col">
              <dt className="opacity-70">{detail.label}</dt>
              <dd className="font-medium">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

/**
 * The dialog the page mounts.
 *
 * It is deliberately a thin wrapper: the body below is only mounted while the
 * dialog is open, and is **keyed by the camera it edits**. Closing and reopening
 * (or switching from "add" to a row's "edit") therefore builds a fresh form
 * rather than resetting an existing one — no effect has to reconcile a stale
 * password field or a stale probe result, and `useForm`'s defaults are exactly
 * right by construction.
 */
export function CameraFormDialog({
  open,
  camera,
  onClose,
}: {
  open: boolean;
  camera: Camera | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <CameraForm
      key={camera ? `edit:${camera.id}` : "create"}
      camera={camera}
      onClose={onClose}
    />
  );
}

function CameraForm({
  camera,
  onClose,
}: {
  camera: Camera | null;
  onClose: () => void;
}) {
  const idPrefix = useId();
  const [testResult, setTestResult] = useState<CameraTestResult | null>(null);

  const createMutation = useCreateCameraMutation();
  const updateMutation = useUpdateCameraMutation();
  const testUrlMutation = useTestCameraUrlMutation();
  const testStoredMutation = useTestCameraMutation();

  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(cameraFormSchema),
    defaultValues: camera ? editDefaults(camera) : createDefaults(),
    mode: "onTouched",
  });

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    trigger,
  } = form;

  // `useWatch` rather than `form.watch()`: the latter returns a function React
  // Compiler cannot memoize, which trips `react-hooks/incompatible-library`.
  // These three are the only values the dialog needs reactively, and the `?? false`
  // keeps the two switches controlled from the very first render.
  const enabled = useWatch({ control, name: "enabled" }) ?? false;
  const saveSnapshots = useWatch({ control, name: "save_snapshots" }) ?? false;
  const urlValue = useWatch({ control, name: "url" }) ?? "";

  const testing = testUrlMutation.isPending || testStoredMutation.isPending;
  const busy = isSubmitting || createMutation.isPending || updateMutation.isPending;

  const fieldDomId = (field: FormField): string => `${idPrefix}-${field}`;

  // `Field` derives its message ids from `htmlFor`, so the control points at
  // whichever of the hint and the error is actually rendered.
  const describedBy = (field: FormField, hasHint: boolean): string | undefined => {
    if (errors[field]) return `${fieldDomId(field)}-error`;
    return hasHint ? `${fieldDomId(field)}-hint` : undefined;
  };

  const clearTestResult = (): void => {
    if (testResult !== null) setTestResult(null);
  };

  const urlHasCredentials = hasUrlCredentials(urlValue);

  const onTest = async (): Promise<void> => {
    setTestResult(null);
    try {
      if (camera) {
        // An existing camera is probed through its stored configuration, which
        // is the only way to test the server-built URL (credentials included).
        setTestResult(await testStoredMutation.mutateAsync(camera.id));
        return;
      }

      const valid = await trigger("url");
      const url = form.getValues("url").trim();
      if (!valid || url === "") return;

      setTestResult(
        await testUrlMutation.mutateAsync({
          url,
          rtsp_transport: form.getValues("rtsp_transport"),
        }),
      );
    } catch {
      // A transport failure is reported by the mutation's own `onError` toast and
      // has no `CameraTestResult` to render, so the panel simply stays empty.
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const body = withNotes(payloadFrom(values), values);

    try {
      if (camera) {
        await updateMutation.mutateAsync({ id: camera.id, body });
      } else {
        const input: CameraInput = { id: values.id ?? "", ...body };
        await createMutation.mutateAsync(input);
      }
      onClose();
    } catch {
      // Reported by the mutation's `onError` toast; the dialog stays open so the
      // operator does not lose what they typed.
    }
  });

  const onFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={camera ? `Edit camera ${camera.id}` : "Add camera"}
      description={
        camera
          ? "Only the fields you change are sent — a blank password keeps the stored one."
          : "The camera id is fixed once created; it is the key the edge nodes report under."
      }
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            className="mr-auto"
            loading={testing}
            onClick={() => {
              void onTest();
            }}
          >
            Test connection
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${idPrefix}-form`} size="sm" loading={busy}>
            {camera ? "Save changes" : "Add camera"}
          </Button>
        </>
      }
    >
      <form id={`${idPrefix}-form`} noValidate onSubmit={onFormSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          {camera ? (
            <Field label="Camera id" htmlFor={fieldDomId("id")} hint="Fixed at creation">
              <div
                id={fieldDomId("id")}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                <Icon name="key" className="h-4 w-4 shrink-0 text-slate-400" />
                {camera.id}
              </div>
            </Field>
          ) : (
            <Field
              label="Camera id"
              htmlFor={fieldDomId("id")}
              required
              error={errors.id?.message}
              hint="2–64 characters: letters, digits, underscore or hyphen"
            >
              <Input
                id={fieldDomId("id")}
                autoComplete="off"
                spellCheck={false}
                placeholder="gate-north"
                className="font-mono"
                invalid={Boolean(errors.id)}
                aria-describedby={describedBy("id", true)}
                {...register("id")}
              />
            </Field>
          )}

          <Field
            label="Name"
            htmlFor={fieldDomId("name")}
            error={errors.name?.message}
            hint="Shown in lists; defaults to the id when blank"
          >
            <Input
              id={fieldDomId("name")}
              autoComplete="off"
              placeholder="North gate"
              invalid={Boolean(errors.name)}
              aria-describedby={describedBy("name", true)}
              {...register("name")}
            />
          </Field>

          <Field
            label="Zone"
            htmlFor={fieldDomId("zone")}
            required
            error={errors.zone?.message}
            hint="The area this camera watches"
          >
            <Input
              id={fieldDomId("zone")}
              autoComplete="off"
              placeholder="main-entrance"
              invalid={Boolean(errors.zone)}
              aria-describedby={describedBy("zone", true)}
              {...register("zone")}
            />
          </Field>

          <Field
            label="Site"
            htmlFor={fieldDomId("site")}
            error={errors.site?.message}
            hint="Building or location, when there is more than one"
          >
            <Input
              id={fieldDomId("site")}
              autoComplete="off"
              placeholder="Head office"
              invalid={Boolean(errors.site)}
              aria-describedby={describedBy("site", true)}
              {...register("site")}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <Field
            label="Stream URL"
            htmlFor={fieldDomId("url")}
            required
            error={errors.url?.message}
            hint={
              urlHasCredentials
                ? undefined
                : "rtsp://, http:// or https:// — the URL the edge node opens"
            }
          >
            <Input
              id={fieldDomId("url")}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="rtsp://10.0.0.20:554/stream1"
              invalid={Boolean(errors.url)}
              aria-describedby={describedBy("url", true)}
              {...register("url", {
                onChange: () => {
                  clearTestResult();
                },
              })}
            />
          </Field>

          {urlHasCredentials ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 break-words">
                This URL embeds credentials. The API hands it to every signed-in
                user, and this dialog is the only place it is shown unredacted —
                elsewhere it reads{" "}
                <span className="font-mono">{redactUrlCredentials(urlValue)}</span>.
                Prefer the username and password fields below, which the backend
                merges into the URL only when it opens the stream.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="RTSP transport"
              htmlFor={fieldDomId("rtsp_transport")}
              error={errors.rtsp_transport?.message}
              hint="TCP is the safe default; UDP can drop frames"
            >
              <Select
                id={fieldDomId("rtsp_transport")}
                invalid={Boolean(errors.rtsp_transport)}
                aria-describedby={describedBy("rtsp_transport", true)}
                {...register("rtsp_transport")}
              >
                {RTSP_TRANSPORTS.map((transport) => (
                  <option key={transport} value={transport}>
                    {transport.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Username"
              htmlFor={fieldDomId("username")}
              error={errors.username?.message}
              hint="Optional; merged into the URL server-side"
            >
              <Input
                id={fieldDomId("username")}
                autoComplete="off"
                invalid={Boolean(errors.username)}
                aria-describedby={describedBy("username", true)}
                {...register("username")}
              />
            </Field>

            <Field
              label="Password"
              htmlFor={fieldDomId("password")}
              error={errors.password?.message}
              hint={
                camera
                  ? "Leave blank to keep the stored password"
                  : "Optional; stored server-side and never displayed again"
              }
            >
              <Input
                id={fieldDomId("password")}
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.password)}
                aria-describedby={describedBy("password", true)}
                {...register("password")}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 p-1 dark:border-slate-800">
            <Switch
              checked={enabled}
              onChange={(checked) => {
                setValue("enabled", checked, { shouldDirty: true });
              }}
              label="Enabled"
              description="Disabled cameras stay configured but are skipped by the detector and the edge nodes."
            />

            <Switch
              checked={saveSnapshots}
              onChange={(checked) => {
                setValue("save_snapshots", checked, { shouldDirty: true });
              }}
              label="Save snapshots"
              description="Keep the JPEG of each detection alongside the event, as evidence."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="FPS to process"
              htmlFor={fieldDomId("fps_process")}
              error={errors.fps_process?.message}
              hint="0.1 – 30"
            >
              <Input
                id={fieldDomId("fps_process")}
                type="number"
                min="0.1"
                max="30"
                step="0.1"
                inputMode="decimal"
                invalid={Boolean(errors.fps_process)}
                aria-describedby={describedBy("fps_process", true)}
                {...register("fps_process")}
              />
            </Field>

            <Field
              label="Detection confidence"
              htmlFor={fieldDomId("detection_confidence")}
              error={errors.detection_confidence?.message}
              hint="0 – 1"
            >
              <Input
                id={fieldDomId("detection_confidence")}
                type="number"
                min="0"
                max="1"
                step="0.01"
                inputMode="decimal"
                invalid={Boolean(errors.detection_confidence)}
                aria-describedby={describedBy("detection_confidence", true)}
                {...register("detection_confidence")}
              />
            </Field>

            <Field
              label="Face threshold"
              htmlFor={fieldDomId("face_threshold")}
              error={errors.face_threshold?.message}
              hint="0 – 1"
            >
              <Input
                id={fieldDomId("face_threshold")}
                type="number"
                min="0"
                max="1"
                step="0.01"
                inputMode="decimal"
                invalid={Boolean(errors.face_threshold)}
                aria-describedby={describedBy("face_threshold", true)}
                {...register("face_threshold")}
              />
            </Field>
          </div>

          <Field
            label="Tags"
            htmlFor={fieldDomId("tags")}
            error={errors.tags?.message}
            hint="Comma separated, e.g. gate, outdoor, night"
          >
            <Input
              id={fieldDomId("tags")}
              autoComplete="off"
              placeholder="gate, outdoor"
              invalid={Boolean(errors.tags)}
              aria-describedby={describedBy("tags", true)}
              {...register("tags")}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor={fieldDomId("notes")}
            error={errors.notes?.message}
            hint="Anything the next operator should know"
          >
            <Textarea
              id={fieldDomId("notes")}
              rows={3}
              invalid={Boolean(errors.notes)}
              aria-describedby={describedBy("notes", true)}
              {...register("notes")}
            />
          </Field>

          <div className="flex flex-col gap-2">
            {testing ? (
              <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Spinner size="sm" label="Probing the stream" />
                Probing the stream — this can take up to about 10 seconds.
              </p>
            ) : null}
            {testResult ? <TestResultPanel result={testResult} /> : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
