import { useState } from "react";

interface Props {
  cameraId: string;
  onCommand: (direction: string) => void;
}

export default function PTZJoystick({ cameraId, onCommand }: Props) {
  const [pressed, setPressed] = useState<string | null>(null);

  const start = (dir: string) => {
    setPressed(dir);
    onCommand(dir);
  };
  const stop = () => {
    setPressed(null);
    onCommand("stop");
  };

  const btn = (dir: string, label: string, cls: string) => (
    <button
      className={w-14 h-14 rounded-full text-2xl font-bold  }
      onMouseDown={() => start(dir)}
      onMouseUp={stop}
      onMouseLeave={() => pressed === dir && stop()}
      onTouchStart={(e) => { e.preventDefault(); start(dir); }}
      onTouchEnd={(e) => { e.preventDefault(); stop(); }}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-3 gap-2 place-items-center">
      <div />
      {btn("up", "▲", "bg-slate-700 hover:bg-slate-600")}
      <div />
      {btn("left", "◄", "bg-slate-700 hover:bg-slate-600")}
      <button
        className="w-14 h-14 rounded-full bg-red-700 text-xs font-bold"
        onClick={stop}
      >
        STOP
      </button>
      {btn("right", "►", "bg-slate-700 hover:bg-slate-600")}
      <div />
      {btn("down", "▼", "bg-slate-700 hover:bg-slate-600")}
      <div />
      <div className="col-span-3 flex gap-2 mt-2">
        {btn("zoomin", "＋", "bg-blue-700 hover:bg-blue-600 text-base")}
        {btn("zoomout", "−", "bg-blue-700 hover:bg-blue-600 text-base")}
      </div>
    </div>
  );
}