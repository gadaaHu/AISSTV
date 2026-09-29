export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserOut {
  username: string;
  full_name: string | null;
  role: string;
  active: boolean;
  last_login_at: string | null;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string | null;
  department: string | null;
  title: string | null;
  shift_start: string;
  shift_end: string;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

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

export interface CameraFormData {
  id: string;
  name: string;
  zone: string;
  site: string;
  url: string;
  rtsp_transport: string;
  username: string;
  password: string;
  enabled: boolean;
  fps_process: number;
  detection_confidence: number;
  face_threshold: number;
  save_snapshots: boolean;
  tags: string[];
  notes: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
