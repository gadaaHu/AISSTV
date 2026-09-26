import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import VideoPlayer from "../components/VideoPlayer";
import PTZJoystick from "../components/PTZJoystick";

export default function CameraControl() {
  const { id } = useParams<{ id: string }>();
  const [camera, setCamera] = useState<any>(null);
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [presets, setPresets] = useState<any[]>([]);

  async function load() {
    if (!id) return;
    const [c, s, p] = await Promise.all([
      fetch(/api/cameras/).then((r) => r.json()),
      fetch(/api/streams//start, { method: "POST" }).then((r) => r.json()),
      fetch(/api/ptz//presets).then((r) => r.json()),
    ]);
    setCamera(c);
    setStreamUrl(/streams);
    setPresets(p);
  }

  useEffect(() => { load(); }, [id]);

  async function ptz(dir: string) {
    await fetch(/api/ptz//move, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: dir, speed: 0.5 }),
    });
  }

  async function savePreset() {
    const name = prompt("Preset name:");
    if (!name) return;
    await fetch(/api/ptz//presets, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function gotoPreset(presetId: string) {
    await fetch(/api/ptz//presets//goto, { method: "POST" });
  }

  if (!camera) return <div className="p-8 text-slate-100">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{camera.name}</h1>
          <div className="text-xs text-slate-400 font-mono">{camera.ip}</div>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link to="/live" className="hover:text-blue-400">Live</Link>
          <Link to="/cameras" className="hover:text-blue-400">Cameras</Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-black rounded-xl overflow-hidden border border-slate-700">
          {streamUrl && <VideoPlayer src={streamUrl} className="w-full aspect-video object-contain" />}
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <h3 className="font-semibold mb-3">PTZ Control</h3>
            <PTZJoystick cameraId={id!} onCommand={ptz} />
          </div>

          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Presets</h3>
              <button onClick={savePreset} className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded">
                Save current
              </button>
            </div>
            {presets.length === 0 ? (
              <div className="text-xs text-slate-400">No presets yet</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => gotoPreset(p.id)}
                    className="bg-slate-700 hover:bg-slate-600 text-xs py-2 rounded"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}