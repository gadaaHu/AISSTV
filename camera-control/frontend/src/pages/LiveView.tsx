import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer";

interface Camera {
  id: string;
  name: string;
  zone: string | null;
  active: boolean;
}

export default function LiveView() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [streams, setStreams] = useState<Record<string, string>>({});

  async function loadCameras() {
    const r = await fetch("/api/cameras");
    const data = await r.json();
    setCameras(data);
  }

  async function startAll() {
    for (const c of cameras) {
      try {
        const r = await fetch(/api/streams//start, { method: "POST" });
        const data = await r.json();
        setStreams((s) => ({ ...s, [c.id]: /streams }));
      } catch {}
    }
  }

  useEffect(() => { loadCameras(); }, []);
  useEffect(() => { if (cameras.length && Object.keys(streams).length === 0) startAll(); }, [cameras]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">SSTV Live View</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/live" className="text-blue-400">Live</Link>
          <Link to="/cameras" className="hover:text-blue-400">Cameras</Link>
          <Link to="/recordings" className="hover:text-blue-400">Recordings</Link>
        </nav>
      </header>

      {cameras.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          No cameras registered. Go to <Link to="/cameras" className="text-blue-400">Cameras</Link> to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((c) => (
            <div key={c.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              <div className="aspect-video bg-black">
                {streams[c.id] ? (
                  <VideoPlayer src={streams[c.id]} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-500">
                    Starting stream…
                  </div>
                )}
              </div>
              <div className="p-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.zone ?? "—"}</div>
                </div>
                <Link
                  to={/cameras/}
                  className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg"
                >
                  Control
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}