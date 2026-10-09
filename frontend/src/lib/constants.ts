import type { UserOut } from "../api/types";

// ── Pagination ──────────────────────────────────────────────────────────────
export const PAGE_SIZE = {
  default: 25,
  employees: 25,
  events: 25,
  leaves: 25,
  users: 25,
  attendance: 50,
} as const;

// ── Polling / cache ──────────────────────────────────────────────────────────
export const POLL_INTERVAL_MS = 30_000;
export const STALE_TIME_MS = 15_000;

// ── Status style shape ───────────────────────────────────────────────────────
export type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

export interface StatusStyle {
  label: string;
  tone: Tone;
}

// ── Attendance styles ────────────────────────────────────────────────────────
export function attendanceStyle(status: string | null | undefined): StatusStyle {
  switch (status) {
    case "present":      return { label: "Present",     tone: "success" };
    case "late":         return { label: "Late",        tone: "warning" };
    case "absent":       return { label: "Absent",      tone: "danger"  };
    case "leave":        return { label: "On leave",    tone: "info"    };
    case "holiday":      return { label: "Holiday",     tone: "neutral" };
    case "half_day":     return { label: "Half day",    tone: "warning" };
    default:             return { label: status ?? "—", tone: "neutral" };
  }
}

// ── Role helpers ─────────────────────────────────────────────────────────────
export function isAdmin(user: UserOut | string | null | undefined): boolean {
  if (!user) return false;
  const role = typeof user === "string" ? user : user.role;
  return role === "admin";
}

export function canReview(user: UserOut | string | null | undefined): boolean {
  if (!user) return false;
  const role = typeof user === "string" ? user : user.role;
  return role === "admin" || role === "authorizor";
}

export function roleStyle(role: string | null | undefined): StatusStyle {
  switch (role) {
    case "admin":       return { label: "Admin",        tone: "brand"   };
    case "authorizor":  return { label: "Authoriser",   tone: "info"    };
    case "viewer":      return { label: "Viewer",       tone: "neutral" };
    default:            return { label: role ?? "—",    tone: "neutral" };
  }
}

// ── Camera styles ────────────────────────────────────────────────────────────
export function cameraStyle(state: string | boolean | null | undefined): StatusStyle {
  if (state === true || state === "online") return { label: "Online", tone: "success" };
  if (state === false || state === "offline") return { label: "Offline", tone: "danger" };
  if (state === "degraded") return { label: "Degraded", tone: "warning" };
  return { label: typeof state === "string" ? state : "—", tone: "neutral" };
}

export const CAMERA_ID_PATTERN = /^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/;

export const RTSP_TRANSPORTS = ["tcp", "udp", "http"] as const;

// ── Event styles ─────────────────────────────────────────────────────────────
export function eventStyle(type: string | null | undefined): StatusStyle {
  switch (type) {
    case "face_recognised":   return { label: "Recognised",   tone: "success" };
    case "face_unknown":      return { label: "Unknown face", tone: "warning" };
    case "motion":            return { label: "Motion",       tone: "info"    };
    case "tamper":            return { label: "Tamper",       tone: "danger"  };
    case "door_open":         return { label: "Door open",    tone: "neutral" };
    case "door_closed":       return { label: "Door closed",  tone: "neutral" };
    default:                  return { label: type ?? "—",    tone: "neutral" };
  }
}

export const EVENT_TYPE_OPTIONS = [
  { value: "",                label: "All types"     },
  { value: "face_recognised", label: "Recognised"    },
  { value: "face_unknown",    label: "Unknown face"  },
  { value: "motion",          label: "Motion"        },
  { value: "tamper",          label: "Tamper"        },
];

export const DEFAULT_EVENT_WINDOW = "1h";

export const EVENT_WINDOWS = [
  { value: "15m",  label: "Last 15 min", minutes: 15    },
  { value: "1h",   label: "Last hour",   minutes: 60    },
  { value: "6h",   label: "Last 6 h",    minutes: 360   },
  { value: "24h",  label: "Last 24 h",   minutes: 1440  },
  { value: "7d",   label: "Last 7 days", minutes: 10080 },
] as const;

// ── Leave styles ─────────────────────────────────────────────────────────────
export function leaveStyle(status: string | null | undefined): StatusStyle {
  switch (status) {
    case "pending":   return { label: "Pending",  tone: "warning" };
    case "approved":  return { label: "Approved", tone: "success" };
    case "rejected":  return { label: "Rejected", tone: "danger"  };
    case "cancelled": return { label: "Cancelled",tone: "neutral" };
    default:          return { label: status ?? "—", tone: "neutral" };
  }
}

export const LEAVE_STATUS_OPTIONS = [
  { value: "",          label: "All statuses" },
  { value: "pending",   label: "Pending"      },
  { value: "approved",  label: "Approved"     },
  { value: "rejected",  label: "Rejected"     },
  { value: "cancelled", label: "Cancelled"    },
];

export const LEAVE_TYPES = [
  "annual",
  "sick",
  "maternity",
  "paternity",
  "unpaid",
  "other",
] as const;
