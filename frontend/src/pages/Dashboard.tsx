import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type {
  AttendanceRow, AttendanceSummary, Camera, Page,
} from "../api/types";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";

export function Dashboard() {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, r, c] = await Promise.all([
        api.get<AttendanceSummary>("/attendance/summary"),
        api.get<Page<AttendanceRow>>("/attendance?limit=10"),
        api.get<Camera[]>("/cameras"),
      ]);
      setSummary(s);
      setRows(r.items);
      setCameras(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="text-slate-500">Loading dashboard...</div>;
  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  const onlineCameras = cameras.filter((c) => c.online).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {summary?.day} · {cameras.length} cameras ({onlineCameras} online)
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <KpiCard label="Present" value={summary.present} tone="green" />
          <KpiCard label="Late" value={summary.late} tone="amber" />
          <KpiCard label="Absent" value={summary.absent} tone="red" />
          <KpiCard label="On leave" value={summary.on_leave} tone="indigo" />
          <KpiCard label="Still in" value={summary.still_in} />
          <KpiCard label="Total" value={summary.total_employees} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link to="/cameras" className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase text-slate-500 font-semibold">
              Cameras
            </span>
            <span className="text-2xl">◐</span>
          </div>
          <div className="text-2xl font-bold">
            {onlineCameras} <span className="text-sm text-slate-400 font-normal">/ {cameras.length} online</span>
          </div>
          <div className="text-xs text-blue-600 mt-2">Manage cameras →</div>
        </Link>

        <Link to="/leaves" className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase text-slate-500 font-semibold">
              Leaves
            </span>
            <span className="text-2xl">▤</span>
          </div>
          <div className="text-2xl font-bold">
            {summary?.on_leave ?? 0} <span className="text-sm text-slate-400 font-normal">today</span>
          </div>
          <div className="text-xs text-blue-600 mt-2">Manage leaves →</div>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-semibold">Recent attendance</h2>
          <Link to="/events" className="text-xs text-blue-600 hover:underline">
            View all events →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-left px-4 py-2.5">Department</th>
              <th className="text-left px-4 py-2.5">Check-in</th>
              <th className="text-left px-4 py-2.5">Check-out</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_code + r.day} className="border-t border-slate-100">
                <td className="px-4 py-2.5">
                  <div className="font-semibold">{r.employee_name}</div>
                  <div className="text-xs text-slate-500">{r.employee_code}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.department ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400">
                  No attendance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
