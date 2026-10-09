import {
  pathSegment,
  request,
  requestBlob,
  requestVoid,
} from "./client";
import type {
  AttendanceEvent,
  AttendanceRecord,
  AttendanceRow,
  AttendanceSummary,
  Camera,
  CameraInput,
  CameraListItem,
  CameraTestResult,
  CameraTestUrlRequest,
  CameraUpdate,
  Employee,
  EmployeeInput,
  EmployeeUpdate,
  FaceUploadResponse,
  HealthStatus,
  LeaveInput,
  LeaveRequest,
  LeaveReviewInput,
  Page,
  TokenOut,
  UserInput,
  UserOut,
  UserUpdate,
} from "./types";

// Auth
export async function login(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<TokenOut> {
  return request<TokenOut>("/auth/login", {
    method: "POST",
    form: { username, password },
    auth: false,
    signal,
  });
}

export async function fetchMe(signal?: AbortSignal): Promise<UserOut> {
  return request<UserOut>("/auth/me", { signal });
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return request<HealthStatus>("/health", { signal });
}

// Attendance
export interface AttendanceDateFilter {
  kind: "day" | "range";
  day?: string;
  start?: string;
  end?: string;
}

export interface AttendanceQuery {
  date?: AttendanceDateFilter;
  employeeCode?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function fetchAttendance(
  query: AttendanceQuery,
  signal?: AbortSignal,
): Promise<Page<AttendanceRow>> {
  const day = query.date?.kind === "day" ? query.date.day : undefined;
  const start = query.date?.kind === "range" ? query.date.start : undefined;
  const end = query.date?.kind === "range" ? query.date.end : undefined;

  return request<Page<AttendanceRow>>("/attendance", {
    query: {
      day,
      start,
      end,
      employee_code: query.employeeCode,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  });
}

export async function fetchAttendanceSummary(
  day?: string,
  signal?: AbortSignal,
): Promise<AttendanceSummary> {
  return request<AttendanceSummary>("/attendance/summary", {
    query: { day },
    signal,
  });
}

// Employees
export async function fetchEmployees(
  params: { q?: string; active?: boolean; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<Page<Employee>> {
  return request<Page<Employee>>("/employees", {
    query: {
      q: params.q,
      active: params.active,
      limit: params.limit,
      offset: params.offset,
    },
    signal,
  });
}

export async function fetchEmployee(
  code: string,
  signal?: AbortSignal,
): Promise<Employee> {
  return request<Employee>(`/employees/${pathSegment(code)}`, { signal });
}

export async function createEmployee(
  body: EmployeeInput,
  signal?: AbortSignal,
): Promise<Employee> {
  return request<Employee>("/employees", {
    method: "POST",
    json: body,
    signal,
  });
}

export async function updateEmployee(
  code: string,
  body: EmployeeUpdate,
  signal?: AbortSignal,
): Promise<Employee> {
  return request<Employee>(`/employees/${pathSegment(code)}`, {
    method: "PATCH",
    json: body,
    signal,
  });
}

export async function deleteEmployee(
  code: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestVoid(`/employees/${pathSegment(code)}`, {
    method: "DELETE",
    signal,
  });
}

export async function uploadFace(
  code: string,
  file: File,
  signal?: AbortSignal,
): Promise<FaceUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<FaceUploadResponse>(`/employees/${pathSegment(code)}/face`, {
    method: "POST",
    formData,
    signal,
  });
}

export async function fetchEmployeeAttendance(
  code: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<AttendanceRecord[]> {
  const res = await request<Page<AttendanceRow>>("/attendance", {
    query: {
      employee_code: code,
      start,
      end,
      limit: 100,
    },
    signal,
  });
  return (res?.items ?? []).map((row, idx) => ({
    id: `${row.employee_code}-${row.day}-${idx}`,
    employee_code: row.employee_code,
    day: row.day,
    check_in: row.check_in,
    check_out: row.check_out,
    status: row.status,
    minutes_late: row.minutes_late,
    dwell_seconds: row.dwell_seconds,
    updated_at: "",
  }));
}

// Events
export interface EventQuery {
  since?: Date | string;
  cameraId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export async function fetchEvents(
  query: EventQuery,
  signal?: AbortSignal,
): Promise<Page<AttendanceEvent>> {
  const sinceStr =
    query.since instanceof Date ? query.since.toISOString() : query.since;
  return request<Page<AttendanceEvent>>("/events", {
    query: {
      since: sinceStr,
      camera_id: query.cameraId,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    },
    signal,
  });
}

export async function fetchEventCameras(
  signal?: AbortSignal,
): Promise<CameraListItem[]> {
  return request<CameraListItem[]>("/events/cameras/list", { signal });
}

// Cameras
export async function fetchCameras(
  enabledOnly?: boolean,
  signal?: AbortSignal,
): Promise<Camera[]> {
  return request<Camera[]>("/cameras", {
    query: { enabled_only: enabledOnly },
    signal,
  });
}

export async function createCamera(
  body: CameraInput,
  signal?: AbortSignal,
): Promise<Camera> {
  return request<Camera>("/cameras", {
    method: "POST",
    json: body,
    signal,
  });
}

export async function updateCamera(
  id: string,
  body: CameraUpdate,
  signal?: AbortSignal,
): Promise<Camera> {
  return request<Camera>(`/cameras/${pathSegment(id)}`, {
    method: "PATCH",
    json: body,
    signal,
  });
}

export async function deleteCamera(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestVoid(`/cameras/${pathSegment(id)}`, {
    method: "DELETE",
    signal,
  });
}

export async function testCamera(
  id: string,
  signal?: AbortSignal,
): Promise<CameraTestResult> {
  return request<CameraTestResult>(`/cameras/${pathSegment(id)}/test`, {
    method: "POST",
    signal,
  });
}

export async function testCameraUrl(
  body: CameraTestUrlRequest,
  signal?: AbortSignal,
): Promise<CameraTestResult> {
  return request<CameraTestResult>("/cameras/test-url", {
    method: "POST",
    json: body,
    signal,
  });
}

export async function fetchCameraSnapshot(
  id: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(`/cameras/${pathSegment(id)}/snapshot`, { signal });
}

// Leaves
export async function fetchLeaves(
  params: {
    status?: string;
    employee_code?: string;
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
): Promise<Page<LeaveRequest>> {
  return request<Page<LeaveRequest>>("/leaves", {
    query: {
      status: params.status,
      employee_code: params.employee_code,
      start: params.start,
      end: params.end,
      limit: params.limit,
      offset: params.offset,
    },
    signal,
  });
}

export async function createLeave(
  body: LeaveInput,
  signal?: AbortSignal,
): Promise<LeaveRequest> {
  return request<LeaveRequest>("/leaves", {
    method: "POST",
    json: body,
    signal,
  });
}

export async function reviewLeave(
  id: string,
  body: LeaveReviewInput,
  signal?: AbortSignal,
): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${pathSegment(id)}/review`, {
    method: "PATCH",
    json: body,
    signal,
  });
}

export async function cancelLeave(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestVoid(`/leaves/${pathSegment(id)}`, {
    method: "DELETE",
    signal,
  });
}

// Users
export async function fetchUsers(
  params: { active?: boolean; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<Page<UserOut>> {
  return request<Page<UserOut>>("/users", {
    query: {
      active: params.active,
      limit: params.limit,
      offset: params.offset,
    },
    signal,
  });
}

export async function createUser(
  body: UserInput,
  signal?: AbortSignal,
): Promise<UserOut> {
  return request<UserOut>("/users", {
    method: "POST",
    json: body,
    signal,
  });
}

export async function updateUser(
  username: string,
  body: UserUpdate,
  signal?: AbortSignal,
): Promise<UserOut> {
  return request<UserOut>(`/users/${pathSegment(username)}`, {
    method: "PATCH",
    json: body,
    signal,
  });
}

export async function deactivateUser(
  username: string,
  signal?: AbortSignal,
): Promise<void> {
  return requestVoid(`/users/${pathSegment(username)}`, {
    method: "DELETE",
    signal,
  });
}
