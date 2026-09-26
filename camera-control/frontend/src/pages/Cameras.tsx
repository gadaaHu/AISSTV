import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Camera {
  id: string;
  name: string;
  ip: string;
  vendor: string | null;
  model: string | null;
  has_ptz: boolean;
  active: boolean;
}

export default function Cameras() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [found, setFound] = useState<any[]>([]);

  async function load() {
    const r = await fetch("/api/cameras");
    setCameras(await r.json());
  }

  async function discover() {
    setDiscovering(true);
    try {
      const r = await fetch("/api/cameras/discover");
      const data = await r.json();
      setFound(data);
    } finally {
      setDiscovering(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/live" className="hover:text-blue-400">Live</Link>
          <Link to="/cameras" className="text-blue-400">Cameras</Link>
          <Link to="/recordings" className="hover:text-blue-400">Recordings</Link>
        </nav>
      </header>

      <div className="mb-6">
        <button
          onClick={discover}
          disabled={discovering}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {discovering ? "Searching…" : "Discover cameras on network"}
        </button>
        {found.length > 0 && (
          <div className="mt-4 bg-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Found {found.length} device(s):</h3>
            <ul className="text-sm space-y-1">
              {found.map((f, i) => (
                <li key={i} className="font-mono text-xs">{f.xaddr}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cameras.map((c) => (
          <div key={c.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-slate-400 font-mono">{c.ip}</div>
                <div className="text-xs text-slate-400">{c.vendor} {c.model}</div>
              </div>
              <span className={	ext-xs px-2 py-1 rounded }>
                {c.active ? "active" : "offline"}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <Link to={/cameras/} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg">
                Control
              </Link>
              {c.has_ptz && <span className="text-xs text-blue-400 self-center">PTZ ✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}