const CLASSES: Record<string, string> = {
  present: "bg-green-100 text-green-800",
  late: "bg-amber-100 text-amber-800",
  absent: "bg-red-100 text-red-800",
  leave: "bg-indigo-100 text-indigo-800",
  holiday: "bg-purple-100 text-purple-800",
  half_day: "bg-fuchsia-100 text-fuchsia-800",
  ENTER: "bg-green-100 text-green-800",
  EMPLOYEE_ENTER: "bg-green-100 text-green-800",
  EXIT: "bg-slate-100 text-slate-700",
  EMPLOYEE_EXIT: "bg-slate-100 text-slate-700",
  LATE: "bg-amber-100 text-amber-800",
  UNKNOWN: "bg-red-100 text-red-800",
  EDGE_ONLINE: "bg-green-100 text-green-800",
  EDGE_OFFLINE: "bg-red-100 text-red-800",
  EDGE_HEARTBEAT: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = CLASSES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold " + cls}>
      {status}
    </span>
  );
}
