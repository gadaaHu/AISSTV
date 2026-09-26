import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function Recordings() {
  const [recordings, setRecordings] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/recordings").then((r) => r.json()).then(setRecordings);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Recordings</h1>
        <nav className="flex gap-4 text-sm">
          <Link to="/live" className="hover:text-blue-400">Live</Link>
          <Link to="/cameras" className="hover:text-blue-400">Cameras</Link>
          <Link to="/recordings" className="text-blue-400">Recordings</Link>
        </nav>
      </header>

      {recordings.length === 0 ? (
        <div className="text-center py-20 text-slate-400">No recordings yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((r) => (
            <div key={r.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="font-semibold text-sm">Camera: {r.camera_id}</div>
              <div className="text-xs text-slate-400">{new Date(r.start_at).toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">{r.trigger} · {r.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}