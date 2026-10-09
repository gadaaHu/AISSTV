/**
 * Types mirroring the backend's response models.
 *
 * They are written to match `backend/app/schemas/*` and the route-local models,
 * so a rename on the server shows up here as a type error rather than as
 * `undefined` in the UI.
 */

/* -------------------------------------------------------------------- auth */

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Mirrors the backend's `UserOut`.
 *
 * `id` and `created_at` are always sent, so they belong here even though the UI
 * mostly reads `username` and `role` — omitting them invites code that assumes
 * a user has no stable identifier.
 */
export interface UserOut {
  id: string;
  username: string;
  full_name: string | null;
  role: string;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  env: string | null;
  db: boolean | null;
}

/* --------------------------------------------------------------- employees */

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string | null;
  department: string | null;
  title: string | null;
  /** `"09:00:00"`. Kept as a string: it is a wall-clock time, not an instant. */
  shift_start: string;
  shift_end: string;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeInput {
  code: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  shift_start?: string;
  shift_end?: string;
  timezone?: string;
}

/**
 * `PATCH /employees/{code}` applies `exclude_none`, so omitting a field and
 * sending `null` are equivalent — a value cannot be cleared through this call.
 */
export interface EmployeeUpdate {
  name?: string;
  email?: string;
  department?: string;
  title?: string;
  shift_start?: string;
  shift_end?: string;
  timezone?: string;
  active?: boolean;
}

export interface FaceUploadResponse {
  message: string | null;
  path: string | null;
}

/* -------------------------------------------------------------- attendance */

export interface AttendanceRow {
  employee_code: string;
  employee_name: string;
  department: string | null;
  day: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  minutes_late: number;
  dwell_seconds: number;
}

export interface AttendanceSummary {
  day: string;
  total_employees: number;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  checked_out: number;
  still_in: number;
}

export interface AttendanceRecord {
  id: string;
  employee_code: string;
  day: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  minutes_late: number;
  dwell_seconds: number;
  updated_at: string;
}

/* ------------------------------------------------------------------ events */

export interface AttendanceEvent {
  id: string;
  ts: string;
  local_ts: string | null;
  camera_id: string;
  zone: string | null;
  type: string;
  employee_code: string | null;
  confidence: number | null;
  track_id: number | null;
  meta: Record<string, unknown>;
}

/**
 * The **thin** camera projection returned by `GET /events/cameras/list`.
 * A different schema from `Camera`, so it is a separate type.
 */
export interface CameraListItem {
  id: string;
  zone: string;
  site: string | null;
  last_seen_at: string | null;
  last_state: string | null;
  active: boolean;
}

/* ----------------------------------------------------------------- cameras */

export interface Camera {
  id: string;
  name: string;
  zone: string;
  site: string | null;
  url: string;
  rtsp_transport: string;
  username: string | null;
  enabled: boolean;
  fps_process: number;
  detection_confidence: number;
  face_threshold: number;
  save_snapshots: boolean;
  tags: string[];
  notes: string | null;
  last_seen_at: string | null;
  last_state: string | null;
  last_error: string | null;
  edge_node: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** Computed server-side: `last_seen_at` within the last 60 seconds. */
  online: boolean;
}

export interface CameraTestResult {
  ok: boolean;
  message: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  latency_ms: number | null;
}

export interface CameraInput {
  /** Client-chosen, `^[a-zA-Z0-9_-]{2,64}$`. */
  id: string;
  name?: string;
  zone: string;
  site?: string;
  url: string;
  rtsp_transport?: string;
  username?: string;
  password?: string;
  enabled?: boolean;
  fps_process?: number;
  detection_confidence?: number;
  face_threshold?: number;
  save_snapshots?: boolean;
  tags?: string[];
  notes?: string;
}

/**
 * `PATCH /cameras/{id}` is the one update endpoint that does **not** apply
 * `exclude_none`, so an explicit `null` clears a value. The form omits untouched
 * fields instead, which keeps a blank password from wiping the stored one.
 */
export interface CameraUpdate {
  name?: string;
  zone?: string;
  site?: string;
  url?: string;
  rtsp_transport?: string;
  username?: string;
  password?: string;
  enabled?: boolean;
  fps_process?: number;
  detection_confidence?: number;
  face_threshold?: number;
  save_snapshots?: boolean;
  tags?: string[];
  notes?: string;
  active?: boolean;
}

export interface CameraTestUrlRequest {
  url: string;
  rtsp_transport?: string;
}

/* ------------------------------------------------------------------ leaves */

/**
 * Mirrors the backend's `LeaveOut`.
 *
 * Note what is *not* here, because the server does not send it:
 * `days_requested`, `half_day`, `half_day_period` and `review_note`. Day counts
 * are derived from the range, and a review note is appended to `reason` as
 * `"\n[Review note] …"`.
 */
export interface LeaveRequest {
  id: string;
  employee_code: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveInput {
  employee_code: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface LeaveReviewInput {
  /** Exactly `approved` or `rejected`; the server answers 400 otherwise. */
  status: "approved" | "rejected";
  note?: string;
}

/* --------------------------------------------------------------- incidents */

export const INCIDENT_DOMAINS = ["fraud", "safety", "panic"] as const;
export type IncidentDomain = (typeof INCIDENT_DOMAINS)[number];

export interface Incident {
  id: string;
  type: string;
  severity: string;
  status: string;
  camera_id: string | null;
  employee_code: string | null;
  zone: string | null;
  description: string | null;
  evidence: Record<string, unknown>;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------- users */

export interface UserInput {
  username: string;
  password: string;
  full_name?: string;
  role?: string;
  active?: boolean;
}

export interface UserUpdate {
  full_name?: string;
  role?: string;
  active?: boolean;
}

export interface ChangePasswordInput {
  old_password: string;
  new_password: string;
}

/* -------------------------------------------------------------- pagination */

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
