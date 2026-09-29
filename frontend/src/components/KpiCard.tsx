interface Props {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "amber" | "red" | "indigo";
}

const TONE: Record<string, string> = {
  default: "text-slate-900",
  green: "text-green-600",
  amber: "text-amber-600",
  red: "text-red-600",
  indigo: "text-indigo-600",
};

export function KpiCard({ label, value, tone = "default" }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className={"text-3xl font-bold mt-1 " + TONE[tone]}>
        {value}
      </div>
    </div>
  );
}
