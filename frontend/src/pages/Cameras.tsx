import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Camera, CameraTestResult } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { CameraModal } from "../components/CameraModal";
import { CameraPreview } from "../components/CameraPreview";

export function Cameras() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";

  const [items, setItems] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [preview, setPreview] = useState<Camera | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, CameraTestResult>>({});

  async function load() {
    try {
      const data = await api.get<Camera[]>("/cameras");
      setItems(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  async function testCamera(cam: Camera) {
    setTesting(cam.id);
    try {
      const r = await api.post<CameraTestResult>("/cameras/" + cam.id + "/test");
      setTestResult((p) => ({ ...p, [cam.id]: r }));
    } catch (e) {
      setTestResult((p) => ({
        ...p,
        [cam.id]: { ok: false, message: e instanceof Error ? e.message : "Test failed", width: null, height: null, fps: null, codec: null, latency_ms: null },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function toggleEnabled(cam: Camera) {
    try {
      await api.patch("/cameras/" + cam.id, { enabled: !cam.enabled });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function removeCamera(cam: Camera) {
    if (!confirm("Remove camera " + (cam.name || cam.id) + "?")) return;
    try {
      await api.del("/cameras/" + cam.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cameras</h1>
          <p className="text-sm text-slate-500 mt-1">
            {items.length} configured · {items.filter((c) => c.online).length} online
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700"
          >
            + Add camera
          </button>
        )}
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>
      )}

      {loading ? (
        <div className="text-slate-500">Loading cameras...</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">◐</div>
          <div className="font-semibold">No cameras configured</div>
          <div className="text-sm text-slate-500 mt-1 mb-4">Add your first camera to start receiving events.</div>
          {canEdit && (
            <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              + Add camera
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((cam) => {
            const tr = testResult[cam.id];
            return (
              <div key={cam.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={"w-2.5 h-2.5 rounded-full " + (cam.online ? "bg-green-500" : "bg-slate-300")} />
                      <span className="font-bold">{cam.name || cam.id}</span>
                      <span className="text-xs text-slate-400 font-mono">{cam.id}</span>
                      {!cam.enabled && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">disabled</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{cam.zone} · {cam.site ?? "no site"}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1 truncate">{cam.url}</div>
                    {cam.tags.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {cam.tags.map((t) => (
                          <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                    {tr && (
                      <div className={"mt-3 text-xs px-3 py-2 rounded-lg " + (tr.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
                        {tr.ok
                          ? "✓ " + tr.message + " · " + tr.width + "×" + tr.height + " · " + tr.fps + "fps · " + tr.codec + " · " + tr.latency_ms + "ms"
                          : "✗ " + tr.message}
                      </div>
                    )}
                    {cam.last_seen_at && (
                      <div className="text-xs text-slate-400 mt-2">
                        Last seen {new Date(cam.last_seen_at).toLocaleString()}
                        {cam.last_error && " · error: " + cam.last_error}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <StatusBadge status={cam.online ? "present" : "absent"} />
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <button onClick={() => setPreview(cam)} className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
                        Preview
                      </button>
                      <button onClick={() => testCamera(cam)} disabled={testing === cam.id} className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                        {testing === cam.id ? "Testing..." : "Test"}
                      </button>
                      {canEdit && (
                        <>
                          <button onClick={() => toggleEnabled(cam)} className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
                            {cam.enabled ? "Disable" : "Enable"}
                          </button>
                          <button onClick={() => setEditing(cam)} className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
                            Edit
                          </button>
                          <button onClick={() => removeCamera(cam)} className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showNew || editing) && (
        <CameraModal
          camera={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={async () => { setShowNew(false); setEditing(null); await load(); }}
        />
      )}

      {preview && <CameraPreview camera={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
