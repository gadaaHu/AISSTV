import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Camera, CameraFormData, CameraTestResult } from "../api/types";

const EMPTY: CameraFormData = {
  id: "", name: "", zone: "", site: "",
  url: "rtsp://",
  rtsp_transport: "tcp",
  username: "", password: "",
  enabled: true,
  fps_process: 3,
  detection_confidence: 0.45,
  face_threshold: 0.45,
  save_snapshots: false,
  tags: [], notes: "",
};

export function CameraModal({
  camera, onClose, onSaved,
}: {
  camera: Camera | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CameraFormData>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<CameraTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (camera) {
      setForm({
        id: camera.id, name: camera.name, zone: camera.zone,
        site: camera.site ?? "", url: camera.url,
        rtsp_transport: camera.rtsp_transport,
        username: camera.username ?? "", password: "",
        enabled: camera.enabled,
        fps_process: camera.fps_process,
        detection_confidence: camera.detection_confidence,
        face_threshold: camera.face_threshold,
        save_snapshots: camera.save_snapshots,
        tags: camera.tags, notes: camera.notes ?? "",
      });
    }
  }, [camera]);

  function set(key: keyof CameraFormData, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function runTest() {
    if (!form.url || form.url === "rtsp://") return;
    setTesting(true);
    setTest(null);
    try {
      const r = await api.post<CameraTestResult>("/cameras/test-url", {
        url: form.url,
        rtsp_transport: form.rtsp_transport,
      });
      setTest(r);
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : "Test failed",
        width: null, height: null, fps: null, codec: null, latency_ms: null });
    } finally {
      setTesting(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) return;
    set("tags", [...form.tags, t]);
    setTagInput("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload: any = {
        ...form,
        site: form.site || null,
        username: form.username || null,
        password: form.password || null,
        notes: form.notes || null,
      };
      if (camera) {
        const { id, password, ...rest } = payload;
        const upd: any = { ...rest };
        if (!password) delete upd.password;
        await api.patch("/cameras/" + camera.id, upd);
      } else {
        await api.post("/cameras", payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>

        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">
            {camera ? "Edit " + (camera.name || camera.id) : "Add camera"}
          </h2>
        </div>

        <div className="p-6 space-y-6">

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Camera ID" hint="unique">
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  value={form.id}
                  onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  disabled={!!camera}
                  placeholder="cam-01" required />
              </Field>
              <Field label="Name">
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Front entrance" />
              </Field>
              <Field label="Zone">
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.zone}
                  onChange={(e) => set("zone", e.target.value)}
                  placeholder="main-entrance" required />
              </Field>
              <Field label="Site">
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.site}
                  onChange={(e) => set("site", e.target.value)}
                  placeholder="hq" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Connection</h3>
            <Field label="Stream URL" hint="rtsp:// or http://">
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="rtsp://admin:pass@192.168.1.100:554/mjpeg"
                required />
            </Field>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <Field label="Transport">
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.rtsp_transport}
                  onChange={(e) => set("rtsp_transport", e.target.value)}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </Field>
              <Field label="Username (optional)">
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)} />
              </Field>
              <Field label="Password (optional)">
                <input type="password" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={camera ? "(unchanged)" : ""} />
              </Field>
            </div>

            <div className="mt-4 flex gap-3 items-center flex-wrap">
              <button type="button" onClick={runTest}
                disabled={testing || !form.url || form.url === "rtsp://"}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-slate-700">
                {testing ? "Testing..." : "Test connection"}
              </button>
              {test && (
                <div className={"text-xs px-3 py-2 rounded-lg flex-1 min-w-[200px] " + (test.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
                  {test.ok
                    ? "✓ " + test.message + " · " + test.width + "×" + test.height + " · " + test.fps + "fps · " + test.codec + " · " + test.latency_ms + "ms"
                    : "✗ " + test.message}
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Processing</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="FPS (1-15)">
                <input type="number" min={1} max={15} step={0.5}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.fps_process}
                  onChange={(e) => set("fps_process", parseFloat(e.target.value))} />
              </Field>
              <Field label="Detector confidence">
                <input type="number" min={0.1} max={1} step={0.05}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.detection_confidence}
                  onChange={(e) => set("detection_confidence", parseFloat(e.target.value))} />
              </Field>
              <Field label="Face threshold">
                <input type="number" min={0.2} max={0.9} step={0.05}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={form.face_threshold}
                  onChange={(e) => set("face_threshold", parseFloat(e.target.value))} />
              </Field>
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm">
              <input type="checkbox" checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)} />
              Enabled
            </label>
            <label className="flex items-center gap-2 mt-2 text-sm">
              <input type="checkbox" checked={form.save_snapshots}
                onChange={(e) => set("save_snapshots", e.target.checked)} />
              Save snapshots on events
            </label>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Tags &amp; notes</h3>
            <div className="flex gap-2 mb-2">
              <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Add tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
              <button type="button" onClick={addTag}
                className="px-3 py-2 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">Add</button>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              {form.tags.map((t) => (
                <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full flex items-center gap-1">
                  {t}
                  <button type="button" onClick={() => set("tags", form.tags.filter((x) => x !== t))}
                    className="text-blue-400 hover:text-blue-700">×</button>
                </span>
              ))}
            </div>
            <Field label="Notes">
              <textarea rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </section>

          {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <div className="p-6 border-t border-slate-200 sticky bottom-0 bg-white flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-blue-700">
            {busy ? "Saving..." : camera ? "Save changes" : "Add camera"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {hint && <span className="text-slate-400 ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
