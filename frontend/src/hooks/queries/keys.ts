/**
 * Query-key factory.
 *
 * Keys are built here and nowhere else, so an invalidation always matches the
 * query it means to refresh. Parameters are plain objects; TanStack hashes them
 * deterministically, so identity does not matter.
 */

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },

  employees: {
    all: () => ["employees"] as const,
    list: (params: { q: string; active: boolean | undefined; limit: number; offset: number }) =>
      ["employees", "list", params] as const,
    detail: (code: string) => ["employees", "detail", code] as const,
  },

  attendance: {
    all: () => ["attendance"] as const,
    summary: (day: string | undefined) =>
      ["attendance", "summary", day ?? "today"] as const,
    list: (params: {
      day?: string;
      start?: string;
      end?: string;
      employeeCode?: string;
      status?: string;
      limit: number;
      offset: number;
    }) => ["attendance", "list", params] as const,
    history: (code: string) => ["attendance", "history", code] as const,
  },

  events: {
    all: () => ["events"] as const,
    list: (params: {
      sinceMs: number;
      cameraId: string | undefined;
      type: string | undefined;
      limit: number;
      offset: number;
    }) => ["events", "list", params] as const,
    cameras: () => ["events", "cameras"] as const,
  },

  cameras: {
    all: () => ["cameras"] as const,
    list: (enabledOnly: boolean) => ["cameras", "list", enabledOnly] as const,
  },

  leaves: {
    all: () => ["leaves"] as const,
    list: (params: {
      status: string | undefined;
      limit: number;
      offset: number;
    }) => ["leaves", "list", params] as const,
    pendingCount: () => ["leaves", "pending-count"] as const,
  },

  incidents: {
    all: () => ["incidents"] as const,
    list: (domain: string, params: { status: string | undefined; limit: number; offset: number }) =>
      ["incidents", domain, "list", params] as const,
    openCounts: () => ["incidents", "open-counts"] as const,
  },

  users: {
    all: () => ["users"] as const,
    list: (params: { active: boolean | undefined; limit: number; offset: number }) =>
      ["users", "list", params] as const,
  },

  health: () => ["health"] as const,
} as const;
