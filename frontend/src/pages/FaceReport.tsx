import { useMemo, useState } from "react";
import { Link } from "react-router";

import type {
  FraudFaceReportItem,
  KnownFaceReportItem,
  UnknownFaceReportItem,
} from "../api/types";
import { PageHeader } from "../components/PageHeader";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableMessage,
  TableRow,
} from "../components/ui";
import { useFaceReport24h } from "../hooks/queries/useFaceReport";
import { formatTime } from "../lib/dates";
import { formatPercent } from "../lib/format";
import { cn } from "../lib/utils";

type ReportTab = "known" | "unknown" | "fraud";

const WINDOW_OPTIONS = [
  { value: "12", label: "Past 12 Hours" },
  { value: "24", label: "Past 24 Hours (Default)" },
  { value: "48", label: "Past 48 Hours" },
  { value: "168", label: "Past 7 Days" },
];

export function FaceReport() {
  const [hoursStr, setHoursStr] = useState("24");
  const [activeTab, setActiveTab] = useState<ReportTab>("known");
  const [search, setSearch] = useState("");

  const hours = Number.parseInt(hoursStr, 10) || 24;
  const { data, isPending, error, refetch, isFetching } = useFaceReport24h(hours);

  const summary = data?.summary;
  const knownFaces = data?.known_faces ?? [];
  const unknownFaces = data?.new_unknown_faces ?? [];
  const fraudFaces = data?.fraudulent_faces ?? [];

  // Filtered lists
  const filteredKnown = useMemo(() => {
    if (!search.trim()) return knownFaces;
    const q = search.toLowerCase();
    return knownFaces.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.employee_code.toLowerCase().includes(q) ||
        (k.department && k.department.toLowerCase().includes(q)) ||
        k.latest_camera_id.toLowerCase().includes(q),
    );
  }, [knownFaces, search]);

  const filteredUnknown = useMemo(() => {
    if (!search.trim()) return unknownFaces;
    const q = search.toLowerCase();
    return unknownFaces.filter(
      (u) =>
        u.unknown_id.toLowerCase().includes(q) ||
        u.camera_id.toLowerCase().includes(q) ||
        (u.zone && u.zone.toLowerCase().includes(q)),
    );
  }, [unknownFaces, search]);

  const filteredFraud = useMemo(() => {
    if (!search.trim()) return fraudFaces;
    const q = search.toLowerCase();
    return fraudFaces.filter(
      (f) =>
        f.type.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        (f.employee_code && f.employee_code.toLowerCase().includes(q)) ||
        (f.camera_id && f.camera_id.toLowerCase().includes(q)),
    );
  }, [fraudFaces, search]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title="24-Hour Face Audit & Security Report"
        description="Comprehensive real-time report of recognized employees, new unknown faces, and fraudulent presentation attacks."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-52">
              <Select
                value={hoursStr}
                onChange={(e) => setHoursStr(e.target.value)}
              >
                {WINDOW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching}
              onClick={() => void refetch()}
              className="gap-1.5"
            >
              <Icon name="refresh" className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Known Faces */}
        <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Known Employees Seen
              </span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {isPending ? <Skeleton className="h-9 w-16" /> : (summary?.known_count ?? 0)}
              </span>
              <span className="text-xs text-emerald-600 font-medium dark:text-emerald-400">
                Recognized & Verified
              </span>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Icon name="employees" className="h-6 w-6" />
            </div>
          </div>
        </Card>

        {/* New Unknown Faces */}
        <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                New Unknown Faces
              </span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {isPending ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  (summary?.new_unknown_count ?? 0)
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  (summary?.new_unknown_count ?? 0) > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-400",
                )}
              >
                {(summary?.new_unknown_count ?? 0) > 0
                  ? "Requires Enrollment Review"
                  : "No Unenrolled Faces"}
              </span>
            </div>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl",
                (summary?.new_unknown_count ?? 0) > 0
                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              <Icon name="camera" className="h-6 w-6" />
            </div>
          </div>
        </Card>

        {/* Fraudulent Incidents */}
        <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Fraudulent / Spoofs
              </span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {isPending ? <Skeleton className="h-9 w-16" /> : (summary?.fraud_count ?? 0)}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  (summary?.fraud_count ?? 0) > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {(summary?.fraud_count ?? 0) > 0
                  ? "Security Incident Alert"
                  : "Zero Fraud Detected"}
              </span>
            </div>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl",
                (summary?.fraud_count ?? 0) > 0
                  ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
              )}
            >
              <Icon name="shield" className="h-6 w-6" />
            </div>
          </div>
        </Card>

        {/* Total Faces & Time Window */}
        <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Total Face Events
              </span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {isPending ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  (summary?.total_faces_seen ?? 0)
                )}
              </span>
              <span className="text-xs text-slate-500 font-medium dark:text-slate-400">
                Window: Past {hours} Hours
              </span>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Icon name="clock" className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Segmented Tab Navigation and Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("known")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "known"
                ? "bg-white text-gemini-blue shadow-sm dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon name="check" className="h-3.5 w-3.5" />
            Known Faces ({knownFaces.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("unknown")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "unknown"
                ? "bg-white text-gemini-blue shadow-sm dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon name="camera" className="h-3.5 w-3.5" />
            New Faces ({unknownFaces.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("fraud")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "fraud"
                ? "bg-white text-gemini-blue shadow-sm dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            )}
          >
            <Icon name="alert" className="h-3.5 w-3.5" />
            Fraudulent ({fraudFaces.length})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab} records…`}
            aria-label="Filter report records"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <ErrorState
          error={error}
          title="Could not load 24-hour face report"
          onRetry={() => void refetch()}
        />
      )}

      {/* Main Tab Content */}
      {!error && (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
          {/* TAB 1: KNOWN FACES */}
          {activeTab === "known" && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Employee</TableHeaderCell>
                  <TableHeaderCell>Department</TableHeaderCell>
                  <TableHeaderCell>First Seen</TableHeaderCell>
                  <TableHeaderCell>Last Seen</TableHeaderCell>
                  <TableHeaderCell>Camera / Zone</TableHeaderCell>
                  <TableHeaderCell>Confidence</TableHeaderCell>
                  <TableHeaderCell>Events</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isPending && (
                  <TableMessage>
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </TableMessage>
                )}
                {!isPending && filteredKnown.length === 0 && (
                  <TableMessage>
                    <EmptyState
                      title="No known employees seen"
                      description="No recognized face events recorded in this time window."
                    />
                  </TableMessage>
                )}
                {!isPending &&
                  filteredKnown.map((emp: KnownFaceReportItem) => (
                    <TableRow key={emp.employee_code}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} size="sm" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {emp.name}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {emp.employee_code}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {emp.department ?? "General"}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {formatTime(emp.first_seen)}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {formatTime(emp.last_seen)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                          {emp.latest_camera_id}
                        </span>
                        {emp.latest_zone && (
                          <span className="text-xs text-slate-500 block">
                            {emp.latest_zone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.round(emp.avg_confidence * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {formatPercent(emp.avg_confidence)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {emp.event_count}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          style={
                            emp.status === "late"
                              ? { label: "Late", tone: "warning" }
                              : { label: "Present", tone: "success" }
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          {/* TAB 2: NEW / UNKNOWN FACES */}
          {activeTab === "unknown" && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Face Cluster ID</TableHeaderCell>
                  <TableHeaderCell>First Detected</TableHeaderCell>
                  <TableHeaderCell>Last Seen</TableHeaderCell>
                  <TableHeaderCell>Camera / Zone</TableHeaderCell>
                  <TableHeaderCell>Dwell Time</TableHeaderCell>
                  <TableHeaderCell>Confidence</TableHeaderCell>
                  <TableHeaderCell className="text-right">Action</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isPending && (
                  <TableMessage>
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </TableMessage>
                )}
                {!isPending && filteredUnknown.length === 0 && (
                  <TableMessage>
                    <EmptyState
                      title="No new unknown faces"
                      description="All individuals captured in the past 24 hours are verified employees."
                    />
                  </TableMessage>
                )}
                {!isPending &&
                  filteredUnknown.map((unk: UnknownFaceReportItem) => (
                    <TableRow key={unk.unknown_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
                          <span className="font-mono font-medium text-slate-900 dark:text-white">
                            {unk.unknown_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {formatTime(unk.first_seen)}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {formatTime(unk.last_seen)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                          {unk.camera_id}
                        </span>
                        {unk.zone && (
                          <span className="text-xs text-slate-500 block">
                            {unk.zone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {unk.dwell_seconds > 0 ? `${unk.dwell_seconds}s` : "Passing"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {formatPercent(unk.confidence)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to="/employees"
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
                        >
                          <Icon name="plus" className="h-3 w-3" />
                          Enroll as Employee
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          {/* TAB 3: FRAUDULENT FACES */}
          {activeTab === "fraud" && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Severity & Type</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Implicated Employee</TableHeaderCell>
                  <TableHeaderCell>Camera / Zone</TableHeaderCell>
                  <TableHeaderCell>Occurred At</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isPending && (
                  <TableMessage>
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </TableMessage>
                )}
                {!isPending && filteredFraud.length === 0 && (
                  <TableMessage>
                    <EmptyState
                      title="No fraud detected"
                      description="No face spoofing, presentation attacks, or unauthorized access attempts occurred in this time window."
                    />
                  </TableMessage>
                )}
                {!isPending &&
                  filteredFraud.map((fr: FraudFaceReportItem) => (
                    <TableRow key={fr.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            style={
                              fr.severity === "critical"
                                ? { label: "Critical", tone: "danger" }
                                : fr.severity === "high"
                                  ? { label: "High", tone: "danger" }
                                  : { label: "Medium", tone: "warning" }
                            }
                          />
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {fr.type}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-700 dark:text-slate-300">
                        {fr.description ?? "Presentation attack / unauthorized face"}
                      </TableCell>
                      <TableCell>
                        {fr.employee_code ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {fr.employee_name ?? fr.employee_code}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {fr.employee_code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None / Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                          {fr.camera_id ?? "N/A"}
                        </span>
                        {fr.zone && (
                          <span className="text-xs text-slate-500 block">
                            {fr.zone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {formatTime(fr.occurred_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          style={
                            fr.status === "resolved"
                              ? { label: "Resolved", tone: "success" }
                              : fr.status === "dismissed"
                                ? { label: "Dismissed", tone: "neutral" }
                                : { label: "Open Alert", tone: "danger" }
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
