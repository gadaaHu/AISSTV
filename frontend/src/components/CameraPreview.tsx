import { useEffect, useState } from "react";
import { getToken } from "../api/client";
import type { Camera } from "../api/types";

export function CameraPreview({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const [ts, setTs] = useState(Date.now());
  const [error, setError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const token = getToken() ?? "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/cameras/" + camera.id + "/snapshot?t=" + ts, {
          headers: { Authorization: "Bearer " + token },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        if (cancelled) return;
        setBlobUrl(URL.createObjectURL(blob));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ts, camera.id, token]);

  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <div>
            <div className="font-bold">{camera.name || camera.id}</div>
            <div className="text-xs text-slate-500">{camera.zone} · {camera.url}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">&times;</button>
        </div>
        <div className="bg-black flex items-center justify-center" style={{ minHeight: 400 }}>
          {error ? (
            <div className="text-white p-8 text-center">
              <div className="text-4xl mb-2">📷</div>
              <div>Cannot reach camera</div>
              <div className="text-xs text-slate-400 mt-2">Check URL, credentials, and network</div>
            </div>
          ) : blobUrl ? (
            <img src={blobUrl} alt="preview" className="max-w-full max-h-[70vh]" />
          ) : (
            <div className="text-white text-sm p-8">Loading snapshot...</div>
          )}
        </div>
        <div className="p-3 text-xs text-slate-500 text-center border-t border-slate-200">
          Refreshes every 2s · Press Esc to close
        </div>
      </div>
    </div>
  );
}
