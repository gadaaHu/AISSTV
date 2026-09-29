import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AttendanceEvent, Camera, Page } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";

export function Events() {
  const [items, setItems] = useState<AttendanceEvent[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [camera, setCamera] = useState("");
  const [type, setType] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (camera) params.set("camera_id", camera);
      if (type) params.set("type", type);
      const data = await api.get<Page<AttendanceEvent>>("/events?" + params);
      setItems(data.items);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }

  async function loadCameras() {
    try {
      const c = await api.get<Camera[]>("/cameras");
      setCameras(c);
    } catch {}
  }

  useEffect(() => {
    loadCameras();
  }, []);

  useEffect(() => {
    load();
    if (paused) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [camera, type, paused]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live events</h1>
          <p className="text-sm text-slate-500 mt-1">
            {items.length} event(s) · {paused ? "PAUSED" : "auto-refresh every 5s"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPaused(!paused)} className={"px-3 py-2 rounded-lg text-sm font-semibold " + (paused ? "bg-green-600 text-white" : "bg-white border border-slate-300")}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button onClick={load} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm" value={camera} onChange={(e) => setCamera(e.target.value)}>
          <option value="">All cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.name || c.id}</option>
          ))}
        </select>
        <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="ENTER">ENTER</option>
          <option value="LATE">LATE</option>
          <option value="EXIT">EXIT</option>
          <option value="EDGE_ONLINE">EDGE_ONLINE</option>
          <option value="EDGE_OFFLINE">EDGE_OFFLINE</option>
          <option value="EDGE_HEARTBEAT">EDGE_HEARTBEAT</option>
        </select>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5">Time</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-left px-4 py-2.5">Camera</th>
              <th className="text-left px-4 py-2.5">Zone</th>
              <th className="text-left px-4 py-2.5">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                  {new Date(e.ts).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2.5"><StatusBadge status={e.type} /></td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.employee_code ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.camera_id}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.zone ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {e.confidence != null ? e.confidence.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  No events in the last hour.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
